import { useEffect, useState, type InputHTMLAttributes } from "react";
import { parseQuickDate } from "./quick-date-time";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
};

const displayValue = (value?: string) =>
  value ? (parseQuickDate(value)?.display ?? value) : "";

export default function QuickDateInput({
  value,
  defaultValue,
  onChange,
  name,
  ...props
}: Props) {
  const controlled = value !== undefined;
  const initial = value ?? defaultValue ?? "";
  const [display, setDisplay] = useState(displayValue(initial));
  const [iso, setIso] = useState(parseQuickDate(initial)?.iso ?? "");

  useEffect(() => {
    if (!controlled) return;
    setDisplay(displayValue(value));
    setIso(parseQuickDate(value ?? "")?.iso ?? "");
  }, [controlled, value]);

  return (
    <>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        maxLength={10}
        placeholder="DD/MM/AAAA"
        value={display}
        onChange={(event) => {
          const next = event.target.value;
          setDisplay(next);
          event.target.setCustomValidity("");
          if (!next) {
            setIso("");
            onChange?.("");
            return;
          }
          const parsed = parseQuickDate(next);
          if (parsed) {
            setIso(parsed.iso);
            onChange?.(parsed.iso);
          }
        }}
        onBlur={(event) => {
          const parsed = parseQuickDate(event.target.value);
          if (parsed) {
            setDisplay(parsed.display);
            setIso(parsed.iso);
            onChange?.(parsed.iso);
          }
          event.target.setCustomValidity(
            parsed || !event.target.value
              ? ""
              : "Informe uma data válida, como 121226 ou 12/12/2026.",
          );
        }}
      />
      {name && <input type="hidden" name={name} value={iso} />}
    </>
  );
}
