import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

// the rule the browser enforces on what the page may load and contact
const rules = (csp: string) =>
  Object.fromEntries(csp.split('; ').map((r) => [r.split(' ')[0], r.split(' ').slice(1)]));

describe('the security policy', () => {
  it('can contact nothing at all when counting has no code', () => {
    expect(rules(buildCsp(''))['connect-src']).toEqual(["'none'"]);
  });

  it('can contact only our GoatCounter address when counting is set up', () => {
    const r = rules(buildCsp('tradereports'));
    expect(r['connect-src']).toEqual(['https://tradereports.goatcounter.com']);
    // the fallback when sendBeacon isn't there is an image request
    expect(r['img-src']).toContain('https://tradereports.goatcounter.com');
  });

  it('still blocks forms, plugins and scripts from anywhere else', () => {
    const r = rules(buildCsp('tradereports'));
    expect(r['script-src']).toEqual(["'self'"]);
    expect(r['form-action']).toEqual(["'none'"]);
    expect(r['object-src']).toEqual(["'none'"]);
  });

  it('refuses a code that could widen the rule', () => {
    expect(() => buildCsp('evil.com *')).toThrow();
  });
});
