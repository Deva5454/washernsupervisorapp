// Local-timezone calendar date (YYYY-MM-DD), matching Postgres `date`
// columns exactly. Never use `new Date().toISOString().slice(0, 10)`
// for "today" — that's UTC and runs a day behind local time between
// 00:00 and 05:29 IST (this app is built for Pune/IST).
export function localDateISO(d: Date = new Date()): string {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}
