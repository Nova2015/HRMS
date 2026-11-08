
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
      <button
        type="button"
        onClick={handleLogout}
        className="fixed right-5 top-5 z-50 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700"
      >
        Logout
      </button>

      {children}
    </>
  );
}
