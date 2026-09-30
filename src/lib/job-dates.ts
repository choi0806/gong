// Date-only deadlines include the entire Korean calendar day. Never guess a year.
export function normalizeJobDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(.*)$/);
  if (!match) return undefined;
  const [, y, m, d, tail] = match;
  const date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return undefined;
  if (!tail || /^\s*\([월화수목금토일]\)$/.test(tail)) return date;
  if (!/^[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(tail)) return undefined;
  const time = date + tail.replace(/^ /, "T");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(time) ? time : `${time}+09:00`;
  return Number.isFinite(Date.parse(zoned)) ? zoned : undefined;
}
export function dateTime(value: string | undefined, endOfDay = false): number {
  const date = normalizeJobDate(value);
  if (!date) return NaN;
  return Date.parse(date.length === 10 ? `${date}T${endOfDay ? "23:59:59.999" : "00:00:00"}+09:00` : date);
}
export function displayDate(value?: string): string {
  const time = dateTime(value);
  if (!Number.isFinite(time)) return "미확인";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", ...(value!.length > 10 ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) }).format(time);
}
