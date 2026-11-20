/**
 * REQ-12 — editing the profile must validate and persist the fan's own data.
 *
 * The screen is the only way a fan can correct their name or phone. These
 * tests exercise the form behaviour: trimming, the shared schema's limits,
 * password confirmation, and the mutation payload. RLS covers the database
 * half (`rls-auth.test.sql`).
 */
/* eslint-disable import/first, import/order -- the screen import must run after jest.mock */
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockUpdateProfile = jest.fn().mockResolvedValue(undefined);
const mockChangePassword = jest.fn().mockResolvedValue(undefined);
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

jest.mock('@/lib/i18n', () => ({
  useTranslator: () => (key: string) => key,
}));

jest.mock('@/lib/api', () => ({
  errorMessage: (error: unknown) => String(error),
}));

jest.mock('@/lib/queries/profile', () => ({
  useProfile: () => ({
    isLoading: false,
    error: null,
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'fan@kickoff.app',
      fullName: 'Nara Chaiyaporn',
      phone: '081 234 5678',
      role: 'customer',
      joinedAt: '2026-08-12T09:00:00+07:00',
    },
  }),
  useUpdateProfile: () => ({ mutateAsync: mockUpdateProfile, isPending: false }),
  useChangePassword: () => ({ mutateAsync: mockChangePassword, isPending: false }),
}));

import EditProfileScreen from '../edit';

const change = async (element: Parameters<typeof fireEvent.changeText>[0], text: string) => {
  await act(async () => {
    fireEvent.changeText(element, text);
  });
};

const save = async (utils: Awaited<ReturnType<typeof render>>) => {
  await act(async () => {
    fireEvent.press(utils.getByText('Save changes'));
  });
};

describe('profile editing', () => {
  beforeEach(() => {
    mockUpdateProfile.mockClear();
    mockChangePassword.mockClear();
    mockBack.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saves the trimmed name and phone through the profile mutation', async () => {
    const utils = await render(<EditProfileScreen />);

    await change(utils.getByDisplayValue('Nara Chaiyaporn'), '  Nara C.  ');
    await change(utils.getByDisplayValue('081 234 5678'), '  089 999 0000  ');
    await save(utils);

    expect(mockUpdateProfile).toHaveBeenCalledWith({
      fullName: 'Nara C.',
      phone: '089 999 0000',
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it('rejects an empty name before calling the server', async () => {
    const utils = await render(<EditProfileScreen />);

    await change(utils.getByDisplayValue('Nara Chaiyaporn'), '   ');
    await save(utils);

    expect(utils.getByText('Enter your name.')).toBeTruthy();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('rejects a short password and mismatched confirmation', async () => {
    const utils = await render(<EditProfileScreen />);

    await change(utils.getByPlaceholderText('Leave blank to keep current'), 'short');
    await save(utils);
    expect(utils.getByText('Passwords must be at least 8 characters.')).toBeTruthy();

    await change(utils.getByPlaceholderText('Leave blank to keep current'), 'longenough');
    await change(utils.getByDisplayValue(''), 'different');
    await save(utils);
    expect(utils.getByText('The two passwords do not match.')).toBeTruthy();

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('sends the new password after the details when both are valid', async () => {
    const utils = await render(<EditProfileScreen />);

    await change(utils.getByPlaceholderText('Leave blank to keep current'), 'longenough');
    await change(utils.getByDisplayValue(''), 'longenough');
    await save(utils);

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockChangePassword).toHaveBeenCalledWith('longenough');
  });
});
