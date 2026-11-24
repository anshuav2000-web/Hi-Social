"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/utils";

const axisStyle = { fontSize: 10, fill: "var(--muted)" } as const;
const gridStroke = "rgba(154,169,188,0.14)";

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  fontSize: 11,
  color: "var(--fg)",
  boxShadow: "0 12px 30px -16px rgba(0,0,0,0.9)",
};

export function TrendChart({
  data,
  series,
  height = 240,
  kind = "area",
}: {
  data: Array<Record<string, string | number | null>>;
  series: { key: string; label: string; color: string }[];
  height?: number;
  kind?: "area" | "line" | "bar";
}) {
  if (data.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-[12px] text-[var(--muted)]">No data in this period</div>;
  }
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
      <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={26} />
      <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatNumber(v)} />
      <Tooltip contentStyle={tooltipStyle} formatter={(value: any, name: any) => [formatNumber(Number(value)), String(name ?? "")]} />
      <Legend wrapperStyle={{ fontSize: 10, color: "var(--muted)" }} />
    </>
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      {kind === "line" ? (
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          {common}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      ) : kind === "bar" ? (
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          {common}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={26} />
          ))}
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {common}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
            />
          ))}
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

export function SharePie({
  data,
  height = 220,
  colors = ["#1677FF", "#35A7FF", "#8B5CF6", "#10B981", "#F59E0B"],
}: {
  data: { name: string; value: number }[];
  height?: number;
  colors?: string[];
}) {
  if (data.length === 0 || data.every((d) => !d.value)) {
    return <div className="flex h-[200px] items-center justify-center text-[12px] text-[var(--muted)]">No data in this period</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={3} stroke="none">
          {data.map((_, index) => (
            <Cell key={index} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => formatNumber(Number(value))} />
        <Legend wrapperStyle={{ fontSize: 10, color: "var(--muted)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({
  data,
  height = 240,
  color = "#1677FF",
}: {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-[12px] text-[var(--muted)]">No data in this period</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
        <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatNumber(v)} />
        <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={92} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value: any) => formatNumber(Number(value))} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
