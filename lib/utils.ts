import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PLATFORMS = [
  { key: "instagram", label: "Instagram", color: "#E1306C" },
  { key: "facebook", label: "Facebook", color: "#1877F2" },
  { key: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { key: "youtube", label: "YouTube", color: "#FF0000" },
  { key: "tiktok", label: "TikTok", color: "#25F4EE" },
  { key: "x", label: "X", color: "#9AA9BC" },
  { key: "pinterest", label: "Pinterest", color: "#E60023" },
  { key: "threads", label: "Threads", color: "#8B5CF6" },
] as const;

export const CONTENT_TYPES = [
  "image",
  "carousel",
  "reel",
  "video",
  "story",
  "text",
  "link",
] as const;

export const POST_STATUSES = [
  "idea",
  "planned",
  "draft",
  "in_creation",
  "review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "failed",
  "archived",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  idea: "Idea",
  planned: "Planned",
  draft: "Draft",
  in_creation: "In creation",
  review: "Review",
  changes_requested: "Changes requested",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  archived: "Archived",
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  dead: "Dead letter",
  canceled: "Canceled",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  rejected: "Rejected",
  draft_campaign: "Draft",
};

export const STATUS_TONES: Record<string, string> = {
  published: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  succeeded: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  approved: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  done: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  scheduled: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  queued: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  running: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  review: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  pending: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  in_progress: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  changes_requested: "text-orange-300 bg-orange-500/10 border-orange-500/30",
  failed: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  dead: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  rejected: "text-rose-300 bg-rose-500/10 border-rose-500/30",
  canceled: "text-slate-300 bg-slate-500/10 border-slate-500/30",
  idea: "text-violet-300 bg-violet-500/10 border-violet-500/30",
  planned: "text-indigo-300 bg-indigo-500/10 border-indigo-500/30",
  draft: "text-slate-300 bg-slate-500/10 border-slate-500/30",
  in_creation: "text-cyan-300 bg-cyan-500/10 border-cyan-500/30",
  archived: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  open: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  resolved: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  todo: "text-slate-300 bg-slate-500/10 border-slate-500/30",
};

export const label = (value?: string | null) =>
  value ? STATUS_LABELS[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDate(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", opts ?? { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function platformLabel(key: string) {
  return PLATFORMS.find((p) => p.key === key)?.label ?? label(key);
}

export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
