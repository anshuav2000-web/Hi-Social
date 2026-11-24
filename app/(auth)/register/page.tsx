import Link from "next/link";
import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import { getAuthContext } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export default async function RegisterPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <Link href="/login" className="mb-6 inline-flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#2a86ff] to-[#0b4fd1] text-white">
            <Zap size={16} strokeWidth={2.6} />
          </span>
          <span className="text-[15px] font-semibold">SocialHub Pro</span>
        </Link>
        <div className="panel p-6">
          <h1 className="text-[22px] font-semibold tracking-tight">Create your workspace</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            You become the workspace admin. Brands, team members and social accounts are added from inside the app.
          </p>
          <div className="mt-6">
            <AuthForm mode="register" />
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-[var(--muted)]">
          By creating an account you confirm you own the social accounts you connect.
        </p>
      </div>
    </div>
  );
}
