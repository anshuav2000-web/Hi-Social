"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Lock } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";

function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setLoading(true);
    const result = await api("/api/v1/auth/reset", { method: "POST", json: { token, password } });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("Password updated — sign in with the new password");
    router.push("/login");
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3.5">
      {!token && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">
          This reset link is missing its token. Request a new one.
        </div>
      )}
      <div>
        <label className="label" htmlFor="password">New password</label>
        <div className="relative">
          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className="input pl-9"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Minimum 8 characters"
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <div className="relative">
          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="input pl-9"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            placeholder="Repeat the new password"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">{error}</div>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={loading || !token}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        Set new password
        {!loading && <ArrowRight size={14} />}
      </button>
    </form>
  );
}

function ResetPasswordShell({ token }: { token: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--fg)]">
          <ArrowLeft size={13} /> Back to sign in
        </Link>
        <h1 className="text-[22px] font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          This single-use link expires 30 minutes after it was issued, and every session is signed out when the password changes.
        </p>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);
  return <ResetPasswordShell token={token} />;
}
