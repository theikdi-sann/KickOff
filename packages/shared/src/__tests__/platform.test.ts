import { describe, expect, it } from 'vitest';

import {
  CLUB_SLUG_PATTERN,
  PLATFORM_CLAIM_KEY,
  isPlatformMetadata,
  isValidClubSlug,
  planBootstrapClaim,
} from '../platform';

describe('the platform claim', () => {
  it('is the one key the database, the Edge guards and the console read', () => {
    // 0054 writes `app_metadata.platform`; the console proxy and every Edge
    // guard must read the same key — a second name is a second authority.
    expect(PLATFORM_CLAIM_KEY).toBe('platform');
  });

  it('accepts metadata carrying the platform claim', () => {
    expect(isPlatformMetadata({ platform: true, role: 'admin' })).toBe(true);
  });

  it('refuses everything else — a staff role is not platform authority', () => {
    expect(isPlatformMetadata({ role: 'admin' })).toBe(false);
    expect(isPlatformMetadata({ platform: 'true' })).toBe(false);
    expect(isPlatformMetadata({ platform: 1 })).toBe(false);
    expect(isPlatformMetadata(null)).toBe(false);
    expect(isPlatformMetadata(undefined)).toBe(false);
    expect(isPlatformMetadata('platform')).toBe(false);
  });
});

describe('the club slug', () => {
  it('is the shape the tenants table accepts (0040)', () => {
    expect(CLUB_SLUG_PATTERN.source).toBe('^[a-z0-9]+(-[a-z0-9]+)*$');
    expect(isValidClubSlug('kickoff')).toBe(true);
    expect(isValidClubSlug('south-london-fc')).toBe(true);
    expect(isValidClubSlug('fc2026')).toBe(true);
  });

  it('refuses a slug the database would refuse', () => {
    const rejected = [
      '',
      'Kick Off',
      '-kickoff',
      'kickoff-',
      'a--b',
      'kick off',
      'kickoff_1',
      'สโมสร',
    ];
    for (const slug of rejected) {
      expect(isValidClubSlug(slug), slug).toBe(false);
    }
    expect(isValidClubSlug(null)).toBe(false);
    expect(isValidClubSlug(42)).toBe(false);
  });
});

describe('planBootstrapClaim', () => {
  it('names the claim a session is bound to a club by (D-29)', () => {
    expect(planBootstrapClaim('00000000-0000-0000-0000-000000000001')).toEqual({
      tenant_id: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('refuses an id that is not a uuid', () => {
    expect(() => planBootstrapClaim('not-a-uuid')).toThrow(RangeError);
    expect(() => planBootstrapClaim('')).toThrow(RangeError);
    expect(() => planBootstrapClaim('00000000-0000-0000-0000-0000000000g1')).toThrow(RangeError);
  });
});
