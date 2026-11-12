import { useState } from 'react';
import { buildDeck, deckFileName } from './deck';
import { readyFolder, saveFile, savedMessage, writeAnswersCopy } from './folder';
import { savedFile, savedFileName, type Memory } from './memory';
import { remembering } from './remember';
import { countStep } from '../count';
import type { ToolReport } from './report';
import type { Business, ToolFile } from './files';

// the "Download PowerPoint" button: one click, made on this computer
export function Download({
  report,
  files,
  business,
  memory,
  example = false,
  onSaved,
}: {
  report: ToolReport;
  files: ToolFile[];
  business: Business;
  memory: Memory;
  // the made-up example: no answers copy, not counted
  example?: boolean;
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
        businessName: business.name,
        files: files.map((f) => f.upload.fileName),
        theme,
      });
      const saved = await saveFile(folder, blob, deckFileName(report.asOf, business.name));
      let note = savedMessage(saved);
      // in a shared folder, leave a copy of the answers for the rest of the team
      if (folder && saved.folder && remembering() && !example) {
        try {
          const copy = savedFile(business, memory, new Date().toISOString());
          const json = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
          await writeAnswersCopy(folder, savedFileName(report.asOf, business.name), json);
          note = `${note ?? ''} Your answers were copied there too, for the rest of your team.`;
        } catch {
          // the report is saved; the copy can wait for next time
        }
      }
      onSaved(note);
      if (!example) countStep('powerpoint-downloaded');
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
