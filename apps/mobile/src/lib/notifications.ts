import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';
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

function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string }; projectId?: string }
    | undefined;
  return extra?.eas?.projectId ?? extra?.projectId ?? Constants.easConfig?.projectId;
}

/** Asks for permission, gets an Expo push token, and registers it with the club. */
export async function registerPushToken(): Promise<string> {
  if (!pushSupported()) {
    throw new Error('Push notifications need a physical iOS or Android device.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Match updates',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0B6B3A',
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
  if (!projectId) {
    throw new Error('Add your Expo project ID to enable push notifications.');
  }

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
