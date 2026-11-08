
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      const token = sessionStorage.getItem("hrms_token");

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await fetch(
          "http://localhost:5000/api/auth/me",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error("Session expired");
        }

        if (!cancelled) {
          setAuthorized(true);
        }
      } catch {
        sessionStorage.removeItem("hrms_token");
        sessionStorage.removeItem("hrms_user");
        router.replace("/login");
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = () => {
    sessionStorage.removeItem("hrms_token");
    sessionStorage.removeItem("hrms_user");
    router.replace("/login");
  };

  if (checking || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm font-medium text-slate-500">
          Verifying your session...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Logout from HRMS"
          title="Logout"
          className="group inline-flex items-center gap-2.5 rounded-full border border-slate-200/90 bg-white/95 py-2 pl-3 pr-4 text-sm font-semibold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 hover:shadow-xl hover:shadow-rose-900/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 active:translate-y-0"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition-colors group-hover:bg-rose-100">
            <LogOut size={16} strokeWidth={2.2} />
          </span>
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>

      {children}
    </>
  );
}
