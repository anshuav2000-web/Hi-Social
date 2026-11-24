"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Mail } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setLink(null);
    setNote(null);
    const result = await api<{ link?: string; note?: string; delivery?: string }>("/api/v1/auth/forgot", {
      method: "POST",
      json: { email },
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success("If that email exists, a reset link has been issued");
    if (result.data?.link) {
      setLink(result.data.link);
      setNote(result.data.note ?? null);
    } else {
      router.push("/login");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--fg)]">
          <ArrowLeft size={13} /> Back to sign in
        </Link>
        <h1 className="text-[22px] font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Enter the email on your account. The link is single-use and expires in 30 minutes.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3.5">
          <div>
            <label className="label" htmlFor="email">Work email</label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@agency.com"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200">{error}</div>
          )}

          {link && (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-3 py-2.5 text-[12px]">
              <p className="font-medium">Reset link generated</p>
              <a href={link} className="mt-1 block break-all text-[var(--accent)] hover:underline">{link}</a>
              {note && <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--muted)]">{note}</p>}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Send reset link
            {!loading && <ArrowRight size={14} />}
          </button>
        </form>
      </div>
    </div>
  );
}
