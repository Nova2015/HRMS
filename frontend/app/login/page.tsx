
"use client";


import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Hexagon,
  Quotes,
  EnvelopeSimple,
  LockKey,
  Eye,
  EyeSlash,
  SpinnerGap,
} from "@phosphor-icons/react";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const API_URL = (configuredApiUrl && !/localhost|127\.0\.0\.1/i.test(configuredApiUrl)
  ? configuredApiUrl
  : "https://hrms-57dk.onrender.com/api"
).replace(/\/$/, "");

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.token) {
        throw new Error(result.message || "Invalid email or password.");
      }

      sessionStorage.setItem("hrms_token", result.token);
      sessionStorage.setItem("hrms_user", JSON.stringify(result.data));
      sessionStorage.setItem("hrms_attendance_prompt", "pending");

      router.replace("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setNotice("Password reset is not configured yet. Please contact IT Support.");
    setError("");
  };

  return (
    <main className="nexus-login min-h-screen h-screen w-full overflow-auto bg-white text-slate-800 antialiased">
      <div className="flex min-h-full w-full">

        {/* LEFT SIDE — ORIGINAL NEXUS BRANDING */}

        <section className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-12 lg:flex">

          <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#312e81] via-slate-900 to-[#8b5cf6]/40" />

          {/* Ambient Gradient Orbs */}

          <div className="pointer-events-none absolute -left-[10%] -top-[15%] z-0 h-[60%] w-[60%] rounded-full bg-[#6366f1]/20 blur-[120px]" />

          <div className="pointer-events-none absolute -bottom-[10%] -right-[10%] z-0 h-[50%] w-[50%] rounded-full bg-[#8b5cf6]/20 blur-[100px]" />

          {/* Floating Glass Shapes */}

          <div className="glass-shape absolute right-[15%] top-[20%] z-10 h-32 w-32 animate-[pulse_6s_ease-in-out_infinite] rounded-full" />

          <div className="glass-shape absolute bottom-[25%] left-[20%] z-10 h-24 w-24 rotate-12 animate-[pulse_8s_ease-in-out_infinite] rounded-2xl" />

          {/* Logo */}

          <div className="relative z-20 flex animate-slide-up items-center">

            <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#818cf8] to-[#8b5cf6] shadow-lg shadow-[#6366f1]/40">
              <Hexagon weight="fill" className="text-2xl text-white" />
            </div>

            <span className="text-2xl font-bold tracking-tight text-white">
              NEXUS
            </span>

          </div>

          {/* Bottom Content */}

          <div className="relative z-20 max-w-lg animate-slide-up delay-300">

            <div className="mb-6">
              <Quotes className="text-4xl text-[#818cf8]/50" />
            </div>

            <h1 className="mb-4 text-4xl font-bold leading-tight text-white">
              Empowering your workforce to achieve the extraordinary.
            </h1>

            <p className="mb-8 text-lg font-light text-slate-300">
              Experience seamless HR management, integrated payroll, and
              intuitive employee experiences in one unified platform.
            </p>

            <div className="flex items-center space-x-4">

              <div className="flex -space-x-3">

                <Image
                  className="z-30 h-10 w-10 rounded-full border-2 border-slate-900"
                  src="https://ui-avatars.com/api/?name=Alex&background=6366f1&color=fff"
                  alt="User avatar"
                  width={40}
                  height={40}
                  unoptimized
                />

                <Image
                  className="z-20 h-10 w-10 rounded-full border-2 border-slate-900"
                  src="https://ui-avatars.com/api/?name=Sam&background=8b5cf6&color=fff"
                  alt="User avatar"
                  width={40}
                  height={40}
                  unoptimized
                />

                <Image
                  className="z-10 h-10 w-10 rounded-full border-2 border-slate-900"
                  src="https://ui-avatars.com/api/?name=Taylor&background=ecfdf5&color=059669"
                  alt="User avatar"
                  width={40}
                  height={40}
                  unoptimized
                />

              </div>

              <p className="text-sm font-medium text-slate-400">
                Trusted by{" "}
                <span className="font-bold text-white">10,000+</span>{" "}
                professionals worldwide
              </p>

            </div>
          </div>
        </section>

        {/* RIGHT SIDE — LOGIN FORM */}

        <section className="relative flex w-full items-center justify-center bg-[#fcfcfd] p-6 sm:p-12 lg:w-1/2 lg:p-24">

          {/* Mobile Logo */}

          <div className="absolute left-8 top-8 flex animate-slide-up items-center lg:hidden">

            <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] shadow-lg shadow-[#6366f1]/30">
              <Hexagon weight="fill" className="text-xl text-white" />
            </div>

            <span className="text-xl font-bold tracking-tight text-slate-900">
              NEXUS
            </span>

          </div>

          <div className="mx-auto w-full max-w-md">

            {/* Header */}

            <div className="mb-10 text-left">

              <h2 className="animate-slide-up delay-100 mb-2 text-3xl font-bold tracking-tight text-slate-900">
                Welcome back
              </h2>

              <p className="animate-slide-up delay-200 font-medium text-slate-500">
                Please enter your credentials to access your account.
              </p>

            </div>

            {/* Login Form */}

            <form onSubmit={handleLogin} className="space-y-6">

              {/* Email */}

              <div className="animate-slide-up delay-300">

                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Work Email
                </label>

                <div className="relative">

                  <EnvelopeSimple className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />

                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="username"
                    required
                    className="shadow-input w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-[#6366f1] focus:outline-none focus:ring-4 focus:ring-[#6366f1]/10"
                  />

                </div>
              </div>

              {/* Password */}

              <div className="animate-slide-up delay-400">

                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>

                <div className="relative">

                  <LockKey className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />

                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="shadow-input w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-12 text-sm font-medium text-slate-800 placeholder-slate-400 transition-all focus:border-[#6366f1] focus:outline-none focus:ring-4 focus:ring-[#6366f1]/10"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-[#4f46e5]"
                  >
                    {showPassword ? (
                      <EyeSlash className="text-lg" />
                    ) : (
                      <Eye className="text-lg" />
                    )}
                  </button>

                </div>
              </div>

              {/* Remember Me & Forgot Password */}

              <div className="animate-slide-up delay-500 flex items-center justify-between">

                <div className="flex items-center">

                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="nexus-checkbox h-5 w-5 cursor-pointer rounded"
                  />

                  <label
                    htmlFor="remember-me"
                    className="ml-3 block cursor-pointer select-none text-sm font-medium text-slate-600"
                  >
                    Remember me
                  </label>

                </div>

                <div className="text-sm">

                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="font-semibold text-[#4f46e5] transition-all hover:text-[#6366f1] hover:underline"
                  >
                    Forgot password?
                  </button>

                </div>

              </div>

              {/* Error Message */}

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {error}
                </div>
              )}

              {notice && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
                  {notice}
                </div>
              )}

              {/* Submit Button */}

              <div className="animate-slide-up pt-2 delay-500">

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full -translate-y-0 items-center justify-center rounded-xl border border-transparent bg-[#4f46e5] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#6366f1]/20 transition-all hover:-translate-y-0.5 hover:bg-[#4338ca] focus:outline-none focus:ring-4 focus:ring-[#6366f1]/30 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-80"
                >
                  {loading ? (
                    <>
                      <SpinnerGap className="mr-2 animate-spin text-xl" />
                      Signing In...
                    </>
                  ) : (
                    "Sign In to Workspace"
                  )}
                </button>

              </div>

            </form>

            {/* Footer */}

            <div className="animate-slide-up mt-12 text-center delay-500">

              <p className="text-sm font-medium text-slate-500">
                Having trouble signing in?{" "}
                <button
                  type="button"
                  onClick={() =>
                    setNotice("Please contact your HRMS administrator for support.")
                  }
                  className="font-semibold text-[#4f46e5] hover:underline"
                >
                  Contact IT Support
                </button>
              </p>

            </div>

          </div>
        </section>
      </div>

      {/* Original Design Custom CSS */}

      <style jsx global>{`
        .nexus-login {
          font-family: "Inter", sans-serif;
        }

        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .animate-slide-up {
          animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }

        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
        .delay-400 { animation-delay: 400ms; }
        .delay-500 { animation-delay: 500ms; }

        .glass-shape {
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.1),
            rgba(255, 255, 255, 0)
          );
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        .shadow-premium {
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.05);
        }

        .shadow-input {
          box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.02) inset;
        }

        .nexus-checkbox {
          appearance: none;
          -webkit-appearance: none;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.1rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.35rem;
          transition: all 0.2s;
        }

        .nexus-checkbox::before {
          content: "";
          width: 0.65em;
          height: 0.65em;
          clip-path: polygon(
            14% 44%,
            0 65%,
            50% 100%,
            100% 16%,
            80% 0%,
            43% 62%
          );
          transform: scale(0);
          transform-origin: bottom left;
          transition: 120ms transform ease-in-out;
          box-shadow: inset 1em 1em white;
          background-color: white;
        }

        .nexus-checkbox:checked {
          background-color: #6366f1;
          border-color: #6366f1;
        }

        .nexus-checkbox:checked::before {
          transform: scale(1);
        }
      `}</style>
    </main>
  );
}
