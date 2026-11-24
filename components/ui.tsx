import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn, label as prettyLabel, STATUS_TONES } from "@/lib/utils";

export function Card({
  children,
  className,
  as: Tag = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("panel p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] font-semibold mb-1">{eyebrow}</p>}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-[13px] text-[var(--muted)] mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] font-semibold mb-1">{eyebrow}</p>}
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-[var(--muted)] mt-1.5 max-w-3xl">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Badge({
  children,
  tone,
  status,
  className,
}: {
  children?: ReactNode;
  tone?: string;
  status?: string;
  className?: string;
}) {
  const toneClass = status ? STATUS_TONES[status] ?? "" : "";
  return <span className={cn("badge", toneClass, tone, className)}>{children ?? prettyLabel(status)}</span>;
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon,
  footer,
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  icon?: ReactNode;
  footer?: ReactNode;
}) {
  const positive = delta !== undefined && delta !== null && delta > 0;
  const negative = delta !== undefined && delta !== null && delta < 0;
  return (
    <div className="panel p-4 panel-hover">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] font-semibold">{label}</p>
        {icon && <span className="text-[var(--accent)] opacity-80">{icon}</span>}
      </div>
      <p className="kpi mt-2">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {delta !== undefined && delta !== null && (
          <span className={cn("font-semibold", positive ? "text-emerald-400" : negative ? "text-rose-400" : "text-[var(--muted)]")}>
            {positive ? "▲" : negative ? "▼" : "•"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-[var(--muted)]">{hint}</span>}
      </div>
      {footer && <div className="mt-3 pt-3 border-t border-[var(--line)] text-[11px] text-[var(--muted)]">{footer}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card-2)] text-[var(--accent)]">
          {icon}
        </div>
      )}
      <p className="font-medium text-[15px]">{title}</p>
      {description && <p className="mt-1.5 max-w-md text-[13px] text-[var(--muted)]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color?: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, ${color || "#1677FF"}, rgba(10,20,36,0.85))`,
        border: "1px solid rgba(255,255,255,0.14)",
      }}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}

export function PlatformDot({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    instagram: "#E1306C",
    facebook: "#1877F2",
    linkedin: "#0A66C2",
    youtube: "#FF0000",
    tiktok: "#25F4EE",
    x: "#9AA9BC",
    threads: "#8B5CF6",
    pinterest: "#E60023",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
      <span className="h-2 w-2 rounded-full" style={{ background: colors[platform] ?? "#9AA9BC" }} />
      {prettyLabel(platform)}
    </span>
  );
}

export function Progress({ value, tone = "var(--brand)" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--card-3)] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone }} />
    </div>
  );
}

export function LinkButton({ href, children, variant = "btn" }: { href: string; children: ReactNode; variant?: string }) {
  return (
    <Link href={href} className={variant}>
      {children}
    </Link>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    info: "border-sky-500/30 bg-sky-500/8 text-sky-200",
    warning: "border-amber-500/30 bg-amber-500/8 text-amber-200",
    danger: "border-rose-500/30 bg-rose-500/8 text-rose-200",
    success: "border-emerald-500/30 bg-emerald-500/8 text-emerald-200",
  };
  return (
    <div className={cn("rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed", tones[tone])}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      <div className="opacity-90">{children}</div>
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function DemoDataNotice({ isDemo }: { isDemo: boolean }) {
  if (!isDemo) return null;
  return (
    <Banner tone="warning" title="Demo workspace">
      Every record here is seeded demo data and every social account is in sandbox mode. Metrics are marked{" "}
      <span className="font-mono">source=demo</span>; publishing is recorded, never sent to Meta. Connect a Meta app in
      Integrations to operate for real.
    </Banner>
  );
}
