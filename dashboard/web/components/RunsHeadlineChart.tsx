"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TrendPoint {
  id: string;
  started_at: string;
  overall_avg_error_pct: number | null;
  bh_sig_count: number | null;
  dirty: number;
}

interface Props {
  data: TrendPoint[];
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return iso;
  }
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: { dirty: number };
}

function DirtyDot(props: DotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const isDirty = payload?.dirty === 1;
  if (isDirty) {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill="var(--sidebar-active)"
        stroke="var(--sidebar-active)"
      />
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill="transparent"
      stroke="var(--sidebar-active)"
      strokeWidth={1.5}
    />
  );
}

export default function RunsHeadlineChart({ data }: Props) {
  if (data.length === 0) return null;

  const chartData = data.map((p) => ({
    label: shortDate(p.started_at),
    error_pct: p.overall_avg_error_pct,
    bh_count: p.bh_sig_count,
    dirty: p.dirty,
  }));

  return (
    <div className="mb-6">
      <p
        className="text-xs uppercase tracking-wider opacity-50 mb-2"
        style={{ color: "var(--main-text)" }}
      >
        Avg Error % &amp; BH-Significant Flags (last {data.length} runs)
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--sidebar-text)", opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "var(--sidebar-text)", opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "var(--sidebar-text)", opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            width={32}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--sidebar-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: 4,
              fontSize: 12,
              color: "var(--main-text)",
            }}
            formatter={(value: number, name: string) => {
              if (name === "error_pct") return [`${value?.toFixed(2)}%`, "Avg Error %"];
              if (name === "bh_count") return [value ?? "—", "BH Flags"];
              return [value, name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, opacity: 0.6, color: "var(--sidebar-text)" }}
            formatter={(value: string) => {
              if (value === "error_pct") return "Avg Error %";
              if (value === "bh_count") return "BH Flags";
              return value;
            }}
          />
          <Bar
            yAxisId="right"
            dataKey="bh_count"
            fill="rgba(243, 139, 168, 0.4)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="error_pct"
            stroke="var(--sidebar-active)"
            strokeWidth={2}
            dot={<DirtyDot />}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
