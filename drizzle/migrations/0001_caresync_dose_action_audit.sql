CREATE TABLE public.medication_dose_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_dose_log_id UUID NOT NULL REFERENCES public.medication_dose_logs(id) ON DELETE CASCADE,
  healthcare_profile_id UUID NOT NULL REFERENCES public.healthcare_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('taken', 'missed', 'snoozed')),
  performed_by UUID NOT NULL,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  idempotency_key UUID NOT NULL UNIQUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.medication_dose_events TO authenticated;
GRANT ALL ON public.medication_dose_events TO service_role;
ALTER TABLE public.medication_dose_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved profile members can view medication action history"
  ON public.medication_dose_events FOR SELECT TO authenticated
  USING (public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']));
CREATE POLICY "Members can add their own action history to approved profiles"
  ON public.medication_dose_events FOR INSERT TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND public.caresync_has_profile_role(healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver'])
  );
CREATE INDEX medication_dose_events_history_idx
  ON public.medication_dose_events (healthcare_profile_id, recorded_at DESC);

CREATE FUNCTION public.record_caresync_dose_action(
  _medication_id UUID,
  _healthcare_profile_id UUID,
  _scheduled_for TIMESTAMPTZ,
  _status TEXT,
  _idempotency_key UUID,
  _note TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_log_id UUID;
  normalized_status TEXT := lower(trim(_status));
  normalized_note TEXT := COALESCE(trim(_note), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a medication action';
  END IF;
  IF normalized_status NOT IN ('taken', 'missed', 'snoozed') THEN
    RAISE EXCEPTION 'Choose taken, missed, or snoozed';
  END IF;
  IF length(normalized_note) > 500 THEN
    RAISE EXCEPTION 'Notes must be 500 characters or fewer';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'A unique action identifier is required';
  END IF;
  IF NOT public.caresync_has_profile_role(_healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']) THEN
    RAISE EXCEPTION 'You do not have access to this CareCircle profile';
  END IF;
  IF normalized_status = 'snoozed' AND _scheduled_for < now() - interval '1 day' THEN
    RAISE EXCEPTION 'A completed scheduled dose cannot be snoozed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.medication_dose_events e WHERE e.idempotency_key = _idempotency_key) THEN
    RETURN (SELECT e.medication_dose_log_id FROM public.medication_dose_events e WHERE e.idempotency_key = _idempotency_key);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.medications m
    WHERE m.id = _medication_id
      AND m.healthcare_profile_id = _healthcare_profile_id
      AND m.is_active
      AND _scheduled_for >= (m.start_date::timestamp AT TIME ZONE 'UTC')
      AND (m.end_date IS NULL OR _scheduled_for < ((m.end_date + 1)::timestamp AT TIME ZONE 'UTC'))
      AND EXISTS (
        SELECT 1 FROM unnest(m.scheduled_times) AS scheduled_time
        WHERE _scheduled_for::time = scheduled_time::time
      )
  ) THEN
    RAISE EXCEPTION 'This is not an active scheduled dose for this medication';
  END IF;
  INSERT INTO public.medication_dose_logs (
    medication_id, healthcare_profile_id, scheduled_for, status,
    taken_at, snoozed_until, confirmed_by, note
  ) VALUES (
    _medication_id, _healthcare_profile_id, _scheduled_for, normalized_status,
    CASE WHEN normalized_status = 'taken' THEN now() ELSE NULL END,
    CASE WHEN normalized_status = 'snoozed' THEN now() + interval '15 minutes' ELSE NULL END,
    auth.uid(), normalized_note
  )
  ON CONFLICT (medication_id, scheduled_for) DO UPDATE SET
    status = EXCLUDED.status,
    taken_at = EXCLUDED.taken_at,
    snoozed_until = EXCLUDED.snoozed_until,
    confirmed_by = EXCLUDED.confirmed_by,
    note = EXCLUDED.note
  RETURNING id INTO current_log_id;
  INSERT INTO public.medication_dose_events (
    medication_dose_log_id, healthcare_profile_id, status, performed_by, note, idempotency_key
  ) VALUES (
    current_log_id, _healthcare_profile_id, normalized_status, auth.uid(), normalized_note, _idempotency_key
  );
  RETURN current_log_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_caresync_dose_action(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_caresync_dose_action(UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT) TO authenticated;