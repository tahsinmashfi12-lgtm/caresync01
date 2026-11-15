export type DoseStatus = "due" | "taken" | "missed" | "snoozed";

export type DoseLogStatus = Exclude<DoseStatus, "due">;

export type DoseLogSummary = {
  medication_id: string;
  scheduled_for: string;
  status: DoseLogStatus;
};

/** A scheduled dose stays due until an authorized person records an actual action. */
export function getDoseStatus(
  medicationId: string,
  scheduledFor: string,
  logs: DoseLogSummary[],
): DoseStatus {
  const recordedAction = logs.find(
    (log) => log.medication_id === medicationId && log.scheduled_for === scheduledFor,
  );
  return recordedAction?.status ?? "due";
}

export function adherencePercentage(taken: number, scheduled: number): number {
  if (scheduled <= 0) return 0;
  return Math.round((Math.max(0, taken) / scheduled) * 100);
}

export function parseMedicationTimes(input: string): string[] {
  return [...new Set(input.split(",").map((value) => value.trim()).filter(Boolean))];
}

export function isValidMedicationTimes(times: string[]): boolean {
  return (
    times.length >= 1 &&
    times.length <= 8 &&
    times.every((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
  );
}

export function getLocalDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const hours = Number(read("hour"));
  const minutes = Number(read("minute"));
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hours,
    minutes,
  };
}

/** Interpret a clock time in the elderly person's zone, not the viewer's zone. */
export function localMedicationTimeToIso(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const targetUtc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0);
  const projected = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(targetUtc));
  const read = (type: string) => Number(projected.find((part) => part.type === type)?.value ?? "0");
  const projectedUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return new Date(targetUtc - (projectedUtc - targetUtc)).toISOString();
}