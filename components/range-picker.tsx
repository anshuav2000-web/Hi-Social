"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarRange } from "lucide-react";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function RangePicker({ basePath = "/analytics" }: { basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const apply = (nextFrom: string, nextTo: string) => {
    const q = new URLSearchParams();
    if (nextFrom) q.set("from", nextFrom);
    if (nextTo) q.set("to", nextTo);
    router.push(`${basePath}?${q.toString()}`);
  };

  const preset = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 86400000);
    apply(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-1">
        {PRESETS.map((p) => (
          <button key={p.label} className="chip !border-0 !bg-transparent !py-1" onClick={() => preset(p.days)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-1">
        <CalendarRange size={13} className="ml-1 text-[var(--muted)]" />
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="bg-transparent px-1 text-[11.5px] outline-none text-[var(--muted)]"
          aria-label="From date"
        />
        <span className="text-[var(--muted)]">→</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="bg-transparent px-1 text-[11.5px] outline-none text-[var(--muted)]"
          aria-label="To date"
        />
        <button className="btn btn-sm" onClick={() => apply(customFrom, customTo)} disabled={!customFrom || !customTo}>
          Apply
        </button>
      </div>
    </div>
  );
}
