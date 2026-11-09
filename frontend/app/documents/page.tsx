"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Download, Upload, RefreshCw, ShieldCheck } from "lucide-react";
import AuthGuard from "../components/AuthGuard";

const API_URL = "http://localhost:5000/api";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type EmployeeInfo = {
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
  employee?: EmployeeInfo;
};

function DocumentsContent() {
  const router = useRouter();
  const [role, setRole] = useState("employee");
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isHR = role === "admin" || role === "hr";

  const loadDocuments = useCallback(async () => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/documents${isHR ? "" : "/my"}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (response.status === 401) {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.push("/login");
        return;
      }
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load documents");
      }
      setDocuments(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load documents");
    } finally {
      setLoading(false);
    }
  }, [isHR]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const user = JSON.parse(sessionStorage.getItem("hrms_user") || "{}");
        setRole(user.role || "employee");
      } catch {
        setRole("employee");
      }
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadDocuments());
  }, [loadDocuments]);

  const uploadDocument = async () => {
    if (!selectedFile) {
      setError("Please choose a document first.");
      return;
    }
    if (selectedFile.size < 1 || selectedFile.size > MAX_FILE_SIZE) {
      setError("Document must be smaller than or equal to 10 MB.");
      return;
    }
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowed.includes(selectedFile.type)) {
      setError("Only PDF, JPG and PNG files are supported.");
      return;
    }

    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      router.push("/login");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("document", selectedFile);
      const response = await fetch(`${API_URL}/documents/my`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Document upload failed");
      }
      setNotice("Document sent to HR successfully.");
      setSelectedFile(null);
      const input = document.getElementById("employee-document-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadDocument = async (item: EmployeeDocument) => {
    const token = sessionStorage.getItem("hrms_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setError("");
    try {
      const response = await fetch(`${API_URL}/documents/${encodeURIComponent(item._id)}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Unable to download document");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download document");
    }
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-7 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16} /> Dashboard</Link>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{isHR ? "HR document inbox" : "Employee self-service"}</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">{isHR ? "Employee Documents" : "Send Documents to HR"}</h1>
            <p className="mt-2 text-sm text-slate-500">{isHR ? "Documents submitted by employees." : "Upload your documents securely for HR review."}</p>
          </div>
          <button type="button" onClick={loadDocuments} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Upload size={19} className="text-blue-600" /> {isHR ? "Submit your own document" : "Send a document to HR"}</h2>
          <p className="mt-1 text-sm text-slate-500">Supported formats: PDF, JPG, PNG. Maximum file size: 10 MB.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input id="employee-document-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-slate-200 p-2 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700" />
            <button type="button" onClick={uploadDocument} disabled={!selectedFile || uploading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{uploading ? "Sending..." : "Send to HR"} <Upload size={16} /></button>
          </div>
          {selectedFile && <p className="mt-2 text-xs text-slate-500">Selected: {selectedFile.name} · {formatSize(selectedFile.size)}</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-900">{isHR ? "Received documents" : "My submitted documents"}</h2><p className="mt-1 text-sm text-slate-500">{documents.length} document(s)</p></div>
          </div>
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading documents...</p> : documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">No documents submitted yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {documents.map((item) => (
                <div key={item._id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><FileText size={20} /></div>
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold text-slate-900">{item.originalName}</p>
                      {isHR && item.employee && <p className="mt-1 text-xs text-slate-600">{item.employee.firstName} {item.employee.lastName} · {item.employee.employeeCode} · {item.employee.email}</p>}
                      <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("en-IN")} · {formatSize(item.size)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => void downloadDocument(item)} className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:self-center"><Download size={16} /> Download</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-800"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> Documents are stored privately. Employees can access only their own submissions; HR/Admin can view and download company submissions.</p>
      </div>
    </main>
  );
}

export default function DocumentsPage() {
  return <AuthGuard><DocumentsContent /></AuthGuard>;
}
