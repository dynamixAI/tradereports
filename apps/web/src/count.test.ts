import { describe, expect, it } from 'vitest';
import {
  band,
  campaignFrom,
  countUrl,
  shouldSend,
  showNotice,
  sourceSite,
  visitTally,
} from './count';

describe('which report this is, as a band', () => {
  it('puts each count in a band, never the number itself', () => {
    expect(band(1)).toBe('report-1st');
    expect(band(2)).toBe('report-2nd-to-5th');
    expect(band(5)).toBe('report-2nd-to-5th');
    expect(band(6)).toBe('report-6th-to-20th');
    expect(band(20)).toBe('report-6th-to-20th');
    expect(band(21)).toBe('report-21st-plus');
    expect(band(400)).toBe('report-21st-plus');
  });
});

describe('the address a count is sent to', () => {
  it('sends an event with no page or referrer details', () => {
    const url = new URL(countUrl('tradereports', { path: 'report-1st', event: true }));
    expect(url.origin).toBe('https://tradereports.goatcounter.com');
    expect(url.pathname).toBe('/count');
    expect(url.searchParams.get('p')).toBe('report-1st');
    expect(url.searchParams.get('e')).toBe('true');
    expect(url.searchParams.has('r')).toBe(false);
  });

  it('sends a page view with its path and title', () => {
    const url = new URL(countUrl('abc', { path: '/help', title: 'Help and FAQ' }));
    expect(url.searchParams.get('p')).toBe('/help');
    expect(url.searchParams.get('t')).toBe('Help and FAQ');
    expect(url.searchParams.has('e')).toBe(false);
  });

  it('flags automated browsers so they are left out of the numbers', () => {
    const url = new URL(countUrl('abc', { path: '/', bot: true }));
    expect(url.searchParams.get('b')).toBe('151');
  });
});

describe('when nothing is sent', () => {
  const site = { code: 'tradereports', host: 'dynamixai.github.io', optedOut: false, gpc: false };

  it('sends on the live site', () => {
    expect(shouldSend(site)).toBe(true);
  });
  it('sends nothing until the GoatCounter code is set', () => {
    expect(shouldSend({ ...site, code: '' })).toBe(false);
  });
  it('sends nothing when testing on this computer', () => {
    expect(shouldSend({ ...site, host: 'localhost' })).toBe(false);
    expect(shouldSend({ ...site, host: '127.0.0.1' })).toBe(false);
  });
  it('sends nothing when switched off in Settings', () => {
    expect(shouldSend({ ...site, optedOut: true })).toBe(false);
  });
  it('sends nothing when the browser asks sites not to track (Global Privacy Control)', () => {
    expect(shouldSend({ ...site, gpc: true })).toBe(false);
  });
});

describe('the tally kept on this computer', () => {
  it('starts at the first report and marks a new month as active', () => {
    expect(visitTally({ reports: 0, month: null }, '2026-11')).toEqual({
      reports: 1,
      month: '2026-11',
      newMonth: true,
    });
  });
  it('counts up, and only marks each month once', () => {
    expect(visitTally({ reports: 4, month: '2026-11' }, '2026-11')).toEqual({
      reports: 5,
      month: '2026-11',
      newMonth: false,
    });
    expect(visitTally({ reports: 5, month: '2026-11' }, '2026-12').newMonth).toBe(true);
  });
});

describe('the one-time notice about counting', () => {
  const fresh = { seen: false, counting: true, gpc: false };

  it('shows on a first visit', () => {
    expect(showNotice(fresh)).toBe(true);
  });
  it('stays away once dismissed', () => {
    expect(showNotice({ ...fresh, seen: true })).toBe(false);
  });
  it('is not needed when counting is already off', () => {
    expect(showNotice({ ...fresh, counting: false })).toBe(false);
  });
  it('is not needed when the browser sends Global Privacy Control, as nothing is counted', () => {
    expect(showNotice({ ...fresh, gpc: true })).toBe(false);
  });

  it('keeps only the name of the site a visit came from', () => {
    expect(sourceSite('https://www.google.com/search?q=unpaid+invoice', 'tradereports.co.uk')).toBe(
      'https://www.google.com',
    );
    expect(sourceSite('https://www.linkedin.com/feed/update/123', 'tradereports.co.uk')).toBe(
      'https://www.linkedin.com',
    );
    // moving around our own site, or no referrer at all, sends nothing
    expect(sourceSite('https://tradereports.co.uk/help', 'tradereports.co.uk')).toBeUndefined();
    expect(sourceSite('', 'tradereports.co.uk')).toBeUndefined();
    expect(sourceSite('android-app://com.example', 'tradereports.co.uk')).toBeUndefined();
  });

  it('reads a tidy campaign tag from our own links and ignores anything else', () => {
    expect(campaignFrom('?utm_campaign=LinkedIn-AI-post')).toBe('linkedin-ai-post');
    expect(campaignFrom('?ref=facebook-trades')).toBe('facebook-trades');
    expect(campaignFrom('?utm_campaign=john@example.com')).toBeUndefined();
    expect(campaignFrom('?utm_campaign=has spaces')).toBeUndefined();
    expect(campaignFrom('')).toBeUndefined();
  });

  it('sends the source site and campaign to GoatCounter', () => {
    const url = new URL(
      countUrl('abc', { path: '/', ref: 'https://www.google.com', campaign: 'linkedin-ai-post' }),
    );
    expect(url.searchParams.get('r')).toBe('https://www.google.com');
    expect(url.searchParams.get('q')).toBe('?utm_campaign=linkedin-ai-post');
  });
});
