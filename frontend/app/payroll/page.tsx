"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft, Wallet, RefreshCw, Printer, Save, Users, CalendarDays,
  IndianRupee, FileText, CircleCheck, Clock3, ChevronRight, Banknote,
} from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";
const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";
const labelClass = "block text-sm font-semibold text-slate-700";

type Employee = { _id: string; employeeCode: string; firstName: string; lastName: string; employmentStatus: string };
type Line = { name: string; amount: number };
type Structure = { _id: string; employee: Employee; monthlyBasic: number; earnings: Line[]; deductions: Line[]; effectiveFrom: string };
type PayrollRecord = { _id: string; employee: Employee; period: string; workingDays: number; paidDays: number; basic: number; earnings: Line[]; deductions: Line[]; grossEarnings: number; totalDeductions: number; netPay: number; status: string; paidAt?: string };

function parseLines(value: string): Line[] {
  if (!value.trim()) return [];
  return value.split("\n").map((row) => {
    const separator = row.lastIndexOf("=");
    if (separator < 1) throw new Error("Use one component per line in Name=Amount format.");
    const name = row.slice(0, separator).trim();
    const amount = Number(row.slice(separator + 1).trim());
    if (!name || !Number.isFinite(amount) || amount < 0) throw new Error("Each component needs a name and a non-negative amount.");
    return { name, amount };
  });
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function PayrollContent() {
  const [role, setRole] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [workingDays, setWorkingDays] = useState("26");
  const [paidDays, setPaidDays] = useState<Record<string, string>>({});
  const [employeeId, setEmployeeId] = useState("");
  const [monthlyBasic, setMonthlyBasic] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [earningsText, setEarningsText] = useState("");
  const [deductionsText, setDeductionsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedSlip, setSelectedSlip] = useState<PayrollRecord | null>(null);

  const isAdmin = role === "admin" || role === "hr";
  const token = () => sessionStorage.getItem("hrms_token") || "";

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || "Request failed");
    return result;
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
      setRole(user.role || "");
      const payrollResult = await apiRequest(`/payroll?period=${encodeURIComponent(period)}`);
      setRecords(payrollResult.data || []);
      if (user.role === "admin" || user.role === "hr") {
        const [employeeResult, structureResult] = await Promise.all([
          apiRequest("/employees"),
          apiRequest("/payroll/salary-structures"),
        ]);
        const activeEmployees = (employeeResult.data || []).filter((item: Employee) => item.employmentStatus === "active");
        setEmployees(activeEmployees);
        setStructures(structureResult.data || []);
        setPaidDays((previous) => {
          const next = { ...previous };
          for (const item of structureResult.data || []) if (next[item.employee._id] === undefined) next[item.employee._id] = workingDays;
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load payroll");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, period, workingDays]);

  useEffect(() => { loadPage(); }, [loadPage]);

  const structureEmployeeIds = useMemo(() => new Set(structures.map((item) => item.employee?._id)), [structures]);
  const totalNet = records.reduce((sum, item) => sum + item.netPay, 0);
  const totalGross = records.reduce((sum, item) => sum + item.grossEarnings, 0);
  const paidCount = records.filter((item) => item.status === "paid").length;

  const saveStructure = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const earnings = parseLines(earningsText);
      const deductions = parseLines(deductionsText);
      const result = await apiRequest(`/payroll/salary-structures/${employeeId}`, {
        method: "PUT",
        body: JSON.stringify({ monthlyBasic: Number(monthlyBasic), earnings, deductions, effectiveFrom }),
      });
      setMessage(result.message);
      setEmployeeId(""); setMonthlyBasic(""); setEarningsText(""); setDeductionsText("");
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save salary structure");
    } finally { setBusy(false); }
  };

  const processPayroll = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const days = Number(workingDays);
      const payload = structures.map((item) => ({ employeeId: item.employee._id, paidDays: Number(paidDays[item.employee._id] ?? workingDays) }));
      if (!payload.length) throw new Error("Create salary structures before processing payroll.");
      const result = await apiRequest("/payroll/process", { method: "POST", body: JSON.stringify({ period, workingDays: days, employees: payload }) });
      setMessage(result.message);
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process payroll");
    } finally { setBusy(false); }
  };

  const markPaid = async (id: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await apiRequest(`/payroll/${id}/paid`, { method: "PATCH" });
      setMessage(result.message);
      await loadPage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update payment status");
    } finally { setBusy(false); }
  };

  const printPayslip = () => { if (selectedSlip) window.print(); };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700"><ArrowLeft size={16} />Dashboard <ChevronRight size={14} /> Payroll</Link>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-600/20"><Wallet size={25} /></div>
              <div><h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Payroll Management</h1><p className="mt-1 text-sm text-slate-500">Salary setup, monthly processing and employee payslips.</p></div>
            </div>
          </div>
          <button type="button" onClick={loadPage} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh data</button>
        </header>

        {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span className="font-bold">!</span><span>{error}</span></div>}
        {message && <div role="status" className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CircleCheck size={18} />{message}</div>}

        <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Payroll period</span><CalendarDays size={19} className="text-blue-600" /></div><p className="mt-3 text-2xl font-bold text-slate-900">{period || "—"}</p><p className="mt-1 text-xs text-slate-400">Selected month</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Employees processed</span><Users size={19} className="text-violet-600" /></div><p className="mt-3 text-2xl font-bold text-slate-900">{records.length}</p><p className="mt-1 text-xs text-slate-400">For selected period</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Total gross</span><Banknote size={19} className="text-amber-600" /></div><p className="mt-3 text-2xl font-bold text-slate-900">{money(totalGross)}</p><p className="mt-1 text-xs text-slate-400">Before deductions</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{isAdmin ? "Net payroll" : "Net salary"}</span><IndianRupee size={19} className="text-emerald-600" /></div><p className="mt-3 text-2xl font-bold text-slate-900">{money(totalNet)}</p><p className="mt-1 text-xs text-slate-400">{paidCount} of {records.length} marked paid</p></div>
        </section>

        {isAdmin && <>
          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-5 sm:px-7">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><Wallet size={21} /></div><div><h2 className="text-lg font-bold text-slate-900">Salary Structure</h2><p className="mt-1 text-sm text-slate-500">Define the monthly basic salary and additional components.</p></div></div>
            </div>
            <form onSubmit={saveStructure} className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2 sm:p-7">
              <label className={labelClass}>Employee
                <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}><option value="">Select an active employee</option>{employees.map((item) => <option key={item._id} value={item._id}>{item.employeeCode} — {item.firstName} {item.lastName}</option>)}</select>
              </label>
              <label className={labelClass}>Monthly basic salary (₹)
                <input required type="number" min="0" step="0.01" value={monthlyBasic} onChange={(e) => setMonthlyBasic(e.target.value)} placeholder="e.g. 25000" className={inputClass} />
              </label>
              <label className={labelClass}>Effective from
                <input required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className={inputClass} />
              </label>
              <div className="flex items-end text-xs leading-5 text-slate-500">{employeeId && structureEmployeeIds.has(employeeId) ? "An existing salary structure is on file. Saving will replace it for future payroll runs; processed payroll remains unchanged." : "Add a salary structure for an employee who is not yet configured."}</div>
              <label className={labelClass}>Earnings components <span className="font-normal text-slate-400">(Name=Amount, one per line)</span>
                <textarea rows={4} value={earningsText} onChange={(e) => setEarningsText(e.target.value)} placeholder={"House Rent Allowance=5000\nTravel Allowance=1500"} className={`${inputClass} resize-y font-mono text-xs leading-6`} />
              </label>
              <label className={labelClass}>Deduction components <span className="font-normal text-slate-400">(Name=Amount, one per line)</span>
                <textarea rows={4} value={deductionsText} onChange={(e) => setDeductionsText(e.target.value)} placeholder={"Provident Fund=1800\nProfessional Tax=200"} className={`${inputClass} resize-y font-mono text-xs leading-6`} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 sm:col-span-2">
                <p className="text-xs text-slate-500">Amounts are monthly values and are prorated using paid days.</p>
                <button type="submit" disabled={busy || !employees.length || !employeeId || !monthlyBasic} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"><Save size={17} />{busy ? "Saving..." : "Save salary structure"}</button>
              </div>
            </form>
          </section>

          <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
              <div><h2 className="text-lg font-bold text-slate-900">Process monthly payroll</h2><p className="mt-1 text-sm text-slate-500">Set working days and verify each employee's payable days.</p></div>
              <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">{structures.length} salary structures</span>
            </div>
            <div className="p-5 sm:p-7">
              <div className="mb-5 grid gap-4 sm:max-w-xl sm:grid-cols-2">
                <label className={labelClass}>Payroll month<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputClass} /></label>
                <label className={labelClass}>Working days<input type="number" min="1" max="31" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} className={inputClass} /></label>
              </div>
              {structures.length > 0 ? <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">Monthly gross</th><th className="px-4 py-3 font-semibold">Paid days</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{structures.map((item) => <tr key={item._id} className="transition hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-semibold text-slate-800">{item.employee?.firstName} {item.employee?.lastName}</p><p className="mt-0.5 text-xs text-slate-400">{item.employee?.employeeCode}</p></td><td className="px-4 py-3 font-medium text-slate-700">{money(item.monthlyBasic + item.earnings.reduce((s, x) => s + x.amount, 0))}</td><td className="px-4 py-3"><input aria-label={`Paid days for ${item.employee?.employeeCode}`} type="number" min="0" max={workingDays} step="0.5" value={paidDays[item.employee._id] ?? workingDays} onChange={(e) => setPaidDays((prev) => ({ ...prev, [item.employee._id]: e.target.value }))} className="w-28 rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" /></td></tr>)}</tbody>
                </table></div>
              </div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"><Users className="mx-auto text-slate-400" size={28} /><p className="mt-3 font-semibold text-slate-700">No salary structures yet</p><p className="mt-1 text-sm text-slate-500">Create employee salary structures above before processing payroll.</p></div>}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-2xl text-xs leading-5 text-amber-700"><Clock3 size={14} className="mr-1 inline" /> Processing creates final records for this employee/month. Verify paid days and statutory deductions before proceeding. Existing payroll records are not overwritten.</p>
                <button type="button" onClick={processPayroll} disabled={busy || !structures.length || !period || Number(workingDays) < 1} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-violet-600/20 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Processing..." : "Process payroll"}<ChevronRight size={17} /></button>
              </div>
            </div>
          </section>
        </>}

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><FileText size={21} /></div><div><h2 className="text-lg font-bold text-slate-900">{isAdmin ? "Payroll register" : "My payslips"}</h2><p className="mt-1 text-sm text-slate-500">Payroll records for the selected month.</p></div></div>
            <label className="text-xs font-semibold text-slate-500">PERIOD<input aria-label="Payroll register period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-blue-500" /></label>
          </div>
          {loading ? <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500"><RefreshCw size={17} className="animate-spin" />Loading payroll records...</div> : records.length === 0 ? <div className="px-5 py-16 text-center"><FileText className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-semibold text-slate-700">No payroll records found</p><p className="mt-1 text-sm text-slate-500">There are no processed records for {period}.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{isAdmin && <th className="px-5 py-3 font-semibold">Employee</th>}<th className="px-5 py-3 font-semibold">Period</th><th className="px-5 py-3 font-semibold">Gross pay</th><th className="px-5 py-3 font-semibold">Deductions</th><th className="px-5 py-3 font-semibold">Net pay</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{records.map((item) => <tr key={item._id} className="transition hover:bg-slate-50/70">{isAdmin && <td className="px-5 py-4"><p className="font-semibold text-slate-800">{item.employee?.firstName} {item.employee?.lastName}</p><p className="mt-0.5 text-xs text-slate-400">{item.employee?.employeeCode}</p></td>}<td className="px-5 py-4 font-medium text-slate-700">{item.period}</td><td className="px-5 py-4 text-slate-700">{money(item.grossEarnings)}</td><td className="px-5 py-4 text-slate-600">{money(item.totalDeductions)}</td><td className="px-5 py-4 font-bold text-slate-900">{money(item.netPay)}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${item.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><span className={`h-1.5 w-1.5 rounded-full ${item.status === "paid" ? "bg-emerald-500" : "bg-amber-500"}`} />{item.status}</span></td><td className="px-5 py-4"><div className="flex items-center gap-3 whitespace-nowrap"><button type="button" onClick={() => setSelectedSlip(item)} className="font-semibold text-blue-600 transition hover:text-blue-800">View payslip</button>{isAdmin && item.status !== "paid" && <button type="button" onClick={() => markPaid(item._id)} disabled={busy} className="font-semibold text-emerald-700 transition hover:text-emerald-900 disabled:opacity-50">Mark paid</button>}</div></td></tr>)}</tbody>
          </table></div>}
        </section>

        {selectedSlip && <section className="print-slip mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Payroll statement</p><h2 className="mt-2 text-2xl font-bold text-slate-900">Payslip</h2><p className="mt-1 text-sm text-slate-500">Salary period: {selectedSlip.period}</p></div><button type="button" onClick={printPayslip} className="no-print inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Printer size={16} />Print payslip</button></div>
          <div className="grid gap-3 border-b border-slate-100 py-5 text-sm sm:grid-cols-2"><p><span className="text-slate-500">Employee</span><br /><b className="mt-1 inline-block text-slate-900">{selectedSlip.employee?.firstName} {selectedSlip.employee?.lastName}</b></p><p><span className="text-slate-500">Employee code</span><br /><b className="mt-1 inline-block text-slate-900">{selectedSlip.employee?.employeeCode}</b></p><p><span className="text-slate-500">Paid days</span><br /><b className="mt-1 inline-block text-slate-900">{selectedSlip.paidDays} / {selectedSlip.workingDays}</b></p><p><span className="text-slate-500">Payment status</span><br /><b className="mt-1 inline-block capitalize text-slate-900">{selectedSlip.status}</b></p></div>
          <div className="mt-6 grid gap-8 sm:grid-cols-2"><div><h3 className="font-bold text-slate-900">Earnings</h3><div className="mt-3 flex justify-between border-b border-slate-100 py-3 text-sm"><span className="text-slate-600">Basic</span><b>{money(selectedSlip.basic)}</b></div>{selectedSlip.earnings.map((line) => <div key={line.name} className="flex justify-between border-b border-slate-100 py-3 text-sm"><span className="text-slate-600">{line.name}</span><b>{money(line.amount)}</b></div>)}<div className="flex justify-between py-4 font-bold text-slate-900"><span>Gross earnings</span><span>{money(selectedSlip.grossEarnings)}</span></div></div><div><h3 className="font-bold text-slate-900">Deductions</h3>{selectedSlip.deductions.map((line) => <div key={line.name} className="flex justify-between border-b border-slate-100 py-3 text-sm"><span className="text-slate-600">{line.name}</span><b>{money(line.amount)}</b></div>)}<div className="flex justify-between py-4 font-bold text-slate-900"><span>Total deductions</span><span>{money(selectedSlip.totalDeductions)}</span></div></div></div>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-5 text-white"><div><p className="text-sm text-slate-300">Net salary payable</p><p className="mt-1 text-xs text-slate-400">After configured deductions</p></div><p className="text-2xl font-bold sm:text-3xl">{money(selectedSlip.netPay)}</p></div>
        </section>}
        <style jsx global>{`@media print { body * { visibility: hidden; } .print-slip, .print-slip * { visibility: visible; } .print-slip { position: absolute; inset: 0; width: 100%; box-shadow: none; border: 0; } .no-print { display: none !important; } }`}</style>
      </div>
    </main>
  );
}

export default function PayrollPage() {
  return <AuthGuard><PayrollContent /></AuthGuard>;
}
