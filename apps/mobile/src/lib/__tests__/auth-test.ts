import type { User } from '@supabase/supabase-js';
import { initialsFor, profileFromUser } from '../auth';

// Phase C4 — F-14: the supporter app had no unit-test harness at all, so the
// pure logic behind its profile screen was never proven. These are the first
// tests; the harness (jest-expo + React Native Testing Library) is the real
// deliverable, and it must run under `npm test` like every other workspace.

const user = {
  id: 'usr-1',
  email: 'ada@example.com',
  created_at: '2026-01-02T03:04:05Z',
  user_metadata: { full_name: 'Ada Lovelace' },
  app_metadata: {},
} as unknown as User;

describe('initialsFor', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFor('Ada Lovelace')).toBe('AL');
  });

  it('collapses extra whitespace and ignores empty parts', () => {
    expect(initialsFor('  Ada   Lovelace  ')).toBe('AL');
  });

  it('falls back to the club crest when there is no name', () => {
    expect(initialsFor('')).toBe('KO');
    expect(initialsFor('   ')).toBe('KO');
  });
});

describe('profileFromUser', () => {
  it('prefers the profile row over the auth metadata', () => {
    const profile = profileFromUser(user, {
      id: 'usr-1',
      email: 'ada@club.test',
      full_name: 'Ada L.',
      phone: '+66 80 000 0000',
      created_at: '2026-02-01T00:00:00Z',
    });

    expect(profile).toMatchObject({
      id: 'usr-1',
      email: 'ada@club.test',
      fullName: 'Ada L.',
      // The role comes from the JWT claim, not from the profile row — the
      // legacy `profiles.role` column goes with 0048. This user carries no
      // claim, so it is a customer.
      role: 'customer',
      phone: '+66 80 000 0000',
      initials: 'AL',
      joinedAt: '2026-02-01T00:00:00Z',
    });
  });

  it('falls back to the auth metadata when the row is missing', () => {
    const profile = profileFromUser(user);

    expect(profile).toMatchObject({
      id: 'usr-1',
      email: 'ada@example.com',
      fullName: 'Ada Lovelace',
      role: 'customer',
      initials: 'AL',
      joinedAt: '2026-01-02T03:04:05Z',
    });
  });

  it('reads the admin role from the JWT claim when there is no row', () => {
    const admin = {
      ...user,
      app_metadata: { role: 'admin' },
    } as unknown as User;

    expect(profileFromUser(admin).role).toBe('admin');
  });

  it('reads a gatekeeper from the JWT claim too', () => {
    const gatekeeper = {
      ...user,
      app_metadata: { role: 'gatekeeper' },
    } as unknown as User;

    expect(profileFromUser(gatekeeper).role).toBe('gatekeeper');
  });

  it('falls back to the local part of the e-mail when there is no name', () => {
    const anonymous = {
      ...user,
      user_metadata: {},
    } as unknown as User;

    expect(profileFromUser(anonymous).fullName).toBe('ada');
    expect(profileFromUser(anonymous).initials).toBe('A');
  });
});
