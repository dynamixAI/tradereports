import { describe, expect, it } from 'vitest';
import { anchor, compileGuide, isLive, readFrontMatter, todayInLondon } from './compile';

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

  it('is live straight away unless it has a later publish date', () => {
    expect(compileGuide(GUIDE, 'chase').published).toBe('2026-11-13');
    const later = GUIDE.replace(
      'updated: 2026-11-13',
      'updated: 2026-11-24\npublished: 2026-11-24',
    );
    expect(compileGuide(later, 'chase').published).toBe('2026-11-24');
    expect(() => compileGuide(GUIDE.replace('updated:', 'published: soon\nupdated:'), 'x')).toThrow(
      '"published" must look like',
    );
  });

  it('goes live on its publish date, not the day before', () => {
    expect(isLive('2026-11-24', '2026-11-23')).toBe(false);
    expect(isLive('2026-11-24', '2026-11-24')).toBe(true);
    expect(isLive('2026-11-24', '2026-12-01')).toBe(true);
  });

  it('uses the UK date, even late at night in summer', () => {
    // 23:30 UTC on 30 June is already 1 July in London (BST)
    expect(todayInLondon(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    // 23:30 UTC in winter is still the same day in London
    expect(todayInLondon(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01');
  });

  it('makes tidy anchors', () => {
    expect(anchor('Late payment: what you can charge')).toBe('late-payment-what-you-can-charge');
    expect(anchor('Step 1 &amp; 2')).toBe('step-1-2');
  });
});
