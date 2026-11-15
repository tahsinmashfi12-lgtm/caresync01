CREATE OR REPLACE FUNCTION public.record_caresync_dose_action(
  _medication_id UUID,
  _healthcare_profile_id UUID,
  _scheduled_for TIMESTAMPTZ,
  _status TEXT,
  _idempotency_key UUID,
  _note TEXT DEFAULT ''
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  current_log public.medication_dose_logs%ROWTYPE;
  normalized_status TEXT := lower(trim(_status));
  normalized_note TEXT := COALESCE(trim(_note), '');
  profile_time_zone TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to record a medication action'; END IF;
  IF normalized_status NOT IN ('taken', 'missed', 'snoozed') THEN RAISE EXCEPTION 'Choose taken, missed, or snoozed'; END IF;
  IF length(normalized_note) > 500 THEN RAISE EXCEPTION 'Notes must be 500 characters or fewer'; END IF;
  IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'A unique action identifier is required'; END IF;
  IF NOT public.caresync_has_profile_role(_healthcare_profile_id, ARRAY['elderly', 'family_admin', 'caregiver']) THEN RAISE EXCEPTION 'You do not have access to this CareCircle profile'; END IF;
  SELECT hp.time_zone INTO profile_time_zone FROM public.healthcare_profiles hp WHERE hp.id = _healthcare_profile_id;
  IF profile_time_zone IS NULL THEN RAISE EXCEPTION 'Healthcare profile not found'; END IF;
  IF _scheduled_for < now() - interval '1 day' AND normalized_status = 'snoozed' THEN RAISE EXCEPTION 'A completed scheduled dose cannot be snoozed'; END IF;
  IF EXISTS (SELECT 1 FROM public.medication_dose_events e WHERE e.idempotency_key = _idempotency_key) THEN
    RETURN (SELECT e.medication_dose_log_id FROM public.medication_dose_events e WHERE e.idempotency_key = _idempotency_key);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.medications m
    WHERE m.id = _medication_id AND m.healthcare_profile_id = _healthcare_profile_id AND m.is_active
      AND (_scheduled_for AT TIME ZONE profile_time_zone)::date >= m.start_date
      AND (m.end_date IS NULL OR (_scheduled_for AT TIME ZONE profile_time_zone)::date <= m.end_date)
      AND (_scheduled_for AT TIME ZONE profile_time_zone)::time = ANY(SELECT scheduled_time::time FROM unnest(m.scheduled_times) AS schedule(scheduled_time))
      AND (m.frequency = 'daily' OR EXTRACT(DOW FROM (_scheduled_for AT TIME ZONE profile_time_zone))::SMALLINT = ANY(m.weekdays))
  ) THEN RAISE EXCEPTION 'This is not an active scheduled dose for this medication'; END IF;
  SELECT dl.* INTO current_log FROM public.medication_dose_logs dl
  WHERE dl.medication_id = _medication_id AND dl.scheduled_for = _scheduled_for FOR UPDATE;
  IF FOUND AND current_log.status = 'taken' THEN RETURN current_log.id; END IF;
  IF FOUND AND current_log.status = normalized_status AND current_log.note = normalized_note THEN RETURN current_log.id; END IF;
  INSERT INTO public.medication_dose_logs (
    medication_id, healthcare_profile_id, scheduled_for, status, taken_at, snoozed_until, confirmed_by, note
  ) VALUES (
    _medication_id, _healthcare_profile_id, _scheduled_for, normalized_status,
    CASE WHEN normalized_status = 'taken' THEN now() ELSE NULL END,
    CASE WHEN normalized_status = 'snoozed' THEN now() + interval '15 minutes' ELSE NULL END,
    auth.uid(), normalized_note
  )
  ON CONFLICT (medication_id, scheduled_for) DO UPDATE SET
    status = EXCLUDED.status, taken_at = EXCLUDED.taken_at, snoozed_until = EXCLUDED.snoozed_until,
    confirmed_by = EXCLUDED.confirmed_by, note = EXCLUDED.note
  RETURNING id INTO current_log.id;
  INSERT INTO public.medication_dose_events (
    medication_dose_log_id, healthcare_profile_id, status, performed_by, note, idempotency_key
  ) VALUES (current_log.id, _healthcare_profile_id, normalized_status, auth.uid(), normalized_note, _idempotency_key);
  RETURN current_log.id;
END;
$$;