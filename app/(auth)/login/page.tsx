import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, LineChart, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

const FEATURES = [
  { icon: CalendarDays, title: "One calendar for every client", body: "Plan, drag, reschedule and see campaigns, deadlines and approvals in the same grid." },
  { icon: Sparkles, title: "AI that works on your brand voice", body: "Captions, hooks, briefs and content plans from local Ollama or the built-in template engine." },
  { icon: LineChart, title: "Analytics you can defend", body: "Instagram and Facebook insights with null-safe metrics, snapshots and exportable reports." },
  { icon: ShieldCheck, title: "Approvals that cannot be bypassed", body: "Multi-stage internal and client review, enforced server-side before anything is queued." },
];

export default async function LoginPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr]">
      <div className="hidden lg:flex flex-col justify-between border-r border-[var(--line)] bg-[var(--navy)]/70 p-10 relative overflow-hidden">
        <div className="absolute -top-32 -right-24 h-[420px] w-[420px] rounded-full bg-[#1677FF]/18 blur-[110px]" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#2a86ff] to-[#0b4fd1] text-white">
              <Zap size={17} strokeWidth={2.6} />
            </span>
            <div>
              <p className="text-[15px] font-semibold leading-tight">SocialHub Pro</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">The social media operating system</p>
            </div>
          </div>
          <h1 className="mt-12 max-w-lg text-[38px] leading-[1.08] font-semibold tracking-[-0.03em]">
            Every client, every channel, every approval — in one operating system.
          </h1>
          <p className="mt-4 max-w-md text-[14px] text-[var(--muted)]">
            Plan content, brief writers and designers, publish to Instagram and Facebook, moderate comments, and report on
            what actually happened.
          </p>
          <ul className="mt-9 space-y-3.5">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--card)] text-[var(--accent)]">
                  <feature.icon size={15} />
                </span>
                <div>
                  <p className="text-[13px] font-medium">{feature.title}</p>
                  <p className="text-[12px] text-[var(--muted)] leading-relaxed">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] text-[var(--muted)]">
          Meta Graph API ready · sandbox publishing until credentials are configured · self-hosted with Docker
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2a86ff] to-[#0b4fd1] text-white mb-3">
              <Zap size={18} strokeWidth={2.6} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">SocialHub Pro</h1>
          </div>
          <h2 className="text-[22px] font-semibold tracking-tight">Sign in to your workspace</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Session cookies are httpOnly and expire after 14 days.</p>
          <div className="mt-6">
            <AuthForm mode="login" />
          </div>
          <p className="mt-6 text-center text-[11px] text-[var(--muted)]">
            <Link href="/docs" className="hover:text-[var(--fg)]">Documentation</Link> ·{" "}
            <span>Self-hosted deployment</span>
          </p>
        </div>
      </div>
    </div>
  );
}
