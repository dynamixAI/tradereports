import { describe, expect, it } from 'vitest';
import { SITE, mailto } from './site';

describe('mailto', () => {
  it('goes to the contact address with the subject filled in', () => {
    expect(mailto('Hello')).toBe(`mailto:${SITE.email}?subject=Hello&body=`);
  });

  // email apps show + literally, so spaces must be %20
  it('writes spaces as %20 and keeps line breaks', () => {
    const link = mailto('Report request', 'line one\nline two');
    expect(link).toContain('subject=Report%20request');
    expect(link).toContain('body=line%20one%0Aline%20two');
    expect(link).not.toContain('+');
  });
});
