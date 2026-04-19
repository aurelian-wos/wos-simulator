"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TestcaseTrendRow } from "@/types/dashboard";

const COLOURS = [
  "#89b4fa","#a6e3a1","#f38ba8","#fab387","#f9e2af",
  "#94e2d5","#cba6f7","#74c7ec","#eba0ac","#b4befe",
  "#89dceb","#f5c2e7","#cdd6f4","#a6adc8","#bac2de",
  "#6c7086","#9399b2","#7f849c","#585b70","#45475a",
];

interface Props {
  rows: TestcaseTrendRow[];
}

interface TrendEntry {
  file: string;
  testcase_id: string;
  idx: number;
  points: { run_id: string; started_at: string; bias_pct: number | null }[];
}

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return iso;
  }
}

function computeVariance(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nums.length;
}

function makeShortLabel(
  file: string,
  testcase_id: string,
  idx: number,
  fileHasMultipleIds: boolean
): string {
  let label = file
    .replace(/^testcases\/(emulator_verified\/)?/, "")
    .replace(/\.json$/, "");
  if (fileHasMultipleIds && testcase_id) label += `/${testcase_id}`;
  if (idx > 0) label += `[${idx}]`;
  return label;
}

export default function TestcaseVarianceChart({ rows }: Props) {
  const [topN, setTopN] = useState(10);

  if (rows.length === 0) return null;

  // Pivot rows into a map keyed by "file|testcase_id|idx"
  const map = new Map<string, TrendEntry>();
  for (const row of rows) {
    const key = `${row.file}|${row.testcase_id}|${row.idx}`;
    if (!map.has(key)) {
      map.set(key, { file: row.file, testcase_id: row.testcase_id, idx: row.idx, points: [] });
    }
    map.get(key)!.points.push({
      run_id: row.run_id,
      started_at: row.started_at,
      bias_pct: row.bias_pct,
    });
  }

  // Sorted unique run timestamps for X axis
  const allTimestamps = Array.from(
    new Set(rows.map((r) => r.started_at))
  ).sort();

  // Determine which file basenames have multiple testcase_ids
  const fileBasenameToIds = new Map<string, Set<string>>();
  for (const entry of map.values()) {
    const base = entry.file
      .replace(/^testcases\/(emulator_verified\/)?/, "")
      .replace(/\.json$/, "");
    if (!fileBasenameToIds.has(base)) fileBasenameToIds.set(base, new Set());
    fileBasenameToIds.get(base)!.add(entry.testcase_id);
  }

  // Sort testcases by variance descending
  const sorted = Array.from(map.values()).sort((a, b) => {
    return (
      computeVariance(b.points.map((p) => p.bias_pct)) -
      computeVariance(a.points.map((p) => p.bias_pct))
    );
  });

  const selected = sorted.slice(0, topN);

  // Build short keys for chart series
  const seriesKeys = selected.map((entry) => {
    const base = entry.file
      .replace(/^testcases\/(emulator_verified\/)?/, "")
      .replace(/\.json$/, "");
    const hasMultiIds = (fileBasenameToIds.get(base)?.size ?? 0) > 1;
    return makeShortLabel(entry.file, entry.testcase_id, entry.idx, hasMultiIds);
  });

  // Build lookup: shortKey -> run_id -> bias_pct
  const seriesData: Map<string, Map<string, number | null>> = new Map();
  for (let i = 0; i < selected.length; i++) {
    const lookup = new Map<string, number | null>();
    for (const pt of selected[i].points) {
      lookup.set(pt.started_at, pt.bias_pct);
    }
    seriesData.set(seriesKeys[i], lookup);
  }

  // Build chart data: one entry per run timestamp
  const chartData = allTimestamps.map((ts) => {
    const entry: Record<string, string | number | null> = {
      label: shortDate(ts),
    };
    for (const key of seriesKeys) {
      entry[key] = seriesData.get(key)?.get(ts) ?? null;
    }
    return entry;
  });

  return (
    <div className="mb-6">
      <p
        className="text-xs uppercase tracking-wider opacity-50 mb-2"
        style={{ color: "var(--main-text)" }}
      >
        Per-testcase Bias % over Time
      </p>
      <div className="mb-3 flex items-center gap-3">
        <label
          className="text-xs opacity-60"
          style={{ color: "var(--main-text)" }}
        >
          Show top {topN} most variable testcases by run-to-run variance
        </label>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={topN}
          onChange={(e) => setTopN(Number(e.target.value))}
          className="w-32 accent-[var(--sidebar-active)]"
        />
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--sidebar-text)", opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--sidebar-text)", opacity: 0.5 }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--sidebar-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: 4,
              fontSize: 11,
              color: "var(--main-text)",
            }}
            formatter={(value: unknown, name: string) => [
              typeof value === "number" ? `${value.toFixed(1)}%` : "—",
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, opacity: 0.6, color: "var(--sidebar-text)" }}
          />
          {seriesKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLOURS[i % COLOURS.length]}
              strokeWidth={1.5}
              opacity={0.8}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
