// guides written in Markdown arrive as ready-made HTML (see vite.config.ts)
declare module '*.md' {
  import type { CompiledGuide } from './guides/compile';
  // null when the guide isn't due to go live yet
  const guide: CompiledGuide | null;
  export default guide;
}
