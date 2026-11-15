CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'CareSync member' CHECK (length(display_name) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can create their own account profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Members can update their own account profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE FUNCTION public.create_caresync_account_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NULLIF(left(trim(NEW.raw_user_meta_data ->> 'full_name'), 120), ''), NULLIF(split_part(NEW.email, '@', 1), ''), 'CareSync member'))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_caresync_account_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER caresync_create_account_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_caresync_account_profile();

CREATE TABLE public.healthcare_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  date_of_birth DATE,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.healthcare_profiles TO authenticated;
GRANT ALL ON public.healthcare_profiles TO service_role;
ALTER TABLE public.healthcare_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can create their own healthcare profile" ON public.healthcare_profiles FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE TABLE public.profile_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  healthcare_profile_id UUID NOT NULL REFERENCES public.healthcare_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('elderly', 'family_admin', 'caregiver')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (healthcare_profile_id, user_id)
);
GRANT SELECT, DELETE ON public.profile_memberships TO authenticated;
GRANT ALL ON public.profile_memberships TO service_role;
ALTER TABLE public.profile_memberships ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.caresync_has_profile_role(_profile_id UUID, _roles TEXT[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profile_memberships pm
    WHERE pm.healthcare_profile_id = _profile_id AND pm.user_id = auth.uid() AND pm.role = ANY(_roles)
  );
$$;
REVOKE ALL ON FUNCTION public.caresync_has_profile_role(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caresync_has_profile_role(UUID, TEXT[]) TO authenticated;
CREATE POLICY "Members can read their own and connected member account profiles" ON public.profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.profile_memberships pm
  WHERE pm.user_id = profiles.user_id
    AND public.caresync_has_profile_role(pm.healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver'])
));
CREATE POLICY "Members can view their own or managed CareCircle memberships" ON public.profile_memberships FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin']));
CREATE POLICY "Owners and family administrators can revoke Circle membership" ON public.profile_memberships FOR DELETE TO authenticated
USING (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin']) AND user_id <> auth.uid());
CREATE POLICY "Approved members can view their healthcare profiles" ON public.healthcare_profiles FOR SELECT TO authenticated
USING (public.caresync_has_profile_role(id, ARRAY['elderly', 'family_admin', 'caregiver']));
CREATE POLICY "Owners and family administrators can update a healthcare profile" ON public.healthcare_profiles FOR UPDATE TO authenticated
USING (public.caresync_has_profile_role(id, ARRAY['elderly', 'family_admin']))
WITH CHECK (public.caresync_has_profile_role(id, ARRAY['elderly', 'family_admin']));
CREATE FUNCTION public.caresync_add_profile_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_memberships (healthcare_profile_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'elderly')
  ON CONFLICT (healthcare_profile_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.caresync_add_profile_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER caresync_add_profile_owner AFTER INSERT ON public.healthcare_profiles FOR EACH ROW EXECUTE FUNCTION public.caresync_add_profile_owner();

CREATE TABLE public.profile_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  healthcare_profile_id UUID NOT NULL REFERENCES public.healthcare_profiles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('family_admin', 'caregiver')),
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL))
);
GRANT SELECT ON public.profile_invitations TO authenticated;
GRANT ALL ON public.profile_invitations TO service_role;
ALTER TABLE public.profile_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profile owners and family administrators can view invitations" ON public.profile_invitations FOR SELECT TO authenticated
USING (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin']));
CREATE FUNCTION public.create_caresync_invitation(_profile_id UUID, _role TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE generated_code TEXT;
BEGIN
  IF auth.uid() IS NULL OR _role NOT IN ('family_admin', 'caregiver') OR NOT public.caresync_has_profile_role(_profile_id, ARRAY['elderly', 'family_admin']) THEN
    RAISE EXCEPTION 'You do not have permission to invite a CareCircle member';
  END IF;
  generated_code := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.profile_invitations (healthcare_profile_id, created_by, role, code_hash, expires_at)
  VALUES (_profile_id, auth.uid(), _role, encode(extensions.digest(generated_code, 'sha256'), 'hex'), now() + interval '7 days');
  RETURN generated_code;
END;
$$;
REVOKE ALL ON FUNCTION public.create_caresync_invitation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_caresync_invitation(UUID, TEXT) TO authenticated;
CREATE FUNCTION public.accept_caresync_invitation(invitation_code TEXT)
RETURNS TABLE (healthcare_profile_id UUID, role TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE invitation public.profile_invitations%ROWTYPE; normalized_code TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to accept a CareCircle invitation'; END IF;
  normalized_code := lower(regexp_replace(trim(invitation_code), '[^a-z0-9]', '', 'g'));
  IF length(normalized_code) < 20 OR length(normalized_code) > 100 THEN RAISE EXCEPTION 'This invitation code is invalid or expired'; END IF;
  SELECT i.* INTO invitation FROM public.profile_invitations i
  WHERE i.code_hash = encode(extensions.digest(normalized_code, 'sha256'), 'hex') AND i.accepted_at IS NULL AND i.expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation code is invalid or expired'; END IF;
  IF invitation.created_by = auth.uid() THEN RAISE EXCEPTION 'This invitation belongs to a different CareCircle member'; END IF;
  INSERT INTO public.profile_memberships (healthcare_profile_id, user_id, role)
  VALUES (invitation.healthcare_profile_id, auth.uid(), invitation.role)
  ON CONFLICT (healthcare_profile_id, user_id) DO NOTHING;
  UPDATE public.profile_invitations AS i SET accepted_by = auth.uid(), accepted_at = now() WHERE i.id = invitation.id;
  RETURN QUERY SELECT invitation.healthcare_profile_id, invitation.role;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_caresync_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_caresync_invitation(TEXT) TO authenticated;

CREATE TABLE public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  healthcare_profile_id UUID NOT NULL REFERENCES public.healthcare_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  dosage TEXT NOT NULL CHECK (length(dosage) BETWEEN 1 AND 120),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'custom')),
  scheduled_times TEXT[] NOT NULL CHECK (cardinality(scheduled_times) BETWEEN 1 AND 8),
  weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::SMALLINT[] CHECK (cardinality(weekdays) BETWEEN 1 AND 7),
  instructions TEXT NOT NULL DEFAULT '' CHECK (length(instructions) <= 500),
  prescribing_doctor TEXT NOT NULL DEFAULT '' CHECK (length(prescribing_doctor) <= 120),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  UNIQUE (id, healthcare_profile_id)
);
GRANT SELECT, INSERT, UPDATE ON public.medications TO authenticated;
GRANT ALL ON public.medications TO service_role;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved profile members can view medication schedules" ON public.medications FOR SELECT TO authenticated
USING (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']));
CREATE POLICY "Owners and family administrators can add medications" ON public.medications FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin']));
CREATE POLICY "Owners and family administrators can update medications" ON public.medications FOR UPDATE TO authenticated
USING (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin']))
WITH CHECK (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin']));

CREATE TABLE public.medication_dose_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL,
  healthcare_profile_id UUID NOT NULL REFERENCES public.healthcare_profiles(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('taken', 'missed', 'snoozed')),
  taken_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  confirmed_by UUID,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (medication_id, healthcare_profile_id) REFERENCES public.medications(id, healthcare_profile_id) ON DELETE CASCADE,
  UNIQUE (medication_id, scheduled_for),
  CHECK ((status = 'taken' AND taken_at IS NOT NULL AND confirmed_by IS NOT NULL) OR (status <> 'taken' AND taken_at IS NULL)),
  CHECK ((status = 'snoozed' AND snoozed_until IS NOT NULL) OR (status <> 'snoozed' AND snoozed_until IS NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.medication_dose_logs TO authenticated;
GRANT ALL ON public.medication_dose_logs TO service_role;
ALTER TABLE public.medication_dose_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved profile members can view dose history" ON public.medication_dose_logs FOR SELECT TO authenticated
USING (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']));
CREATE POLICY "Approved profile members can record scheduled doses" ON public.medication_dose_logs FOR INSERT TO authenticated
WITH CHECK (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']) AND (confirmed_by IS NULL OR confirmed_by = auth.uid()));
CREATE POLICY "Approved profile members can update scheduled doses" ON public.medication_dose_logs FOR UPDATE TO authenticated
USING (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']))
WITH CHECK (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']) AND (confirmed_by IS NULL OR confirmed_by = auth.uid()));
CREATE INDEX medication_profile_active_idx ON public.medications (healthcare_profile_id, is_active);
CREATE INDEX medication_dose_profile_time_idx ON public.medication_dose_logs (healthcare_profile_id, scheduled_for DESC);