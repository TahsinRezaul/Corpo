"use client";

const PRESETS = [
  { label: "Every 2 weeks", value: "2w" },
  { label: "Monthly",       value: "1m" },
  { label: "Quarterly",     value: "3m" },
  { label: "Yearly",        value: "1y" },
];

function decompose(s: string): { n: number; unit: string } {
  if (s === "monthly") return { n: 1, unit: "m" };
  if (s === "yearly")  return { n: 1, unit: "y" };
  const m = s.match(/^(\d+)([dwmy])$/);
  if (m) return { n: parseInt(m[1]), unit: m[2] };
  return { n: 1, unit: "m" };
}

function isPresetActive(preset: string, value: string) {
  if (preset === value) return true;
  if (preset === "1m" && value === "monthly") return true;
  if (preset === "1y" && value === "yearly")  return true;
  return false;
}

export default function IntervalPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { n, unit } = decompose(value || "1m");

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      {/* Quick presets */}
      <div className="flex gap-2 flex-wrap">
        {PRESETS.map((p) => {
          const active = isPresetActive(p.value, value);
          return (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                backgroundColor: active ? "var(--accent-green)" : "var(--bg-elevated)",
                color:           active ? "#fff" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent-green)" : "var(--border)"}`,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom */}
      <div className="flex items-center gap-2">
        <span className="text-xs flex-shrink-0" style={{ color: "var(--text-secondary)" }}>Custom: every</span>
        <input
          type="number"
          value={n}
          min={1}
          max={999}
          onChange={(e) => {
            const num = Math.max(1, parseInt(e.target.value) || 1);
            onChange(`${num}${unit}`);
          }}
          className="w-16 px-2 py-1.5 rounded-lg text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          style={inputStyle}
        />
        <select
          value={unit}
          onChange={(e) => onChange(`${n}${e.target.value}`)}
          className="px-2 py-1.5 rounded-lg text-sm outline-none"
          style={inputStyle}
        >
          <option value="d">days</option>
          <option value="w">weeks</option>
          <option value="m">months</option>
          <option value="y">years</option>
        </select>
      </div>
    </div>
  );
}
