// lint rules for the whole repo
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // folders lint should never look at
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dist-ssr/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  // build scripts run in Node, not the browser
  {
    files: ['**/scripts/**/*.mjs'],
    languageOptions: { globals: { URL: 'readonly', console: 'readonly' } },
  },
  // turn off rules that clash with prettier formatting
  prettier,
);
