import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Clock3,
  Copy,
  Heart,
  HeartPulse,
  LogOut,
  Menu,
  MoreHorizontal,
  Pill,
  Plus,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Sunset,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import carePhoto from "@/assets/caresync-care-team.jpg.asset.json";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import {
  adherencePercentage,
  getDoseStatus,
  getLocalDateTimeParts,
  isValidMedicationTimes,
  localMedicationTimeToIso,
  parseMedicationTimes,
} from "@/lib/caresync-domain";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareSync — Better Care, Connected Lives" },
      {
        name: "description",
        content:
          "A calmer, more connected way to coordinate medication routines and family care.",
      },
      { property: "og:title", content: "CareSync — Better Care, Connected Lives" },
      {
        property: "og:description",
        content: "A calmer, more connected way to coordinate medication routines and family care.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CareSync,
});

type Role = "elderly" | "family_admin" | "caregiver";
type View = "today" | "medications" | "history" | "circle";
type FormMode = "sign-in" | "sign-up";
type Profile = {
  id: string;
  display_name: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  time_zone: string;
};
type Medication = {
  id: string;
  healthcare_profile_id: string;
  name: string;
  dosage: string;
  frequency: string;
  scheduled_times: string[];
  weekdays: number[];
  instructions: string;
  prescribing_doctor: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};
type DoseLog = {
  medication_id: string;
  scheduled_for: string;
  status: "taken" | "missed" | "snoozed";
  taken_at: string | null;
  note: string;
};
type CircleMember = { user_id: string; role: Role; name: string };

const demoProfile: Profile = {
  id: "circle-preview",
  display_name: "Margaret Ellis",
  emergency_contact_name: "Sophie Ellis",
  emergency_contact_phone: "+15550102024",
  time_zone: "America/New_York",
};
const demoMeds: Medication[] = [
  {
    id: "medicine-morning",
    healthcare_profile_id: demoProfile.id,
    name: "Vitamin D3",
    dosage: "1 tablet · 1000 IU",
    frequency: "daily",
    scheduled_times: ["08:00"],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    instructions: "Take with breakfast",
    prescribing_doctor: "Dr. Reynolds",
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
  },
  {
    id: "medicine-evening",
    healthcare_profile_id: demoProfile.id,
    name: "Lisinopril",
    dosage: "1 tablet · 10 mg",
    frequency: "daily",
    scheduled_times: ["20:00"],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    instructions: "Take after dinner",
    prescribing_doctor: "Dr. Reynolds",
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
  },
  {
    id: "medicine-morning-2",
    healthcare_profile_id: demoProfile.id,
    name: "Omega-3",
    dosage: "1 softgel · 1000 mg",
    frequency: "daily",
    scheduled_times: ["12:00"],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    instructions: "Take with lunch",
    prescribing_doctor: "Dr. Reynolds",
    start_date: "2026-01-01",
    end_date: null,
    is_active: true,
  },
];

function CareSync() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role>("elderly");
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("today");
  const [previewRole, setPreviewRole] = useState<Role>("elderly");
  const [isPreview, setIsPreview] = useState(false);
  const [authMode, setAuthMode] = useState<FormMode>("sign-in");
  const [authError, setAuthError] = useState("");
  const [authWorking, setAuthWorking] = useState(false);
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [medicationFormOpen, setMedicationFormOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"family_admin" | "caregiver">("family_admin");
  const [invitationCode, setInvitationCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const activeRole = isPreview ? previewRole : role;
  const activeProfile = isPreview ? demoProfile : profile;
  const activeMeds = isPreview ? demoMeds : medications;
  const activeDoseLogs: DoseLog[] = isPreview
    ? [
        {
          medication_id: "medicine-morning",
          scheduled_for: localMedicationTimeToIso(
            getLocalDateTimeParts(new Date(), demoProfile.time_zone).date,
            "08:00",
            demoProfile.time_zone,
          ),
          status: "taken",
          taken_at: new Date().toISOString(),
          note: "",
        },
      ]
    : doseLogs;

  async function refreshCare() {
    const { data, error: sessionError } = await supabase.auth.getUser();
    if (sessionError) throw sessionError;
    if (!data.user) {
      setUser(null);
      setProfile(null);
      setMedications([]);
      setDoseLogs([]);
      setMembers([]);
      setIsLoading(false);
      return;
    }
    setUser({ id: data.user.id, email: data.user.email ?? "" });
    const { data: links, error: linkError } = await supabase
      .from("profile_memberships")
      .select("healthcare_profile_id, role")
      .eq("user_id", data.user.id);
    if (linkError) throw linkError;
    const memberships = (links ?? []) as { healthcare_profile_id: string; role: Role }[];
    const selected = memberships[0];
    if (!selected) {
      setProfile(null);
      setMedications([]);
      setDoseLogs([]);
      setMembers([]);
      setIsLoading(false);
      return;
    }
    const { data: healthData, error: healthError } = await supabase
      .from("healthcare_profiles")
      .select("id, display_name, emergency_contact_name, emergency_contact_phone, time_zone")
      .eq("id", selected.healthcare_profile_id)
      .single();
    if (healthError) throw healthError;
    setRole(selected.role);
    const selectedProfile = healthData as Profile;
    setProfile(selectedProfile);

    const [medicationResult, logResult, membersResult] = await Promise.all([
      supabase
        .from("medications")
        .select("id, healthcare_profile_id, name, dosage, frequency, scheduled_times, weekdays, instructions, prescribing_doctor, start_date, end_date, is_active")
        .eq("healthcare_profile_id", selectedProfile.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("medication_dose_logs")
        .select("medication_id, scheduled_for, status, taken_at, note")
        .eq("healthcare_profile_id", selectedProfile.id)
        .order("scheduled_for", { ascending: false })
        .limit(250),
      supabase
        .from("profile_memberships")
        .select("user_id, role")
        .eq("healthcare_profile_id", selectedProfile.id),
    ]);
    if (medicationResult.error) throw medicationResult.error;
    if (logResult.error) throw logResult.error;
    if (membersResult.error) throw membersResult.error;
    setMedications((medicationResult.data ?? []) as Medication[]);
    setDoseLogs((logResult.data ?? []) as DoseLog[]);
    const memberRows = (membersResult.data ?? []) as { user_id: string; role: Role }[];
    if (memberRows.length > 0) {
      const { data: accountProfiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", memberRows.map((member) => member.user_id));
      const names = new Map((accountProfiles ?? []).map((entry) => [entry.user_id, entry.display_name]));
      setMembers(
        memberRows.map((member) => ({
          ...member,
          name: names.get(member.user_id) ?? "CareCircle member",
        })),
      );
    } else setMembers([]);
    setIsLoading(false);
  }

  useEffect(() => {
    let active = true;
    void refreshCare().catch((cause: unknown) => {
      if (active) {
        setError(cause instanceof Error ? cause.message : "CareSync could not load this profile.");
        setIsLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void refreshCare().catch((cause: unknown) => {
          if (active) {
            setError(cause instanceof Error ? cause.message : "CareSync could not refresh your profile.");
            setIsLoading(false);
          }
        });
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function onAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") ?? "").trim();
    const password = String(values.get("password") ?? "");
    const fullName = String(values.get("fullName") ?? "").trim();
    setAuthError("");
    setAuthWorking(true);
    try {
      if (authMode === "sign-up") {
        if (fullName.length < 2 || fullName.length > 120) {
          setAuthError("Please enter a name between 2 and 120 characters.");
          return;
        }
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
        });
        if (signUpError) throw signUpError;
        setAuthError("Check your email for a confirmation link, then sign in to continue.");
        toast.success("Confirmation email sent");
        setAuthMode("sign-in");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await refreshCare();
      }
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "We couldn’t sign you in right now.");
    } finally {
      setAuthWorking(false);
    }
  }

  async function handleSocialSignIn(provider: "google" | "lovable") {
    setAuthError("");
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (!result.redirected) await refreshCare();
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Social sign-in is temporarily unavailable.");
    }
  }

  async function createHealthcareProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const values = new FormData(event.currentTarget);
    const displayName = String(values.get("displayName") ?? "").trim();
    const contactName = String(values.get("emergencyContactName") ?? "").trim();
    const contactPhone = String(values.get("emergencyContactPhone") ?? "").trim();
    const dateOfBirth = String(values.get("dateOfBirth") ?? "");
    if (displayName.length < 2 || displayName.length > 120 || contactName.length > 120 || contactPhone.length > 40) {
      toast.error("Please check the profile details and try again.");
      return;
    }
    setActionLoading("profile");
    try {
      const { error: createError } = await supabase.from("healthcare_profiles").insert({
        display_name: displayName,
        date_of_birth: dateOfBirth || null,
        emergency_contact_name: contactName || null,
        emergency_contact_phone: contactPhone || null,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        created_by: user.id,
      });
      if (createError) throw createError;
      await refreshCare();
      setProfileFormOpen(false);
      toast.success("Your healthcare profile is ready.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We couldn’t create that profile.");
    } finally {
      setActionLoading(null);
    }
  }

  async function createMedication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !profile || !canManageSchedule(activeRole)) return;
    const values = new FormData(event.currentTarget);
    const name = String(values.get("medicineName") ?? "").trim();
    const dosage = String(values.get("dosage") ?? "").trim();
    const frequency = String(values.get("frequency") ?? "daily");
    const times = parseMedicationTimes(String(values.get("times") ?? ""));
    const instructions = String(values.get("instructions") ?? "").trim();
    const doctor = String(values.get("doctor") ?? "").trim();
    const startDate = String(values.get("startDate") ?? "");
    const endDate = String(values.get("endDate") ?? "") || null;
    const weekdayChoices = values.getAll("weekdays").map(Number);
    if (
      name.length < 1 || name.length > 120 || dosage.length < 1 || dosage.length > 120 ||
      !isValidMedicationTimes(times) || !["daily", "weekly", "custom"].includes(frequency) ||
      instructions.length > 500 || doctor.length > 120 || (endDate && startDate && endDate < startDate) ||
      ((frequency === "weekly" || frequency === "custom") && (weekdayChoices.length < 1 || weekdayChoices.length > 7))
    ) {
      toast.error("Check the medication name, dosage, schedule and dates.");
      return;
    }
    setActionLoading("medication");
    try {
      const { error: insertError } = await supabase.from("medications").insert({
        healthcare_profile_id: profile.id,
        name,
        dosage,
        frequency,
        scheduled_times: times,
        weekdays: frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : weekdayChoices,
        instructions,
        prescribing_doctor: doctor,
        start_date: startDate,
        end_date: endDate,
        created_by: user.id,
      });
      if (insertError) throw insertError;
      await refreshCare();
      setMedicationFormOpen(false);
      toast.success("Medication added to the schedule.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We couldn’t add this medication.");
    } finally {
      setActionLoading(null);
    }
  }

  async function logDoseAction(medicine: Medication, time: string, action: "taken" | "missed" | "snoozed") {
    if (!user || !profile || isPreview) return;
    const localDate = getLocalDateTimeParts(new Date(), profile.time_zone).date;
    const scheduledFor = localMedicationTimeToIso(localDate, time, profile.time_zone);
    const key = `${medicine.id}:${scheduledFor}`;
    setActionLoading(key);
    try {
      const { error: actionError } = await supabase.rpc("record_caresync_dose_action", {
        _medication_id: medicine.id,
        _healthcare_profile_id: profile.id,
        _scheduled_for: scheduledFor,
        _status: action,
        _idempotency_key: crypto.randomUUID(),
        _note: "",
      });
      if (actionError) throw actionError;
      await refreshCare();
      toast.success(action === "taken" ? "Dose recorded as taken." : action === "missed" ? "Dose recorded as missed." : "Reminder snoozed for 15 minutes.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "We couldn’t update this dose.");
    } finally {
      setActionLoading(null);
    }
  }

  async function createInvitation() {
    if (!profile || isPreview) return;
    setActionLoading("invite");
    try {
      const { data, error: inviteError } = await supabase.rpc("create_caresync_invitation", {
        _profile_id: profile.id,
        _role: inviteRole,
      });
      if (inviteError) throw inviteError;
      setInvitationCode(data);
      toast.success("A single-use invitation is ready. It expires in seven days.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn’t create an invitation.");
    } finally {
      setActionLoading(null);
    }
  }

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = joinCode.trim();
    if (cleanCode.length < 20 || cleanCode.length > 100) {
      toast.error("Enter the invitation code from your CareCircle.");
      return;
    }
    setActionLoading("join");
    try {
      const { error: joinError } = await supabase.rpc("accept_caresync_invitation", {
        invitation_code: cleanCode,
      });
      if (joinError) throw joinError;
      await refreshCare();
      setJoinCode("");
      toast.success("You’re connected to the CareCircle.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That invitation is invalid or expired.");
    } finally {
      setActionLoading(null);
    }
  }

  async function signOut() {
    setIsPreview(false);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) toast.error("You couldn’t be signed out. Please try again.");
    else toast.success("You’ve been signed out.");
  }

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background" aria-busy="true">
        <div className="flex items-center gap-3 text-lg font-medium text-foreground">
          <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Opening your CareCircle…
        </div>
      </main>
    );
  }

  if (!user && !isPreview) {
    return (
      <main className="min-h-dvh bg-background px-4 py-5 sm:px-7 sm:py-8">
        <header className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <CareSyncLogo />
          <Button variant="outline" className="min-h-12 rounded-full px-6" onClick={() => setIsPreview(true)}>
            Explore sample dashboards <ArrowRight aria-hidden="true" />
          </Button>
        </header>
        <section className="mx-auto mt-6 grid max-w-[1440px] gap-7 lg:grid-cols-[minmax(0,1.42fr)_minmax(380px,.78fr)] lg:items-stretch">
          <div className="relative isolate flex min-h-[540px] overflow-hidden rounded-[2rem] bg-primary px-7 py-10 text-primary-foreground sm:min-h-[620px] sm:px-12 sm:py-14 lg:min-h-[700px]">
            <img className="absolute inset-0 -z-20 size-full object-cover object-center" src={carePhoto.url} alt="A doctor sharing a quiet moment of care with an older adult." />
            <div className="absolute inset-0 -z-10 bg-foreground/65" />
            <div className="flex w-full flex-col justify-between gap-12">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-background/95 px-4 py-2 text-sm font-semibold text-foreground shadow-sm">
                  <span className="size-2 rounded-full bg-teal-600" /> Care looks better together
                </div>
                <h1 className="mt-10 max-w-2xl text-5xl font-semibold leading-[1.08] text-background sm:text-6xl">
                  Better care.<br />Connected lives.
                </h1>
                <p className="mt-5 max-w-lg text-xl leading-8 text-background">
                  Health routines feel easier when the people you love are close by.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background px-4 text-base font-semibold text-foreground"><Heart aria-hidden="true" className="size-4 text-teal-700" /> Built around your choices</span>
                <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background px-4 text-base font-semibold text-foreground"><ShieldCheck aria-hidden="true" className="size-4 text-teal-700" /> Private by design</span>
              </div>
            </div>
            <div className="absolute bottom-7 right-7 hidden max-w-[225px] rounded-2xl bg-background p-4 text-foreground shadow-lg sm:block">
              <p className="text-sm font-medium text-muted-foreground">Here for everyday care</p>
              <p className="mt-1 text-lg font-semibold">One Circle. Closer support.</p>
            </div>
          </div>
          <AuthPanel
            mode={authMode}
            onModeChange={setAuthMode}
            onSubmit={onAuthSubmit}
            onSocialSignIn={handleSocialSignIn}
            error={authError || error}
            working={authWorking}
            onPreview={() => setIsPreview(true)}
          />
        </section>
        <TrustFooter />
      </main>
    );
  }

  if (!activeProfile) {
    return (
      <AppFrame
        activeRole={activeRole}
        isPreview={false}
        previewRole={previewRole}
        onPreviewRoleChange={setPreviewRole}
        onPreviewToggle={() => setIsPreview(true)}
        onSignOut={() => void signOut()}
      >
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-9 sm:px-8">
          <h1 className="text-4xl font-semibold text-foreground">Start your CareCircle</h1>
          <p className="mt-3 max-w-2xl text-lg leading-7 text-muted-foreground">Create a healthcare profile for someone you care for, or join their Circle with an invitation.</p>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary"><HeartPulse aria-hidden="true" /></div>
              <h2 className="mt-5 text-2xl font-semibold text-foreground">Create a care profile</h2>
              <p className="mt-2 text-base text-muted-foreground">Your loved one chooses who joins and how their care routine is shared.</p>
              {!profileFormOpen ? (
                <Button className="mt-6 min-h-12 rounded-full px-6" onClick={() => setProfileFormOpen(true)}><Plus aria-hidden="true" /> Create healthcare profile</Button>
              ) : (
                <form className="mt-6 grid gap-4" onSubmit={(event) => void createHealthcareProfile(event)}>
                  <Field label="Name" name="displayName" maxLength={120} required autoComplete="name" placeholder="The name they prefer" />
                  <Field label="Date of birth · optional" name="dateOfBirth" type="date" />
                  <Field label="Emergency contact · optional" name="emergencyContactName" maxLength={120} placeholder="Name" />
                  <Field label="Emergency phone · optional" name="emergencyContactPhone" maxLength={40} type="tel" placeholder="Phone number" />
                  <Button type="submit" disabled={actionLoading === "profile"} className="min-h-12 rounded-full">{actionLoading === "profile" ? "Creating…" : "Create profile"} <ArrowRight aria-hidden="true" /></Button>
                </form>
              )}
            </section>
            <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary"><UsersRound aria-hidden="true" /></div>
              <h2 className="mt-5 text-2xl font-semibold text-foreground">Join a CareCircle</h2>
              <p className="mt-2 text-base text-muted-foreground">Use a private invitation from the elderly person or a Circle administrator.</p>
              <form className="mt-6 grid gap-4" onSubmit={(event) => void acceptInvitation(event)}>
                <Field label="Invitation code" name="joinCode" maxLength={100} autoComplete="one-time-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Paste your invitation code" required />
                <Button variant="outline" type="submit" disabled={actionLoading === "join"} className="min-h-12 rounded-full">{actionLoading === "join" ? "Joining…" : "Join care profile"} <ArrowRight aria-hidden="true" /></Button>
              </form>
              <div className="mt-5 flex items-start gap-3 border-t border-border pt-5 text-base leading-6 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /> Only an authenticated account with an active invitation can join.</div>
            </section>
          </div>
        </main>
      </AppFrame>
    );
  }

  return (
    <AppFrame
      activeRole={activeRole}
      isPreview={isPreview}
      previewRole={previewRole}
      onPreviewRoleChange={setPreviewRole}
      onPreviewToggle={() => setIsPreview((previous) => !previous)}
      onSignOut={() => void signOut()}
    >
      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-8 sm:px-7 lg:px-10">
        {isPreview && <PreviewNote />}
        {view === "today" && (
          <TodayDashboard
            profile={activeProfile}
            role={activeRole}
            medications={activeMeds}
            logs={activeDoseLogs}
            isPreview={isPreview}
            isLoading={actionLoading}
            onDoseAction={(medicine, time, action) => void logDoseAction(medicine, time, action)}
            onOpenMedications={() => setView("medications")}
            onOpenCircle={() => setView("circle")}
          />
        )}
        {view === "medications" && (
          <MedicationView
            role={activeRole}
            medications={activeMeds}
            logs={activeDoseLogs}
            profile={activeProfile}
            isPreview={isPreview}
            isLoading={actionLoading}
            formOpen={medicationFormOpen}
            onFormOpen={setMedicationFormOpen}
            onSubmit={createMedication}
            onDoseAction={(medicine, time, action) => void logDoseAction(medicine, time, action)}
          />
        )}
        {view === "history" && <HistoryView medications={activeMeds} logs={activeDoseLogs} timeZone={activeProfile.time_zone} />}
        {view === "circle" && (
          <CircleView
            profile={activeProfile}
            role={activeRole}
            members={isPreview ? demoMembers : members}
            invitationCode={invitationCode}
            inviteRole={inviteRole}
            isPreview={isPreview}
            isLoading={actionLoading}
            onInviteRoleChange={setInviteRole}
            onCreateInvitation={() => void createInvitation()}
            onCopyCode={() => void navigator.clipboard.writeText(invitationCode).then(() => toast.success("Invitation code copied."))}
          />
        )}
      </main>
      <div className="mx-auto max-w-[1440px] px-4 pb-8 sm:px-7 lg:px-10"><CareNotice /></div>
    </AppFrame>
  );
}

const demoMembers: CircleMember[] = [
  { user_id: "carecircle-1", role: "elderly", name: "Margaret Ellis" },
  { user_id: "carecircle-2", role: "family_admin", name: "Sophie Ellis" },
  { user_id: "carecircle-3", role: "caregiver", name: "Daniel Brooks" },
];

function canManageSchedule(role: Role) {
  return role === "elderly" || role === "family_admin";
}

function displayRole(role: Role) {
  return role === "elderly" ? "Elderly individual" : role === "family_admin" ? "Family administrator" : "Caregiver";
}

function CareSyncLogo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="group inline-flex min-h-12 items-center gap-3" aria-label="CareSync home">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><HeartPulse aria-hidden="true" className="size-6" /></span>
      <span className="leading-tight">
        <span className="block text-[21px] font-semibold text-foreground">CareSync</span>
        {!compact && <span className="block text-sm text-muted-foreground">Better care. Connected lives.</span>}
      </span>
    </a>
  );
}

function AuthPanel({
  mode,
  onModeChange,
  onSubmit,
  onSocialSignIn,
  error,
  working,
  onPreview,
}: {
  mode: FormMode;
  onModeChange: (mode: FormMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSocialSignIn: (provider: "google" | "lovable") => void;
  error: string;
  working: boolean;
  onPreview: () => void;
}) {
  return (
    <section className="flex flex-col justify-center rounded-[2rem] border border-border bg-card px-6 py-8 sm:px-10 sm:py-10 lg:px-9 xl:px-12" aria-labelledby="welcome-title">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary"><Heart aria-hidden="true" className="size-6" /></div>
      <p className="mt-6 text-base font-semibold text-primary">Your care, your Circle</p>
      <h2 id="welcome-title" className="mt-2 text-3xl font-semibold text-foreground">{mode === "sign-up" ? "Create your account" : "Welcome to CareSync"}</h2>
      <p className="mt-2 text-lg text-muted-foreground">{mode === "sign-up" ? "A little more support starts here." : "A caring community, all in one place."}</p>
      <Tabs value={mode} onValueChange={(value) => onModeChange(value as FormMode)} className="mt-7">
        <TabsList className="grid h-12 w-full grid-cols-2 rounded-full bg-muted p-1">
          <TabsTrigger value="sign-in" className="min-h-10 rounded-full text-base data-[state=active]:bg-card">Sign in</TabsTrigger>
          <TabsTrigger value="sign-up" className="min-h-10 rounded-full text-base data-[state=active]:bg-card">Create account</TabsTrigger>
        </TabsList>
      </Tabs>
      <form className="mt-5 grid gap-4" onSubmit={(event) => void onSubmit(event)}>
        {mode === "sign-up" && <Field label="Your name" name="fullName" autoComplete="name" maxLength={120} minLength={2} required placeholder="How should we address you?" />}
        <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={255} required placeholder="you@example.com" />
        <Field label="Password" name="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} minLength={8} maxLength={128} required placeholder="At least 8 characters" />
        {error && <p role="status" className="rounded-xl bg-destructive/10 px-4 py-3 text-base leading-6 text-destructive">{error}</p>}
        <Button type="submit" disabled={working} className="min-h-14 rounded-full text-base">
          {working ? "Please wait…" : mode === "sign-up" ? "Create my account" : "Sign in to CareSync"}
          {!working && <ArrowRight aria-hidden="true" />}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" /> or continue with <span className="h-px flex-1 bg-border" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Button type="button" variant="outline" onClick={() => onSocialSignIn("google")} className="min-h-12 rounded-full border-input bg-background text-base text-foreground hover:bg-muted" aria-label="Continue with Google">
          <GoogleMark /> Continue with Google
        </Button>
        <Button type="button" variant="outline" onClick={() => onSocialSignIn("lovable")} className="min-h-12 rounded-full bg-background text-base">
          <HeartPulse aria-hidden="true" /> Continue with Lovable
        </Button>
      </div>
      <p className="mt-5 text-center text-sm leading-5 text-muted-foreground">By continuing, you agree to share health information only with people you choose.</p>
      <Button variant="link" type="button" onClick={onPreview} className="mt-3 min-h-11 text-base text-primary">Explore sample dashboards <ArrowRight aria-hidden="true" /></Button>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] shrink-0">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const inputId = `${props.name}-field`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId} className="text-base font-medium text-foreground">{props.label}</Label>
      <Input
        id={inputId}
        name={props.name}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        required={props.required}
        minLength={props.minLength}
        maxLength={props.maxLength}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={props.onChange}
        className="min-h-12 rounded-xl border-input bg-background px-4 text-base"
      />
    </div>
  );
}

function AppFrame({
  children,
  activeRole,
  isPreview,
  previewRole,
  onPreviewRoleChange,
  onPreviewToggle,
  onSignOut,
}: {
  children: ReactNode;
  activeRole: Role;
  isPreview: boolean;
  previewRole: Role;
  onPreviewRoleChange: (role: Role) => void;
  onPreviewToggle: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-dvh bg-muted/45">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-[78px] max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7 lg:px-10">
          <CareSyncLogo compact />
          <nav aria-label="Main navigation" className="order-3 flex w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-background p-1 sm:order-2 sm:w-auto">
            <NavButton active={false} icon={<HeartPulse aria-hidden="true" />} onClick={onPreviewToggle}>{isPreview ? "Sample view" : "My care"}</NavButton>
            <span className="hidden h-7 w-px bg-border lg:block" />
            <p className="hidden px-2 text-sm font-medium text-muted-foreground xl:block">Viewing as</p>
            <RolePill role={activeRole} />
          </nav>
          <div className="flex items-center gap-2">
            <Button type="button" variant={isPreview ? "secondary" : "outline"} onClick={onPreviewToggle} className="min-h-11 rounded-full px-4 text-sm sm:px-5">
              {isPreview ? <><X aria-hidden="true" /> Exit sample</> : <><Sparkles aria-hidden="true" /> Sample dashboards</>}
            </Button>
            {!isPreview && <Button type="button" variant="ghost" onClick={onSignOut} className="min-h-11 rounded-full px-3" aria-label="Sign out"><LogOut aria-hidden="true" /> <span className="hidden sm:inline">Sign out</span></Button>}
          </div>
        </div>
        {isPreview && <div className="border-t border-border bg-accent/70"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7 lg:px-10"><p className="flex items-center gap-2 text-base font-medium text-foreground"><Sparkles aria-hidden="true" className="size-4 text-primary" /> Sample dashboards — example information only</p><RoleTabs value={previewRole} onChange={onPreviewRoleChange} label="Sample dashboard role" /></div></div>}
      </header>
      {children}
      <footer className="border-t border-border bg-background"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-muted-foreground sm:px-7 lg:px-10"><span>CareSync · Better care. Connected lives.</span><span>Thoughtfully connected, always by your choice.</span></div></footer>
    </div>
  );
}

function RolePill({ role }: { role: Role }) {
  return <span className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground"><CircleUserRound aria-hidden="true" className="size-4" /> {displayRole(role)}</span>;
}

function RoleTabs({ value, onChange, label }: { value: Role; onChange: (role: Role) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={label}>
      {(["elderly", "family_admin", "caregiver"] as const).map((role) => (
        <Button key={role} type="button" size="sm" variant={value === role ? "default" : "outline"} onClick={() => onChange(role)} aria-pressed={value === role} className="min-h-10 rounded-full px-4 text-sm">
          {role === "elderly" ? "Elderly" : role === "family_admin" ? "Family" : "Caregiver"}
        </Button>
      ))}
    </div>
  );
}

function NavButton({ children, active, icon, onClick }: { children: ReactNode; active: boolean; icon: ReactNode; onClick: () => void }) {
  return <Button variant={active ? "secondary" : "ghost"} type="button" onClick={onClick} className="min-h-10 shrink-0 rounded-full px-4 text-sm">{icon}{children}</Button>;
}

function PreviewNote() {
  return <aside className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-accent/55 px-4 py-3 text-base text-accent-foreground"><Sparkles aria-hidden="true" className="size-5 shrink-0" /> This sample uses example information. Medication actions here do not change a real care record.</aside>;
}

function TodayDashboard({
  profile,
  role,
  medications,
  logs,
  isPreview,
  isLoading,
  onDoseAction,
  onOpenMedications,
  onOpenCircle,
}: {
  profile: Profile;
  role: Role;
  medications: Medication[];
  logs: DoseLog[];
  isPreview: boolean;
  isLoading: string | null;
  onDoseAction: (medicine: Medication, time: string, action: "taken" | "missed" | "snoozed") => void;
  onOpenMedications: () => void;
  onOpenCircle: () => void;
}) {
  const local = getLocalDateTimeParts(new Date(), profile.time_zone);
  const today = medications.flatMap((medicine) => {
    if (!medicine.is_active || medicine.frequency !== "daily" && !medicine.weekdays.includes(local.weekday)) return [];
    if (local.date < medicine.start_date || medicine.end_date && local.date > medicine.end_date) return [];
    return medicine.scheduled_times.map((time) => ({ medicine, time, iso: localMedicationTimeToIso(local.date, time, profile.time_zone) }));
  }).sort((left, right) => left.time.localeCompare(right.time));
  const takenCount = today.filter((dose) => getDoseStatus(dose.medicine.id, dose.iso, logs) === "taken").length;
  const pendingDose = today.find((dose) => getDoseStatus(dose.medicine.id, dose.iso, logs) === "due" || getDoseStatus(dose.medicine.id, dose.iso, logs) === "snoozed");
  const greeting = local.hours < 12 ? "Good morning" : local.hours < 17 ? "Good afternoon" : "Good evening";
  const roleIntro = role === "family_admin" ? "Here’s the latest for your loved one." : role === "caregiver" ? "Your care schedule is ready for today." : "Your care, all in one clear place.";

  return (
    <div>
      <section className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-8 text-primary-foreground sm:px-9 sm:py-9">
        <div className="absolute inset-y-0 right-0 -z-10 hidden w-[42%] overflow-hidden opacity-30 lg:block"><img src={carePhoto.url} alt="" className="size-full object-cover object-[center_34%]" /><div className="absolute inset-0 bg-primary/60" /></div>
        <p className="flex items-center gap-2 text-base font-medium"><Sunrise aria-hidden="true" className="size-5" /> Your care, at a glance</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">{greeting}, {profile.display_name.split(" ")[0]}</h1>
        <p className="mt-3 text-lg leading-7 text-primary-foreground/85">{roleIntro}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background/15 px-4 text-base font-medium"><CalendarDays aria-hidden="true" className="size-4" /> {new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: profile.time_zone }).format(new Date())}</span>
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background/15 px-4 text-base font-medium"><ShieldCheck aria-hidden="true" className="size-4" /> {displayRole(role)}</span>
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,.72fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-base font-semibold text-primary">TODAY’S ROUTINE</p><h2 className="mt-1 text-2xl font-semibold text-foreground">Medication schedule</h2></div><Button variant="ghost" onClick={onOpenMedications} className="min-h-11 rounded-full text-base">Full schedule <ArrowRight aria-hidden="true" /></Button></div>
          {pendingDose && (
            <section className="mt-4 overflow-hidden rounded-3xl border border-primary/15 bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6"><div><div className="flex items-center gap-2 text-base font-medium text-primary"><Clock3 aria-hidden="true" className="size-5" /> Coming up next</div><h3 className="mt-1 text-xl font-semibold text-foreground">{pendingDose.medicine.name}</h3><p className="mt-1 text-base text-muted-foreground">{pendingDose.medicine.dosage} · {formatLocalTime(pendingDose.time)}</p></div><StatusPill status={getDoseStatus(pendingDose.medicine.id, pendingDose.iso, logs)} /></div>
              <div className="grid gap-3 p-5 sm:grid-cols-3 sm:px-6"><Button disabled={isPreview || isLoading !== null || !mayRecordDose(role)} onClick={() => onDoseAction(pendingDose.medicine, pendingDose.time, "taken")} className="min-h-14 rounded-2xl bg-success text-success-foreground hover:bg-success/85"><Check aria-hidden="true" /> Mark taken</Button><Button disabled={isPreview || isLoading !== null || !mayRecordDose(role)} variant="outline" onClick={() => onDoseAction(pendingDose.medicine, pendingDose.time, "snoozed")} className="min-h-14 rounded-2xl"><Clock3 aria-hidden="true" /> Snooze</Button><Button disabled={isPreview || isLoading !== null || !mayRecordDose(role)} variant="outline" onClick={() => onDoseAction(pendingDose.medicine, pendingDose.time, "missed")} className="min-h-14 rounded-2xl text-destructive"><X aria-hidden="true" /> Report missed</Button></div>
              {!mayRecordDose(role) && !isPreview && <p className="px-6 pb-4 text-sm text-muted-foreground">Medication actions are available to members of this CareCircle.</p>}
            </section>
          )}
          <section className="mt-4 rounded-3xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6"><h3 className="text-lg font-semibold text-foreground">All doses today</h3><span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">{takenCount} of {today.length} taken</span></div>
            {today.length === 0 ? <div className="px-6 py-9 text-center"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-primary"><Pill aria-hidden="true" /></div><h3 className="mt-3 text-lg font-semibold text-foreground">No doses scheduled yet</h3><p className="mt-1 text-base text-muted-foreground">When a medication schedule is added, it appears here.</p><Button onClick={onOpenMedications} variant="outline" className="mt-4 min-h-11 rounded-full">Open medication list <ArrowRight aria-hidden="true" /></Button></div> : (
              <ul className="divide-y divide-border px-5 sm:px-6" aria-label="Today's medication schedule">
                {today.map(({ medicine, time, iso }) => <li key={`${medicine.id}-${time}`} className="flex flex-wrap items-center gap-3 py-4 sm:flex-nowrap"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><Pill aria-hidden="true" className="size-5" /></span><div className="min-w-[150px] flex-1"><p className="text-base font-semibold text-foreground">{medicine.name}</p><p className="mt-1 text-sm text-muted-foreground">{medicine.dosage}{medicine.instructions ? ` · ${medicine.instructions}` : ""}</p></div><span className="min-w-20 text-base font-medium text-muted-foreground">{formatLocalTime(time)}</span><StatusPill status={getDoseStatus(medicine.id, iso, logs)} /></li>)}
              </ul>
            )}
          </section>
        </div>
        <aside className="flex flex-col gap-5">
          <AdherencePanel today={today} logs={logs} />
          <WellnessPanel />
          <EmergencyPanel profile={profile} />
          <section className="rounded-3xl bg-card p-5 sm:p-6"><p className="text-base font-semibold text-primary">YOUR CARECIRCLE</p><h2 className="mt-2 text-xl font-semibold text-foreground">Care feels closer together.</h2><p className="mt-2 text-base leading-6 text-muted-foreground">See who is connected, invite a trusted family member, or check in with your care team.</p><Button variant="outline" onClick={onOpenCircle} className="mt-4 min-h-11 w-full justify-between rounded-full">Open CareCircle <ArrowRight aria-hidden="true" /></Button></section>
        </aside>
      </div>
    </div>
  );
}

function mayRecordDose(role: Role) { return role === "elderly" || role === "family_admin" || role === "caregiver"; }

function formatLocalTime(value: string) {
  const [hours = "0", minutes = "00"] = value.split(":");
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, Number(hours), Number(minutes)));
}

function StatusPill({ status }: { status: "due" | "taken" | "missed" | "snoozed" }) {
  const config = {
    due: { label: "Due", className: "bg-due/15 text-due-foreground", icon: <Clock3 aria-hidden="true" className="size-4" /> },
    taken: { label: "Taken", className: "bg-success/15 text-success-foreground", icon: <CheckCircle2 aria-hidden="true" className="size-4" /> },
    missed: { label: "Missed", className: "bg-destructive/10 text-destructive", icon: <X aria-hidden="true" className="size-4" /> },
    snoozed: { label: "Snoozed", className: "bg-accent text-accent-foreground", icon: <Clock3 aria-hidden="true" className="size-4" /> },
  }[status];
  return <span className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${config.className}`}>{config.icon}{config.label}</span>;
}

function AdherencePanel({ today, logs }: { today: { medicine: Medication; time: string; iso: string }[]; logs: DoseLog[] }) {
  const taken = today.filter((dose) => getDoseStatus(dose.medicine.id, dose.iso, logs) === "taken").length;
  const percentage = adherencePercentage(taken, today.length);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pastWeek = logs.filter((log) => new Date(log.scheduled_for) >= weekAgo);
  const missed = pastWeek.filter((log) => log.status === "missed").length;
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-base font-semibold text-primary">YOUR ROUTINE</p><h2 className="mt-1 text-xl font-semibold text-foreground">Today’s progress</h2></div><span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-primary"><Activity aria-hidden="true" /></span></div><div className="mt-5 flex items-end justify-between gap-3"><span className="text-4xl font-semibold text-foreground">{percentage}%</span><span className="pb-1 text-base text-muted-foreground">{taken} of {today.length} doses taken</span></div><Progress value={percentage} className="mt-3 h-3 bg-muted [&>div]:bg-primary" aria-label={`Today's medication adherence ${percentage}%`} /><div className="mt-4 flex items-center gap-2 text-base text-muted-foreground"><span className="size-2.5 rounded-full bg-due" /> {missed} doses marked missed this week</div><p className="mt-3 text-sm leading-5 text-muted-foreground">Only doses a Circle member confirms are counted as taken.</p></section>
  );
}

function WellnessPanel() {
  const [feeling, setFeeling] = useState("");
  const answers = ["Feeling well", "A little off", "Need help"];
  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold text-primary">DAILY CHECK-IN</p><h2 className="mt-1 text-xl font-semibold text-foreground">How are you feeling?</h2></div><span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-primary"><Heart aria-hidden="true" /></span></div><p className="mt-2 text-base text-muted-foreground">A small check-in helps your Circle stay connected.</p><div className="mt-4 grid gap-2">{answers.map((answer) => <Button key={answer} type="button" variant={feeling === answer ? "secondary" : "outline"} onClick={() => { setFeeling(answer); toast.success("Thanks for checking in. Tell someone in your Circle if you need support."); }} className="min-h-11 justify-start rounded-xl px-4 text-base">{feeling === answer ? <CheckCircle2 aria-hidden="true" /> : <span className="size-5 rounded-full border border-input" />} {answer}</Button>)}</div><p className="mt-3 text-xs text-muted-foreground">This check-in stays on this screen and isn’t saved or sent to anyone yet.</p></section>
  );
}

function EmergencyPanel({ profile }: { profile: Profile }) {
  return (
    <section className="rounded-3xl border border-destructive/20 bg-destructive/5 p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><Bell aria-hidden="true" /></span><div><h2 className="text-xl font-semibold text-foreground">Need help right now?</h2><p className="mt-1 text-base text-muted-foreground">CareSync doesn’t contact emergency services.</p></div></div>{profile.emergency_contact_name && profile.emergency_contact_phone ? <a href={`tel:${profile.emergency_contact_phone.replace(/[^\d+]/g, "")}`} className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-base font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Call {profile.emergency_contact_name}<ArrowUpRight aria-hidden="true" /></a> : <p className="mt-4 rounded-xl bg-background px-4 py-3 text-base text-muted-foreground">No emergency contact is set on this care profile.</p>}</section>
  );
}

function MedicationView({
  role,
  medications,
  logs,
  profile,
  isPreview,
  isLoading,
  formOpen,
  onFormOpen,
  onSubmit,
  onDoseAction,
}: {
  role: Role;
  medications: Medication[];
  logs: DoseLog[];
  profile: Profile;
  isPreview: boolean;
  isLoading: string | null;
  formOpen: boolean;
  onFormOpen: (open: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDoseAction: (medicine: Medication, time: string, action: "taken" | "missed" | "snoozed") => void;
}) {
  const today = getLocalDateTimeParts(new Date(), profile.time_zone);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-base font-semibold text-primary">A ROUTINE THAT FITS REAL LIFE</p><h1 className="mt-1 text-4xl font-semibold text-foreground">Medication schedule</h1><p className="mt-2 text-base text-muted-foreground">Clear schedules, confirmed actions, and a careful history.</p></div>{canManageSchedule(role) && <Button disabled={isPreview} onClick={() => onFormOpen(!formOpen)} className="min-h-12 rounded-full px-6">{formOpen ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}{formOpen ? "Close form" : "Add medication"}</Button>}</div>
      {!canManageSchedule(role) && <p className="mt-5 rounded-2xl border border-border bg-card px-5 py-4 text-base text-muted-foreground">The profile owner or a family administrator manages medication schedules. You can still record care tasks assigned to you.</p>}
      {formOpen && canManageSchedule(role) && !isPreview && <section className="mt-6 rounded-3xl border border-primary/20 bg-card p-5 sm:p-7"><h2 className="text-2xl font-semibold text-foreground">Add a medication</h2><p className="mt-1 text-base text-muted-foreground">Use the directions provided by the prescribing clinician.</p><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void onSubmit(event)}><Field label="Medication name" name="medicineName" required maxLength={120} placeholder="Name on the package" /><Field label="Dose" name="dosage" required maxLength={120} placeholder="For example, 1 tablet · 10 mg" /><div className="grid gap-2"><Label htmlFor="medicine-frequency" className="text-base">How often?</Label><select id="medicine-frequency" name="frequency" className="min-h-12 rounded-xl border border-input bg-background px-4 text-base"><option value="daily">Every day</option><option value="weekly">Selected days each week</option><option value="custom">Custom weekly schedule</option></select></div><Field label="Dose times, 24-hour clock · separate with commas" name="times" required maxLength={70} placeholder="08:00, 20:00" /><fieldset className="grid gap-2 sm:col-span-2"><legend className="mb-2 text-base font-medium text-foreground">Days for weekly or custom schedule</legend><div className="flex flex-wrap gap-2">{weekdays.map((day, index) => <label key={day} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input px-3 text-base"><input name="weekdays" type="checkbox" value={index} defaultChecked className="size-4 accent-primary" />{day}</label>)}</div></fieldset><Field label="Start date" name="startDate" type="date" required /><Field label="End date · optional" name="endDate" type="date" /><Field label="Prescribing clinician · optional" name="doctor" maxLength={120} placeholder="Clinician name" /><div className="grid gap-2"><Label htmlFor="medicine-instructions" className="text-base">Instructions · optional</Label><input id="medicine-instructions" name="instructions" maxLength={500} placeholder="For example, take with food" className="min-h-12 rounded-xl border border-input bg-background px-4 text-base" /></div><p className="text-sm leading-5 text-muted-foreground sm:col-span-2">Schedules use {profile.time_zone}. Changing an existing prescription? Contact the care team and add the updated schedule with the clinician’s confirmed directions.</p><Button type="submit" disabled={isLoading === "medication"} className="min-h-12 rounded-full sm:col-span-2">{isLoading === "medication" ? "Saving…" : "Add to schedule"} <ArrowRight aria-hidden="true" /></Button></form></section>}
      {medications.length === 0 ? <EmptySection title="No medications yet" detail="When a medication is added to this CareCircle, its scheduled times and dose actions will appear here." icon={<Pill aria-hidden="true" />} /> : <section className="mt-6 grid gap-4" aria-label="Your medications">{medications.map((medicine) => <article key={medicine.id} className="rounded-3xl border border-border bg-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><Pill aria-hidden="true" className="size-5" /></span><div><h2 className="text-xl font-semibold text-foreground">{medicine.name}</h2><p className="mt-1 text-base text-muted-foreground">{medicine.dosage}</p>{medicine.instructions && <p className="mt-2 text-base text-foreground">{medicine.instructions}</p>}{medicine.prescribing_doctor && <p className="mt-1 text-sm text-muted-foreground">Prescribed by {medicine.prescribing_doctor}</p>}</div></div><span className="min-h-8 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">{medicine.frequency === "daily" ? "Every day" : `${medicine.weekdays.map((day) => weekdays[day]).join(", ")}`} · starts {medicine.start_date}</span></div><div className="mt-4 flex flex-wrap gap-3">{medicine.scheduled_times.map((time) => { const iso = localMedicationTimeToIso(today.date, time, profile.time_zone); const status = getDoseStatus(medicine.id, iso, logs); return <div key={time} className="min-w-0 flex-1 basis-[250px] rounded-2xl border border-border p-4"><div className="flex items-center justify-between gap-2"><span className="text-lg font-semibold text-foreground">{formatLocalTime(time)}</span><StatusPill status={status} /></div>{status !== "taken" && !isPreview && mayRecordDose(role) && <div className="mt-3 flex flex-wrap gap-2"><Button disabled={isLoading !== null} size="sm" onClick={() => onDoseAction(medicine, time, "taken")} className="min-h-10 rounded-full"><Check aria-hidden="true" /> Taken</Button><Button disabled={isLoading !== null} size="sm" variant="outline" onClick={() => onDoseAction(medicine, time, "snoozed")} className="min-h-10 rounded-full">Snooze</Button><Button disabled={isLoading !== null} size="sm" variant="outline" onClick={() => onDoseAction(medicine, time, "missed")} className="min-h-10 rounded-full text-destructive">Missed</Button></div>}</div>; })}</div></article>)}</section>}
    </div>
  );
}

function HistoryView({ medications, logs, timeZone }: { medications: Medication[]; logs: DoseLog[]; timeZone: string }) {
  const [range, setRange] = useState<"week" | "month">("week");
  const cutoff = new Date(Date.now() - (range === "week" ? 7 : 30) * 24 * 60 * 60 * 1000);
  const filtered = logs.filter((log) => new Date(log.scheduled_for) >= cutoff).sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for));
  const medicineNames = new Map(medications.map((medicine) => [medicine.id, medicine.name]));
  const takeCount = filtered.filter((log) => log.status === "taken").length;
  return (
    <div><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-base font-semibold text-primary">A CLEAR RECORD OF CARE</p><h1 className="mt-1 text-4xl font-semibold text-foreground">Dose history</h1><p className="mt-2 text-base text-muted-foreground">Taken doses, snoozes, and missed doses recorded by your Circle.</p></div><Tabs value={range} onValueChange={(value) => setRange(value as "week" | "month")}><TabsList className="min-h-11 rounded-full bg-background p-1"><TabsTrigger value="week" className="min-h-9 rounded-full px-4 text-base">7 days</TabsTrigger><TabsTrigger value="month" className="min-h-9 rounded-full px-4 text-base">30 days</TabsTrigger></TabsList></Tabs></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><StatCard title="Actions recorded" value={String(filtered.length)} caption={range === "week" ? "in the last seven days" : "in the last 30 days"} icon={<ClipboardCheck aria-hidden="true" />} /><StatCard title="Marked taken" value={String(takeCount)} caption="confirmed by a Circle member" icon={<CheckCircle2 aria-hidden="true" />} /><StatCard title="Marked missed" value={String(filtered.filter((log) => log.status === "missed").length)} caption="not automatically assumed" icon={<Bell aria-hidden="true" />} /></div><section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card"><h2 className="border-b border-border px-5 py-4 text-xl font-semibold text-foreground sm:px-6">Recent activity</h2>{filtered.length === 0 ? <p className="px-6 py-10 text-center text-base text-muted-foreground">There are no recorded dose actions in this date range.</p> : <ul className="divide-y divide-border px-5 sm:px-6">{filtered.map((log, index) => <li key={`${log.medication_id}-${log.scheduled_for}-${index}`} className="flex flex-wrap items-center gap-3 py-4"><span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-primary"><Activity aria-hidden="true" /></span><div className="min-w-40 flex-1"><p className="text-base font-semibold text-foreground">{medicineNames.get(log.medication_id) ?? "Medication"}</p><p className="mt-1 text-sm text-muted-foreground">Scheduled {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(log.scheduled_for))}{log.taken_at ? ` · confirmed ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(log.taken_at))}` : ""}</p></div><StatusPill status={log.status} /></li>)}</ul>}</section><p className="mt-4 text-sm leading-5 text-muted-foreground">Actions are preserved as recorded. CareSync does not recommend taking extra medication to make up for a missed dose.</p></div>
  );
}

function CircleView({ profile, role, members, invitationCode, inviteRole, isPreview, isLoading, onInviteRoleChange, onCreateInvitation, onCopyCode }: { profile: Profile; role: Role; members: CircleMember[]; invitationCode: string; inviteRole: "family_admin" | "caregiver"; isPreview: boolean; isLoading: string | null; onInviteRoleChange: (role: "family_admin" | "caregiver") => void; onCreateInvitation: () => void; onCopyCode: () => void }) {
  const canInvite = role === "elderly" || role === "family_admin";
  return (
    <div><p className="text-base font-semibold text-primary">CONNECTED WITH CONSENT</p><h1 className="mt-1 text-4xl font-semibold text-foreground">Your CareCircle</h1><p className="mt-2 max-w-2xl text-base leading-6 text-muted-foreground">Your healthcare profile is shared only with the people connected through an active invitation. The profile owner can revoke access at any time.</p><div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(310px,.7fr)]"><section className="rounded-3xl border border-border bg-card"><div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-xl font-semibold text-foreground">People in {profile.display_name}’s Circle</h2><p className="mt-1 text-base text-muted-foreground">Current health information is visible to approved Circle members.</p></div>{members.length === 0 ? <p className="px-6 py-8 text-base text-muted-foreground">No Circle members found.</p> : <ul className="divide-y divide-border px-5 sm:px-6">{members.map((member) => <li key={member.user_id} className="flex flex-wrap items-center gap-3 py-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><CircleUserRound aria-hidden="true" /></span><div className="min-w-32 flex-1"><p className="text-base font-semibold text-foreground">{member.name}{member.role === role ? " · You" : ""}</p><p className="mt-1 text-sm text-muted-foreground">{displayRole(member.role)}</p></div><span className="flex min-h-9 items-center gap-1.5 rounded-full bg-success/10 px-3 text-sm font-semibold text-success-foreground"><CheckCircle2 aria-hidden="true" className="size-4" /> Connected</span></li>)}</ul>}</section><section className="rounded-3xl border border-border bg-card p-5 sm:p-6"><div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary"><ShieldCheck aria-hidden="true" /></div><h2 className="mt-4 text-xl font-semibold text-foreground">Invite someone you trust</h2><p className="mt-2 text-base leading-6 text-muted-foreground">Invitation codes work once, belong to one role, and expire after seven days.</p>{canInvite ? <div className="mt-5 grid gap-3"><div className="grid gap-2"><Label htmlFor="invite-role" className="text-base">Circle role</Label><select id="invite-role" disabled={isPreview} value={inviteRole} onChange={(event) => onInviteRoleChange(event.target.value as "family_admin" | "caregiver")} className="min-h-12 rounded-xl border border-input bg-background px-4 text-base"><option value="family_admin">Family administrator</option><option value="caregiver">Caregiver</option></select></div><Button disabled={isPreview || isLoading === "invite"} onClick={onCreateInvitation} className="min-h-12 rounded-full">{isLoading === "invite" ? "Creating a secure code…" : "Create invitation"} <ArrowRight aria-hidden="true" /></Button>{invitationCode && <div className="rounded-2xl border border-border bg-muted p-4"><p className="text-sm font-semibold text-foreground">Share this invitation code</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all text-sm text-foreground">{invitationCode}</code><Button variant="outline" size="icon" className="min-h-11 min-w-11 shrink-0 rounded-full" onClick={onCopyCode} aria-label="Copy invitation code"><Copy aria-hidden="true" /></Button></div><p className="mt-2 text-xs leading-4 text-muted-foreground">This code is only shown once; save it before closing this page.</p></div>}</div> : <p className="mt-5 rounded-2xl bg-muted px-4 py-4 text-base leading-6 text-muted-foreground">Only the elderly person or a family administrator can invite new Circle members.</p>}</section></div><div className="mt-5 flex items-start gap-3 rounded-2xl border border-border bg-card p-5 text-base leading-6 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><p>Family and caregiver roles are stored with the care profile and enforced in the private data controls. Changing the sample role only previews the dashboard — it does not grant additional access.</p></div></div>
  );
}

function StatCard({ title, value, caption, icon }: { title: string; value: string; caption: string; icon: ReactNode }) {
  return <section className="rounded-3xl border border-border bg-card p-5"><span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-primary">{icon}</span><p className="mt-4 text-3xl font-semibold text-foreground">{value}</p><p className="mt-1 text-base font-semibold text-foreground">{title}</p><p className="mt-1 text-sm text-muted-foreground">{caption}</p></section>;
}

function EmptySection({ title, detail, icon }: { title: string; detail: string; icon: ReactNode }) {
  return <section className="mt-6 rounded-3xl border border-border bg-card px-5 py-14 text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">{icon}</div><h2 className="mt-4 text-2xl font-semibold text-foreground">{title}</h2><p className="mx-auto mt-2 max-w-xl text-base leading-6 text-muted-foreground">{detail}</p></section>;
}

function CareNotice() {
  return <p className="flex items-start gap-2 text-sm leading-5 text-muted-foreground"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> CareSync helps people coordinate care and reminders. It isn’t a substitute for medical advice or emergency services. Follow a clinician’s instructions.</p>;
}

function TrustFooter() {
  return <div className="mx-auto mt-7 flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-2 py-1 text-sm text-muted-foreground"><p className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-4 text-primary" /> Your Circle, your choice, your care.</p><p>Never a substitute for professional medical care.</p></div>;
}