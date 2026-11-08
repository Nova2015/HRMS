"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Wallet, RefreshCw, Printer, CheckCircle2, Save } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";

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
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
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

  const saveStructure = async (event: React.FormEvent<HTMLFormElement>) => {
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

  const printPayslip = () => {
    if (!selectedSlip) return;
    window.print();
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={16} />Back to Dashboard</Link>
            <h1 className="text-3xl font-bold text-slate-900">Payroll Management</h1>
            <p className="mt-2 text-slate-500">Salary structures, monthly payroll processing and payslips.</p>
          </div>
          <button onClick={loadPage} disabled={loading} className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700"><RefreshCw size={17} />Refresh</button>
        </header>

        {error && <div className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {message && <div className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">{message}</div>}

        {isAdmin && <>
          <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3"><Wallet className="text-blue-600" size={24} /><div><h2 className="text-xl font-bold text-slate-900">Salary Structure</h2><p className="text-sm text-slate-500">Set monthly basic pay and configurable earning/deduction components.</p></div></div>
            <form onSubmit={saveStructure} className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Employee
                <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5">
                  <option value="">Select employee</option>
                  {employees.map((item) => <option key={item._id} value={item._id}>{item.employeeCode} — {item.firstName} {item.lastName}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Monthly Basic (₹)
                <input required type="number" min="0" step="0.01" value={monthlyBasic} onChange={(e) => setMonthlyBasic(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Effective From
                <input required type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
              </label>
              <div className="text-sm text-slate-500 self-end">{employeeId && structureEmployeeIds.has(employeeId) ? "Existing structure will be replaced for future payroll runs. Already processed payroll is unchanged." : "A new salary structure will be created."}</div>
              <label className="text-sm font-medium text-slate-700">Earnings — one per line: Name=Amount
                <textarea rows={4} value={earningsText} onChange={(e) => setEarningsText(e.target.value)} placeholder={"House Rent Allowance=5000\nTravel Allowance=1500"} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Deductions — one per line: Name=Amount
                <textarea rows={4} value={deductionsText} onChange={(e) => setDeductionsText(e.target.value)} placeholder={"Provident Fund=1800\nProfessional Tax=200"} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal" />
              </label>
              <div className="md:col-span-2"><button disabled={busy || !employees.length} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Save size={17} />{busy ? "Saving..." : "Save Salary Structure"}</button></div>
            </form>
          </section>

          <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Process Monthly Payroll</h2>
            <p className="mt-1 text-sm text-slate-500">Review payable days for every employee with a saved salary structure.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Payroll Month<input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
              <label className="text-sm font-medium text-slate-700">Working Days<input type="number" min="1" max="31" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" /></label>
            </div>
            {structures.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">Employee</th><th className="p-3">Monthly Gross</th><th className="p-3">Paid Days</th></tr></thead><tbody className="divide-y">{structures.map((item) => <tr key={item._id}><td className="p-3 font-medium">{item.employee?.employeeCode} — {item.employee?.firstName} {item.employee?.lastName}</td><td className="p-3">{money(item.monthlyBasic + item.earnings.reduce((s, x) => s + x.amount, 0))}</td><td className="p-3"><input type="number" min="0" max={workingDays} step="0.5" value={paidDays[item.employee._id] ?? workingDays} onChange={(e) => setPaidDays((prev) => ({ ...prev, [item.employee._id]: e.target.value }))} className="w-28 rounded border border-slate-300 p-2" /></td></tr>)}</tbody></table></div>}
            <button onClick={processPayroll} disabled={busy || !structures.length || !period} className="mt-5 rounded-lg bg-purple-600 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">{busy ? "Processing..." : "Process Payroll"}</button>
            <p className="mt-3 text-xs text-amber-700">Processing is final for the selected employee/month. Existing payroll is never overwritten. Verify paid days and configured statutory components before processing.</p>
          </section>
        </>}

        <section className="rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">{isAdmin ? "Payroll Register" : "My Payslips"}</h2><p className="text-sm text-slate-500">Processed payroll for the selected month.</p></div><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-slate-300 p-2.5 text-sm" /></div>
          {loading ? <p className="py-8 text-center text-slate-500">Loading payroll...</p> : records.length === 0 ? <p className="py-8 text-center text-slate-500">No payroll records for this month.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{isAdmin && <th className="p-3">Employee</th>}<th className="p-3">Period</th><th className="p-3">Gross</th><th className="p-3">Deductions</th><th className="p-3">Net Pay</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y">{records.map((item) => <tr key={item._id}>{isAdmin && <td className="p-3">{item.employee?.employeeCode} — {item.employee?.firstName} {item.employee?.lastName}</td>}<td className="p-3">{item.period}</td><td className="p-3">{money(item.grossEarnings)}</td><td className="p-3">{money(item.totalDeductions)}</td><td className="p-3 font-semibold">{money(item.netPay)}</td><td className="p-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize">{item.status}</span></td><td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={() => setSelectedSlip(item)} className="text-blue-600 hover:underline">View Payslip</button>{isAdmin && item.status !== "paid" && <button onClick={() => markPaid(item._id)} disabled={busy} className="text-green-700 hover:underline">Mark Paid</button>}</div></td></tr>)}</tbody></table></div>}
        </section>

        {selectedSlip && <section className="print-slip mt-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900">Payslip</h2><p className="text-slate-500">Salary period: {selectedSlip.period}</p></div><button onClick={printPayslip} className="no-print flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"><Printer size={16} />Print</button></div>
          <div className="mt-6 grid gap-2 border-b pb-5 text-sm sm:grid-cols-2"><p><b>Employee:</b> {selectedSlip.employee?.firstName} {selectedSlip.employee?.lastName}</p><p><b>Employee Code:</b> {selectedSlip.employee?.employeeCode}</p><p><b>Paid Days:</b> {selectedSlip.paidDays} / {selectedSlip.workingDays}</p><p><b>Status:</b> {selectedSlip.status}</p></div>
          <div className="mt-5 grid gap-8 sm:grid-cols-2"><div><h3 className="font-bold">Earnings</h3><div className="mt-3 flex justify-between border-b py-2 text-sm"><span>Basic</span><span>{money(selectedSlip.basic)}</span></div>{selectedSlip.earnings.map((line) => <div key={line.name} className="flex justify-between border-b py-2 text-sm"><span>{line.name}</span><span>{money(line.amount)}</span></div>)}<div className="flex justify-between py-3 font-bold"><span>Gross Earnings</span><span>{money(selectedSlip.grossEarnings)}</span></div></div><div><h3 className="font-bold">Deductions</h3>{selectedSlip.deductions.map((line) => <div key={line.name} className="flex justify-between border-b py-2 text-sm"><span>{line.name}</span><span>{money(line.amount)}</span></div>)}<div className="flex justify-between py-3 font-bold"><span>Total Deductions</span><span>{money(selectedSlip.totalDeductions)}</span></div></div></div>
          <div className="mt-5 rounded-lg bg-slate-50 p-5 text-right"><p className="text-sm text-slate-500">Net Pay</p><p className="text-3xl font-bold text-slate-900">{money(selectedSlip.netPay)}</p></div>
        </section>}
        <style jsx global>{`@media print { body * { visibility: hidden; } .print-slip, .print-slip * { visibility: visible; } .print-slip { position: absolute; inset: 0; width: 100%; box-shadow: none; border: 0; } .no-print { display: none !important; } }`}</style>
      </div>
    </main>
  );
}

export default function PayrollPage() {
  return <AuthGuard><PayrollContent /></AuthGuard>;
}
