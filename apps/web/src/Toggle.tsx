// an on/off switch; screen readers hear it as a switch
export function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className="toggle"
      onClick={() => onChange(!on)}
    >
      <span>{label}</span>
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
    </button>
  );
}
