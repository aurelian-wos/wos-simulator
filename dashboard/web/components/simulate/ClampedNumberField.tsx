"use client";

import { EditableNumberInput } from "@/components/EditableNumberInput";

export function ClampedNumberField({
  className = "sim-input min-h-[42px] px-3 py-2 text-right font-mono text-sm tabular-nums",
  inputMode,
  label,
  max,
  min,
  name,
  onChange,
  parse = "int",
  placeholder,
  value,
  wrapperClassName = "sim-mode-option-row",
}: {
  className?: string;
  inputMode?: "numeric";
  label: string;
  max?: number;
  min: number;
  name: string;
  onChange: (value: number) => void;
  parse?: "int" | "float";
  placeholder?: string;
  value: number;
  wrapperClassName?: string;
}) {
  return (
    <label className={wrapperClassName}>
      <span className="sim-field-label">{label}</span>
      <EditableNumberInput
        name={name}
        min={min}
        max={max}
        inputMode={inputMode}
        value={value}
        parse={parse}
        onValueChange={(parsed) =>
          onChange(Math.max(min, max === undefined ? parsed : Math.min(max, parsed)))
        }
        placeholder={placeholder}
        className={className}
      />
    </label>
  );
}

export function NumberStringField({
  className = "sim-input min-h-[42px] px-3 py-2 text-right font-mono text-sm tabular-nums",
  inputMode,
  label,
  min,
  name,
  onChange,
  placeholder,
  value,
  wrapperClassName = "sim-mode-option-row",
}: {
  className?: string;
  inputMode?: "numeric";
  label: string;
  min: number;
  name: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
  wrapperClassName?: string;
}) {
  return (
    <label className={wrapperClassName}>
      <span className="sim-field-label">{label}</span>
      <input
        type="number"
        name={name}
        min={min}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    </label>
  );
}
