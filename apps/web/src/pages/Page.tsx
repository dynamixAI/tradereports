import type { ReactNode } from 'react';
import { SITE } from '../site';

// the frame every text page shares: a title, an optional line under it, and the words
export function Page({
  title,
  intro,
  updated = false,
  children,
}: {
  title: string;
  intro?: string;
  // legal pages say when they last changed
  updated?: boolean;
  children: ReactNode;
}) {
  return (
    <main id="main" tabIndex={-1} className="page">
      <h1>{title}</h1>
      {intro && <p className="page-intro">{intro}</p>}
      {updated && <p className="page-updated">Last updated {SITE.updated}</p>}
      <div className="prose">{children}</div>
    </main>
  );
}
