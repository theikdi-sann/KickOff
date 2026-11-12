import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
import { brand } from '@kickoff/shared';
import { api } from './api';

/** Show alerts while the app is foregrounded; the OS handles the rest. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export interface DeviceRegistration {
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: string;
}

export function pushSupported(): boolean {
  return Device.isDevice && Platform.OS !== 'web';
}

/**
 * The three push failure messages — deliberately distinct, each naming its own
 * fix: wrong runtime, no EAS project, or no physical device.
 */
const PUSH_NEEDS_DEVICE = 'Push notifications need a physical iOS or Android device.';
const PUSH_NEEDS_DEV_BUILD =
  'Expo Go cannot receive push notifications (removed in SDK 53) — use a development build instead.';
const PUSH_NEEDS_EAS_PROJECT =
  'EAS_PROJECT_ID is missing — run `npx eas-cli init` and copy the id into apps/mobile/.env.';

/**
 * Why push cannot run in the current environment, or `null` when it can.
 * Settings renders this under the switch; `registerPushToken` throws it, so
 * nobody has to decode an opaque library error to find out what to do.
 */
export function pushUnavailableReason(): string | null {
  if (!pushSupported()) {
    return PUSH_NEEDS_DEVICE;
  }
  // Remote push was removed from Expo Go with SDK 53, and the token call below
  // would fail there with a low-level error instead of an instruction.
  if (isRunningInExpoGo()) {
    return PUSH_NEEDS_DEV_BUILD;
  }
  if (!expoProjectId()) {
    return PUSH_NEEDS_EAS_PROJECT;
  }
  return null;
}

function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string }; projectId?: string }
    | undefined;
  return extra?.eas?.projectId ?? extra?.projectId ?? Constants.easConfig?.projectId;
}

/** Asks for permission, gets an Expo push token, and registers it with the club. */
export async function registerPushToken(): Promise<string> {
  const unavailable = pushUnavailableReason();
  if (unavailable) throw new Error(unavailable);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Match updates',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: brand.primary,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted =
    existing.granted || existing.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted =
      requested.granted ||
      requested.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  }
  if (!granted) throw new Error('Notification permission was not granted.');

  const projectId = expoProjectId();
  // `pushUnavailableReason()` above already ruled this out; this narrows the
  // type for the token call without a non-null assertion.
  if (!projectId) throw new Error(PUSH_NEEDS_EAS_PROJECT);
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.post('devices', { token, platform: Platform.OS });
  return token;
}

/** Removes one token, or every token for the caller when none is supplied. */
export async function unregisterPushToken(token?: string): Promise<void> {
  await api.call('devices', { method: 'DELETE', body: token ? { token } : { all: true } });
}

export async function listDeviceRegistrations(): Promise<DeviceRegistration[]> {
  const result = await api.get<{ devices: DeviceRegistration[] }>('devices');
  return result.devices;
}
