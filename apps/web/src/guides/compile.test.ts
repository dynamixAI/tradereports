import { describe, expect, it } from 'vitest';
import { anchor, compileGuide, readFrontMatter } from './compile';

const GUIDE = `---
title: Chasing an invoice
description: What to send, and when.
updated: 2026-11-13
---

## Before you chase

Check the [due date](/app) and read [GOV.UK](https://www.gov.uk/x).
`;

describe('guides', () => {
  it('reads the details at the top', () => {
    const { meta, body } = readFrontMatter(GUIDE);
    expect(meta).toEqual({
      title: 'Chasing an invoice',
      description: 'What to send, and when.',
      updated: '2026-11-13',
    });
    expect(body.startsWith('\n## Before you chase')).toBe(true);
  });

  it('turns the guide into HTML with linkable headings', () => {
    const g = compileGuide(GUIDE, 'chase');
    expect(g.slug).toBe('chase');
    expect(g.html).toContain('<h2 id="before-you-chase">Before you chase</h2>');
    expect(g.minutes).toBe(1);
  });

  it('opens other sites in a new tab but keeps our own links as normal', () => {
    const g = compileGuide(GUIDE, 'chase');
    expect(g.html).toContain('<a href="/app">due date</a>');
    expect(g.html).toContain(
      '<a href="https://www.gov.uk/x" target="_blank" rel="noopener noreferrer">GOV.UK</a>',
    );
  });

  it('refuses a guide with missing or badly written details', () => {
    expect(() => compileGuide('# No details', 'x')).toThrow('missing "title"');
    expect(() =>
      compileGuide('---\ntitle: a\ndescription: b\nupdated: 13/11/2026\n---\n', 'x'),
    ).toThrow('updated');
  });

  it('makes tidy anchors', () => {
    expect(anchor('Late payment: what you can charge')).toBe('late-payment-what-you-can-charge');
    expect(anchor('Step 1 &amp; 2')).toBe('step-1-2');
  });
});
