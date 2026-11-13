// the arrow mark and the name, used in the header
export function Logo() {
  return (
    <a className="logo" href="/" aria-label="TradeReports home">
      <svg className="logo-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        {/* the arrow head, pointing up and right */}
        <path d="M16 0H100V88H72V29H16Z" />
        {/* the tail */}
        <path d="M0 78L18 59H42V81L23 100H0Z" />
      </svg>
      <span className="logo-word">
        Trade<span>Reports</span>
      </span>
    </a>
  );
}
