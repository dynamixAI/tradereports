import { useState } from 'react';
import { buildDeck, deckFileName } from './deck';
import { readyFolder, saveFile, savedMessage } from './folder';
import type { ToolReport } from './report';
import type { ToolFile } from './files';

// the "Download PowerPoint" button: one click, made on this computer
export function Download({
  report,
  files,
  businessName,
  onSaved,
}: {
  report: ToolReport;
  files: ToolFile[];
  businessName: string;
  // tells the report where the file went
  onSaved: (note: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    onSaved(null);
    try {
      // ask about the folder first, while the click still counts
      const folder = await readyFolder();
      const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      const blob = await buildDeck(report, {
        businessName,
        files: files.map((f) => f.upload.fileName),
        theme,
      });
      const saved = await saveFile(folder, blob, deckFileName(report.asOf, businessName));
      onSaved(savedMessage(saved));
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
