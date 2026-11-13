// guides written in Markdown arrive as ready-made HTML (see vite.config.ts)
declare module '*.md' {
  import type { CompiledGuide } from './guides/compile';
  const guide: CompiledGuide;
  export default guide;
}
