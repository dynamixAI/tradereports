import { useState } from 'react';
import { buildDeck, deckFileName } from './deck';
import type { ToolReport } from './report';
import type { ToolFile } from './files';

// the "Download PowerPoint" button: one click, made on this computer
export function Download({
  report,
  files,
  businessName,
}: {
  report: ToolReport;
  files: ToolFile[];
  businessName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const blob = await buildDeck(report, {
        businessName,
        files: files.map((f) => f.upload.fileName),
        theme,
      });
      saveBlob(blob, deckFileName(report.asOf, businessName));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong making the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="dl">
      <button type="button" className="try" disabled={busy} onClick={() => void download()}>
        {busy ? 'Making the file…' : 'Download PowerPoint'}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

// hand a file to the browser's download
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // give the browser a moment to start the download before the link is thrown away
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
