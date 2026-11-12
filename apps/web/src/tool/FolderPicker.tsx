import { useEffect, useState } from 'react';
import { canPickFolder, forgetFolder, loadFolder, newestAnswers, pickFolder } from './folder';
import { readSavedFile, type SavedFile } from './memory';

// "Files save to: Downloads · Choose a folder" under the report buttons.
// Hidden in browsers that can't write into a folder.
// onTeam gets the newest answers someone else left in the folder.
export function FolderPicker({
  onTeam,
  lead = 'Files save to:',
  empty = 'Downloads',
}: {
  onTeam: (file: SavedFile) => void;
  lead?: string;
  // what to show before a folder is chosen
  empty?: string;
}) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadFolder().then((f) => live && setName(f?.name ?? null));
    return () => {
      live = false;
    };
  }, []);

  if (!canPickFolder()) return null;

  const choose = async () => {
    const f = await pickFolder();
    if (!f) return;
    setName(f.name);
    // someone may have answered the column questions already
    const text = await newestAnswers(f).catch(() => null);
    const read = text === null ? null : readSavedFile(text);
    if (read && typeof read !== 'string') onTeam(read);
  };

  return (
    <p className="folder-line field-help">
      {lead} <b>{name ?? empty}</b>
      <button type="button" className="link" onClick={() => void choose()}>
        {name ? 'Change folder' : 'Choose a folder'}
      </button>
      {name && (
        <button
          type="button"
          className="link"
          onClick={() => {
            void forgetFolder();
            setName(null);
          }}
        >
          {empty === 'Downloads' ? 'Use Downloads' : 'Stop using it'}
        </button>
      )}
    </p>
  );
}
