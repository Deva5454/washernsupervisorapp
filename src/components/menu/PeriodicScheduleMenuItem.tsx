import { useEffect, useState, type FormEvent } from "react";
import { MenuRow } from "../MenuRow";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import type { PeriodicSchedule } from "../../lib/types";

function isoDate(d: Date) {
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function sevenDaysFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return isoDate(d);
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function ScheduleRow({ schedule, onChanged }: { schedule: PeriodicSchedule; onChanged: () => void }) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState(schedule.next_due_date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmReschedule() {
    if (!newDate) return;
    if (schedule.used_this_month >= schedule.monthly_cap) {
      setError("Monthly cap reached for this customer");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from("periodic_schedules")
        .update({
          next_due_date: newDate,
          used_this_month: schedule.used_this_month + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", schedule.id);
      if (updateErr) throw updateErr;
      setRescheduleOpen(false);
      onChanged();
    } catch (err) {
      console.error(err);
      setError("Could not reschedule. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-gray-100 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-gray-900 truncate">{schedule.customer_name}</p>
          <p className="text-sm text-gray-500">{schedule.service_name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900">{new Date(schedule.next_due_date).toLocaleDateString("en-IN")}</p>
          <p className="text-xs text-gray-500">
            {schedule.used_this_month}/{schedule.monthly_cap} used
          </p>
        </div>
      </div>
      {!rescheduleOpen ? (
        <button onClick={() => setRescheduleOpen(true)} className="text-sm font-bold text-blue-600">
          Reschedule
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
          />
          <button
            onClick={confirmReschedule}
            disabled={busy}
            className="rounded-xl bg-blue-600 disabled:opacity-50 text-white font-bold px-3 py-2 text-sm"
          >
            {busy ? "…" : "Confirm"}
          </button>
          <button
            onClick={() => {
              setRescheduleOpen(false);
              setError(null);
            }}
            className="rounded-xl border border-gray-300 text-gray-700 font-bold px-3 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PeriodicSchedulePanel() {
  const { profile } = useAuth();
  const [schedules, setSchedules] = useState<PeriodicSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [area, setArea] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [frequencyDays, setFrequencyDays] = useState("30");
  const [nextDueDate, setNextDueDate] = useState(isoDate(new Date()));
  const [monthlyCap, setMonthlyCap] = useState("1");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSent, setAddSent] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.zone]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .from("periodic_schedules")
        .select("*")
        .lte("next_due_date", sevenDaysFromNow())
        .order("next_due_date", { ascending: true });
      if (profile?.zone) query = query.eq("zone", profile.zone);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data as PeriodicSchedule[]) ?? [];

      // used_this_month never resets on its own (no cron/edge-function
      // infra in this app) — reset it lazily here the first time a
      // schedule is viewed in a new calendar month, so the cap reads as
      // monthly rather than permanent after the first use.
      const now = new Date();
      const staleIds = rows
        .filter((s) => s.used_this_month > 0 && !isSameMonth(new Date(s.updated_at), now))
        .map((s) => s.id);
      if (staleIds.length) {
        const { error: resetErr } = await supabase
          .from("periodic_schedules")
          .update({ used_this_month: 0, updated_at: now.toISOString() })
          .in("id", staleIds);
        if (resetErr) throw resetErr;
      }

      setSchedules(rows.map((s) => (staleIds.includes(s.id) ? { ...s, used_this_month: 0 } : s)));
    } catch (err) {
      console.error(err);
      setLoadError("Could not load upcoming schedules.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const freq = Number(frequencyDays);
    const cap = Number(monthlyCap);
    if (!customerName.trim() || !serviceName.trim() || !nextDueDate || !Number.isFinite(freq) || !Number.isFinite(cap)) return;
    setAddBusy(true);
    setAddError(null);
    setAddSent(false);
    try {
      const { error } = await supabase.from("periodic_schedules").insert({
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        area: area.trim() || null,
        zone: profile?.zone ?? null,
        service_name: serviceName.trim(),
        frequency_days: freq,
        next_due_date: nextDueDate,
        monthly_cap: cap,
        used_this_month: 0,
      });
      if (error) throw error;
      setAddSent(true);
      setCustomerName("");
      setCustomerPhone("");
      setArea("");
      setServiceName("");
      setFrequencyDays("30");
      setNextDueDate(isoDate(new Date()));
      setMonthlyCap("1");
      await load();
    } catch (err) {
      console.error(err);
      setAddError("Could not add the schedule. Please try again.");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="px-4 pb-4 bg-white space-y-5">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Due in Next 7 Days</p>
        {loading ? (
          <p className="text-sm text-gray-400 py-1">Loading…</p>
        ) : loadError ? (
          <p className="text-sm text-red-600 py-1">{loadError}</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing due in the next 7 days.</p>
        ) : (
          <div className="space-y-2">
            {schedules.map((s) => (
              <ScheduleRow key={s.id} schedule={s} onChanged={load} />
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleAdd} className="space-y-2 pt-3 border-t border-gray-100">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Add Schedule</p>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer name"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          placeholder="Area (optional)"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <input
          type="text"
          value={serviceName}
          onChange={(e) => setServiceName(e.target.value)}
          placeholder="Service name"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-gray-500">Frequency (days)</label>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={frequencyDays}
              onChange={(e) => setFrequencyDays(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Monthly cap</label>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={monthlyCap}
              onChange={(e) => setMonthlyCap(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500">Next due date</label>
          <input
            type="date"
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white"
          />
        </div>
        {addError && <p className="text-sm text-red-600">{addError}</p>}
        <button
          type="submit"
          disabled={addBusy || !customerName.trim() || !serviceName.trim()}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5"
        >
          {addBusy ? "Adding…" : "Add Schedule"}
        </button>
        {addSent && <p className="text-sm text-green-700">Schedule added.</p>}
      </form>
    </div>
  );
}

export function PeriodicScheduleMenuItem() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuRow label="Periodic Service Schedule" open={open} onClick={() => setOpen((v) => !v)} />
      {open && <PeriodicSchedulePanel />}
    </>
  );
}
