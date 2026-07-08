"use client";

import { useEffect, useRef, useState } from "react";

export function ProgressBar({
  active,
  done,
  total,
}: {
  active: boolean;
  done: number;
  total: number;
}) {
  const [displayPct, setDisplayPct] = useState(0);
  const [show, setShow] = useState(false);
  const showRef = useRef(false);

  useEffect(() => {
    if (active) {
      setShow(true);
      showRef.current = true;
    } else if (showRef.current) {
      setDisplayPct(100);
      const t = setTimeout(() => {
        setShow(false);
        showRef.current = false;
        setDisplayPct(0);
      }, 650);
      return () => clearTimeout(t);
    }
  }, [active]);

  useEffect(() => {
    if (active) {
      setDisplayPct(total > 0 ? Math.min(100, (done / total) * 100) : 0);
    }
  }, [active, done, total]);

  if (!show) return null;

  const label =
    active && total > 0
      ? `${done.toLocaleString()} / ${total.toLocaleString()}`
      : null;

  return (
    <div className="mt-2">
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.min(displayPct, 100)}%`,
            backgroundColor: "var(--sim-blue)",
            transition: active ? "width 0.2s ease-out" : "width 0.4s ease-out",
            borderRadius: "9999px",
          }}
        />
      </div>
      {label && <p className="mt-1 font-mono text-xs opacity-50">{label}</p>}
    </div>
  );
}

export function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="sim-tool-panel flex flex-col gap-0.5 px-3 py-2">
      <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-50">
        {label}
      </span>
      <span
        className="font-mono text-sm font-bold"
        style={{ color: "var(--sim-blue)" }}
      >
        {value}
      </span>
    </div>
  );
}
