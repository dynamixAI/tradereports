import * as core from '@tradereports/core';

// how many things the engine exports, just to check the link works
const engineParts = Object.keys(core).length;

export function App() {
  return (
    <main>
      <h1>TradeReports</h1>
      <p>Engine loaded: {engineParts} parts.</p>
    </main>
  );
}
