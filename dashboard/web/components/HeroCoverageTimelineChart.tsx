"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { HeroCoverageTimelinePoint } from "@/types/dashboard";

interface HeroCoverageTimelineChartProps {
  data: HeroCoverageTimelinePoint[];
  heroName: string;
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return iso;
  }
}

export default function HeroCoverageTimelineChart({
  data,
  heroName,
}: HeroCoverageTimelineChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm opacity-50 mt-2">
        No coverage timeline data for {heroName}.
      </p>
    );
  }

  const chartData = data.map((p) => ({
    label: shortDate(p.started_at),
    testcase_count: p.testcase_count,
    coverage_pct: p.coverage_pct,
  }));

  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--sidebar-text)", opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="tc"
            orientation="left"
            tick={{ fontSize: 10, fill: "#89b4fa", opacity: 0.7 }}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={(v: number) => String(v)}
          />
          <YAxis
            yAxisId="cov"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#a6e3a1", opacity: 0.7 }}
            axisLine={false}
            tickLine={false}
            width={40}
            tickFormatter={(v: number) => `${v}%`}
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
              if (name === "testcase_count") return [String(value), "Testcases"];
              if (name === "coverage_pct") return [`${value}%`, "Coverage"];
              return [String(value), name];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, opacity: 0.6 }}
            formatter={(value: string) => {
              if (value === "testcase_count") return "Testcases";
              if (value === "coverage_pct") return "Coverage %";
              return value;
            }}
          />
          <Line
            yAxisId="tc"
            type="monotone"
            dataKey="testcase_count"
            stroke="#89b4fa"
            strokeWidth={2}
            dot={{ r: 2, fill: "#89b4fa" }}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="cov"
            type="monotone"
            dataKey="coverage_pct"
            stroke="#a6e3a1"
            strokeWidth={2}
            dot={{ r: 2, fill: "#a6e3a1" }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
