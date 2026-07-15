"use client";

import {
  forwardRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

type EditableNumberInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "defaultValue" | "onChange" | "type" | "value"
> & {
  onValueChange: (value: number) => void;
  parse?: "float" | "int";
  value: number;
};

/**
 * A controlled numeric input that keeps its text draft while it has focus.
 *
 * Numeric application state cannot represent an empty field. Keeping the draft
 * here lets a user clear the current number before typing its replacement,
 * while the last valid numeric value remains available to the application.
 */
export const EditableNumberInput = forwardRef<
  HTMLInputElement,
  EditableNumberInputProps
>(function EditableNumberInput(
  {
    onBlur,
    onFocus,
    onValueChange,
    parse = "float",
    value,
    ...inputProps
  },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      {...inputProps}
      ref={ref}
      type="number"
      value={draft ?? value}
      onFocus={(event) => {
        setDraft(event.currentTarget.value);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        setDraft(raw);
        if (raw === "") return;

        const parsed = parse === "int" ? parseInt(raw, 10) : Number(raw);
        if (Number.isFinite(parsed)) onValueChange(parsed);
      }}
    />
  );
});
