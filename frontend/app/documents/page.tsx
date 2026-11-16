"use client";


import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Download, Upload, RefreshCw, ShieldCheck, Send, Check, X, Eye, Printer } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type EmployeeInfo = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
};

type EmployeeDocument = {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  documentType: string;
  direction: "employee_to_hr" | "hr_to_employee";
  status: "pending" | "approved" | "rejected" | "issued";
  reviewComment?: string;
  fileAvailable?: boolean;
  employee?: EmployeeInfo;
};

const documentLabels: Record<string, string> = {
  other: "Supporting Document",
  resignation_letter: "Resignation Letter",
  payslip: "Payslip",
  appointment_letter: "Appointment Letter",
  salary_revision_letter: "Salary Revision Letter",
  leave_letter: "Leave Approval Letter",
  leave_rejection_notice: "Leave Rejection Notice",
  relieving_letter: "Relieving Letter",
  offer_letter: "Offer Letter",
  confirmation_letter: "Confirmation Letter",
};

function DocumentsContent() {
  const router = useRouter();
  const [role] = useState(() => {
    if (typeof window === "undefined") return "employee";
    try {
      return JSON.parse(sessionStorage.getItem("hrms_user") || "{}").role || "employee";
    } catch {
      return "employee";
    }
  });
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<EmployeeInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [employeeDocumentType, setEmployeeDocumentType] = useState("other");
  const [issueFile, setIssueFile] = useState<File | null>(null);
  const [targetEmployee, setTargetEmployee] = useState("");
  const [documentEmployeeFilter, setDocumentEmployeeFilter] = useState("all");
  const [issueType, setIssueType] = useState("payslip");
  const [reviewComment, setReviewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const isHR = role === "admin" || role === "hr";

  const authHeaders = () => {
    const token = sessionStorage.getItem("hrms_token");
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const loadDocuments = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/documents${isHR ? "" : "/my"}`, {
        headers, cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load documents");
      setDocuments(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load documents");
    } finally {
      setLoading(false);
    }
  }, [isHR, router]);

  const loadEmployees = useCallback(async () => {
    if (!isHR) return;
    const headers = authHeaders();
    if (!headers) return;
    try {
      const response = await fetch(`${API_URL}/employees`, { headers, cache: "no-store" });
      const result = await response.json();
      if (response.ok && result.success) {
        const active = (result.data || []).filter((employee: EmployeeInfo & { employmentStatus?: string }) => employee.employmentStatus === "active");
        setEmployees(active);
        if (active.length) setTargetEmployee(active[0]._id);
      }
    } catch {
      setError("Unable to load employee list for document delivery");
    }
  }, [isHR]);

  useEffect(() => {
    // Schedule data loading after the effect callback completes.
    void Promise.resolve().then(() => {
      void loadDocuments();
      void loadEmployees();
    });
  }, [loadDocuments, loadEmployees]);

  const validateFile = (file: File | null) => {
    if (!file) return "Please choose a document first.";
    if (file.size < 1 || file.size > MAX_FILE_SIZE) return "Document must be 10 MB or smaller.";
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return "Only PDF, JPG and PNG files are supported.";
    return "";
  };

  const uploadDocument = async () => {
    const validation = validateFile(selectedFile);
    if (validation) { setError(validation); return; }
    const headers = authHeaders();
    if (!headers || !selectedFile) { router.push("/login"); return; }
    setUploading(true); setError(""); setNotice("");
    try {
      const formData = new FormData();
      formData.append("document", selectedFile);
      formData.append("documentType", employeeDocumentType);
      const response = await fetch(`${API_URL}/documents/my`, { method: "POST", headers, body: formData });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Document upload failed");
      setNotice(employeeDocumentType === "resignation_letter" ? "Resignation letter submitted to HR successfully." : "Document sent to HR successfully.");
      setSelectedFile(null);
      const input = document.getElementById("employee-document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document upload failed");
    } finally { setUploading(false); }
  };

  const issueDocument = async () => {
    const validation = validateFile(issueFile);
    if (validation) { setError(validation); return; }
    if (!targetEmployee) { setError("Select an employee."); return; }
    const headers = authHeaders();
    if (!headers || !issueFile) { router.push("/login"); return; }
    setIssuing(true); setError(""); setNotice("");
    try {
      const formData = new FormData();
      formData.append("document", issueFile);
      formData.append("employeeId", targetEmployee);
      formData.append("documentType", issueType);
      const response = await fetch(`${API_URL}/documents/issue`, { method: "POST", headers, body: formData });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to send document");
      setNotice("Document sent to employee successfully.");
      setIssueFile(null);
      const input = document.getElementById("hr-document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send document");
    } finally { setIssuing(false); }
  };

  const generateEmploymentDocument = async (documentType: "appointment_letter" | "offer_letter" | "confirmation_letter") => {
    if (!targetEmployee) { setError("Select an employee."); return; }
    const headers = authHeaders();
    if (!headers) { router.push("/login"); return; }
    setGeneratingType(documentType); setError(""); setNotice("");
    try {
      const response = await fetch(`${API_URL}/documents/generate/${encodeURIComponent(targetEmployee)}/${documentType}`, {
        method: "POST", headers,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to generate employment document");
      const label = documentLabels[documentType];
      setNotice(`${label} generated and issued successfully.`);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate employment document");
    } finally { setGeneratingType(null); }
  };

  const reviewResignation = async (item: EmployeeDocument, decision: "approved" | "rejected") => {
    const headers = authHeaders();
    if (!headers) { router.push("/login"); return; }
    setError(""); setNotice("");
    try {
      const response = await fetch(`${API_URL}/documents/${encodeURIComponent(item._id)}/review`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewComment }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to review resignation");
      setNotice(`Resignation ${decision} successfully.`);
      setReviewComment("");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review resignation");
    }
  };

  const previewDocument = async (item: EmployeeDocument) => {
    const headers = authHeaders();
    if (!headers) { router.push("/login"); return; }
    setError(""); setPreviewingId(item._id);
    try {
      const response = await fetch(`${API_URL}/documents/${encodeURIComponent(item._id)}/download`, { headers });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Unable to preview document");
      }
      const blob = await response.blob();
      if (previewUrl) window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(window.URL.createObjectURL(blob));
      setPreviewName(item.originalName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview document");
    } finally { setPreviewingId(null); }
  };

  const closePreview = () => {
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null); setPreviewName("");
  };

  const downloadDocument = async (item: EmployeeDocument) => {
    const headers = authHeaders();
    if (!headers) { router.push("/login"); return; }
    setError("");
    try {
      const response = await fetch(`${API_URL}/documents/${encodeURIComponent(item._id)}/download`, { headers });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Unable to download document");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = item.originalName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download document");
    }
  };

  const visibleDocuments = isHR && documentEmployeeFilter !== "all"
    ? documents.filter((item) => item.employee?._id === documentEmployeeFilter)
    : documents;

  const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  const statusClass = (status: string) => status === "approved" || status === "issued"
    ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  const documentStats = [
    { label: "Total Documents", value: documents.length, tone: "text-slate-900", surface: "bg-slate-50" },
    { label: "Pending Review", value: documents.filter((item) => item.status === "pending").length, tone: "text-amber-700", surface: "bg-amber-50" },
    { label: isHR ? "Approved / Issued" : "Received from HR", value: documents.filter((item) => item.status === "approved" || item.status === "issued").length, tone: "text-emerald-700", surface: "bg-emerald-50" },
    { label: "Rejected", value: documents.filter((item) => item.status === "rejected").length, tone: "text-red-700", surface: "bg-red-50" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-7 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{isHR ? "HR document center" : "Employee self-service"}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{isHR ? "Employee Documents" : "My HR Documents"}</h1>
            <p className="mt-2 text-sm text-slate-500">{isHR ? "Send official documents and review employee resignation letters." : "Download documents issued by HR and submit your resignation letter if required."}</p>
          </div>
          <button type="button" onClick={loadDocuments} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

        {isHR ? (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Send size={19} className="text-blue-600" /> Send Official Document to Employee</h2>
            <p className="mt-1 text-sm text-slate-500">Upload a PDF, JPG or PNG up to 10 MB. The selected employee alone can access the document.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Employee
                <select value={targetEmployee} onChange={(event) => setTargetEmployee(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-3 font-normal">
                  <option value="">Select employee</option>
                  {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.firstName} {employee.lastName} · {employee.employeeCode}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">Document Type
                <select value={issueType} onChange={(event) => setIssueType(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-3 font-normal">
                  <option value="payslip">Payslip</option><option value="appointment_letter">Appointment Letter</option><option value="offer_letter">Offer Letter</option><option value="confirmation_letter">Confirmation Letter</option><option value="leave_letter">Leave Letter</option><option value="relieving_letter">Relieving Letter</option><option value="other">Other Official Document</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input id="hr-document-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setIssueFile(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-slate-200 p-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700" />
              <button type="button" onClick={issueDocument} disabled={!issueFile || !targetEmployee || issuing} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{issuing ? "Sending..." : "Send to Employee"} <Upload size={16} /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => generateEmploymentDocument("offer_letter")} disabled={!targetEmployee || generatingType !== null} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{generatingType === "offer_letter" ? "Generating..." : "Generate Offer Letter"} <FileText size={15} /></button>
              <button type="button" onClick={() => generateEmploymentDocument("appointment_letter")} disabled={!targetEmployee || generatingType !== null} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{generatingType === "appointment_letter" ? "Generating..." : "Generate Appointment Letter"} <FileText size={15} /></button>
              <button type="button" onClick={() => generateEmploymentDocument("confirmation_letter")} disabled={!targetEmployee || generatingType !== null} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{generatingType === "confirmation_letter" ? "Generating..." : "Generate Confirmation Letter"} <FileText size={15} /></button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Generate branded PDFs from saved employee details and the current salary structure.</p>
          </section>
        ) : (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Upload size={19} className="text-blue-600" /> Send Document to HR</h2>
            <p className="mt-1 text-sm text-slate-500">Submit supporting documents or a resignation letter for HR review. Supported: PDF, JPG, PNG · Maximum 10 MB.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Document Type
                <select value={employeeDocumentType} onChange={(event) => setEmployeeDocumentType(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-3 font-normal">
                  <option value="other">Supporting Document</option>
                  <option value="resignation_letter">Resignation Letter (HR Approval)</option>
                </select>
              </label>
              <input id="employee-document-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-slate-200 p-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700" />
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={uploadDocument} disabled={!selectedFile || uploading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{uploading ? "Sending..." : "Send to HR"} <Upload size={16} /></button>
            </div>
          </section>
        )}

        <section aria-label="Document overview" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {documentStats.map((stat) => (
            <div key={stat.label} className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5`}>
              <p className="text-xs font-semibold leading-5 text-slate-500 sm:text-sm">{stat.label}</p>
              <p className={`mt-2 text-2xl font-bold tabular-nums sm:text-3xl ${stat.tone}`}>{stat.value}</p>
              <div className={`mt-3 h-1.5 w-12 rounded-full ${stat.surface}`} />
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="text-lg font-bold text-slate-900">{isHR ? "Document Register & Resignation Approvals" : "My Documents"}</h2><p className="mt-1 text-sm text-slate-500">{visibleDocuments.length} document(s){isHR ? " for selected employee" : ""}</p></div>
            {isHR && <label className="w-full text-sm font-semibold text-slate-700 sm:max-w-xs">Filter Documents by Employee
              <select value={documentEmployeeFilter} onChange={(event) => setDocumentEmployeeFilter(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-3 font-normal">
                <option value="all">All Employees</option>
                {employees.map((employee) => <option key={employee._id} value={employee._id}>{employee.firstName} {employee.lastName} · {employee.employeeCode}</option>)}
              </select>
            </label>}
          </div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading documents...</p> : documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">No documents found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleDocuments.map((item) => (
                <div key={item._id} className="flex flex-col gap-3 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><FileText size={20} /></div>
                      <div className="min-w-0">
                        <p className="break-all text-sm font-semibold text-slate-900">{item.originalName}</p>
                        <p className="mt-1 text-xs font-medium text-slate-600">{documentLabels[item.documentType] || "Document"} · {item.direction === "hr_to_employee" ? "Sent by HR" : "Submitted by Employee"}</p>
                        {isHR && item.employee && <p className="mt-1 text-xs text-slate-600">{item.employee.firstName} {item.employee.lastName} · {item.employee.employeeCode} · {item.employee.email}</p>}
                        <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("en-IN")} · {formatSize(item.size)}</p>
                        {item.fileAvailable === false && <p className="mt-1 text-xs font-medium text-amber-700">{isHR ? "Stored file is missing from server storage. Re-upload the document if an original copy is available." : "Stored file is missing. Contact HR to re-upload this document."}</p>}
                        {item.reviewComment && <p className="mt-1 text-xs text-slate-600">HR comment: {item.reviewComment}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusClass(item.status)}`}>{item.status}</span>
                      {item.fileAvailable === false && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">File Missing</span>}
                      <button type="button" onClick={() => void previewDocument(item)} disabled={previewingId === item._id || item.fileAvailable === false} title={item.fileAvailable === false ? "Stored file is missing" : "Preview document"} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><Eye size={16} /> Preview</button>
                      <button type="button" onClick={() => void downloadDocument(item)} disabled={item.fileAvailable === false} title={item.fileAvailable === false ? "Stored file is missing" : "Download document"} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"><Download size={16} /> Download</button>
                    </div>
                  </div>
                  {isHR && item.direction === "employee_to_hr" && item.documentType === "resignation_letter" && item.status === "pending" && (
                    <div className="ml-12 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 sm:flex-row sm:items-center">
                      <input value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} maxLength={1000} placeholder="Optional HR review comment" className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
                      <button type="button" onClick={() => void reviewResignation(item, "approved")} className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white"><Check size={15} /> Approve</button>
                      <button type="button" onClick={() => void reviewResignation(item, "rejected")} className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white"><X size={15} /> Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        {previewUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label="Document preview">
            <div className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{previewName}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => (document.getElementById("hrms-document-preview") as HTMLIFrameElement | null)?.contentWindow?.print()} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Printer size={15} /> Print</button>
                  <button type="button" onClick={closePreview} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Close preview"><X size={18} /></button>
                </div>
              </div>
              <iframe id="hrms-document-preview" title={previewName} src={previewUrl} className="min-h-0 flex-1 bg-slate-100" />
            </div>
          </div>
        )}
        <p className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> Documents remain in private storage. Employees can access only their own documents; HR/Admin can issue and review company documents.</p>
      </div>
    </main>
  );
}

export default function DocumentsPage() {
  return <AuthGuard><DocumentsContent /></AuthGuard>;
}
