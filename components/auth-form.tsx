"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, Mail, User } from "lucide-react";
import { api, errorList } from "@/lib/client";
import { useToast } from "@/components/toast";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setDetails([]);
    const path = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
    const result = await api(path, {
      method: "POST",
      json: mode === "login" ? { email, password } : { email, password, fullName, workspaceName },
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setDetails(errorList(result.details));
      return;
    }
    toast.success(mode === "login" ? "Signed in" : "Workspace created");
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      {mode === "register" && (
        <>
          <div>
            <label className="label" htmlFor="fullName">Your name</label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input id="fullName" className="input pl-9" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} placeholder="Ava Mercer" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="workspaceName">Workspace name</label>
            <input id="workspaceName" className="input" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required minLength={2} placeholder="Northwind Collective" />
          </div>
        </>
      )}
      <div>
        <label className="label" htmlFor="email">Work email</label>
        <div className="relative">
          <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input id="email" type="email" autoComplete="email" className="input pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@agency.com" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative">
          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="input pl-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "register" ? 8 : 1}
            placeholder="••••••••"
          />
        </div>
        {mode === "register" && <p className="mt-1 text-[11px] text-[var(--muted)]">Minimum 8 characters. Stored as a scrypt hash.</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          <p className="font-medium">{error}</p>
          {details.length > 0 && <ul className="mt-1 list-inside list-disc">{details.map((d) => <li key={d}>{d}</li>)}</ul>}
        </div>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={loading}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        {mode === "login" ? "Sign in" : "Create workspace"}
        {!loading && <ArrowRight size={14} />}
      </button>

      {mode === "login" ? (
        <>
          <div className="flex items-center justify-between text-[11.5px] text-[var(--muted)]">
            <Link href="/forgot-password" className="text-[var(--accent)] hover:underline">
              Forgot password?
            </Link>
            <Link href="/register" className="text-[var(--accent)] hover:underline">
              Create a workspace
            </Link>
          </div>
          <p className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
            Accounts are created by registering a workspace. If you lost access, use the reset link above.
          </p>
        </>
      ) : (
        <p className="text-center text-[11.5px] text-[var(--muted)]">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </form>
  );
}
