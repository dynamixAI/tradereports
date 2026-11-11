import { useEffect, useState } from 'react';
import { canPickFolder, forgetFolder, loadFolder, pickFolder } from './folder';

// "Files save to: Downloads · Choose a folder" under the report buttons.
// Hidden in browsers that can't write into a folder.
export function FolderPicker() {
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
    if (f) setName(f.name);
  };

  return (
    <p className="folder-line field-help">
      Files save to: <b>{name ?? 'Downloads'}</b>
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
          Use Downloads
        </button>
      )}
    </p>
  );
}
