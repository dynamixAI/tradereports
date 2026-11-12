// What the built page may load and contact (a Content Security Policy).
// It can't send your files anywhere: the only address it may contact is our
// GoatCounter counter, for the anonymous totals.
export function buildCsp(counter: string): string {
  // a GoatCounter code is letters, numbers and dashes; anything else is refused
  if (counter && !/^[a-z0-9-]+$/.test(counter)) throw new Error(`Bad counter code: ${counter}`);
  const count = counter ? `https://${counter}.goatcounter.com` : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: blob:${count ? ` ${count}` : ''}`,
    "font-src 'self'",
    `connect-src ${count || "'none'"}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
