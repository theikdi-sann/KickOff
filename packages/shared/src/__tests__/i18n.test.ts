import { describe, expect, it } from 'vitest';

import { localeFromTag, translate } from '../i18n';
import { th } from '../messages.th';

describe('localeFromTag', () => {
  it('maps the club BCP-47 tag to the catalog locale', () => {
    expect(localeFromTag('th-TH')).toBe('th');
    expect(localeFromTag('th')).toBe('th');
    expect(localeFromTag('en-GB')).toBe('en');
    expect(localeFromTag('en-US')).toBe('en');
  });

  it('falls back to English for anything the catalogs do not cover', () => {
    expect(localeFromTag('de-DE')).toBe('en');
    expect(localeFromTag('')).toBe('en');
    expect(localeFromTag('th-x-not-a-tag')).toBe('th');
  });
});

describe('translate', () => {
  it('English is the key itself — there is no English catalog to drift', () => {
    expect(translate('en', 'Not on sale')).toBe('Not on sale');
  });

  it('Thai looks the key up in the catalog', () => {
    expect(translate('th', 'Not on sale')).toBe('ไม่มีจำหน่าย');
    expect(th['Not on sale']).toBe('ไม่มีจำหน่าย');
  });

  it('a missing translation degrades to the English key, never to empty', () => {
    expect(translate('th', 'A key nobody translated')).toBe('A key nobody translated');
  });

  it('interpolates named parameters into whichever message resolved', () => {
    // A real product key with a placeholder (the receipt's fixture line):
    // the English message lives in the key, the Thai in the catalog, and
    // interpolation runs on whichever resolved — not on the key itself.
    expect(translate('en', 'KickOff vs {opponent}', { opponent: 'Bangkok Rovers' })).toBe(
      'KickOff vs Bangkok Rovers',
    );
    expect(translate('th', 'KickOff vs {opponent}', { opponent: 'Bangkok Rovers' })).toBe(
      'KickOff พบ Bangkok Rovers',
    );
  });

  it('leaves the placeholder visible when a parameter is missing', () => {
    expect(translate('en', 'Hi {name}')).toBe('Hi {name}');
  });
});
