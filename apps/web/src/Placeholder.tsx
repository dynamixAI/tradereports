// stand-in for pages we haven't built yet
export function Placeholder({ title }: { title: string }) {
  return (
    <main id="main" tabIndex={-1} className="placeholder">
      <h1>{title}</h1>
      <p>This page is on its way.</p>
      <a className="try" href="#/">
        Back to the home page
      </a>
    </main>
  );
}
