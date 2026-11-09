import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Supabase auth storage backed by expo-secure-store (Keychain on iOS, Keystore
 * on Android), chunked because SecureStore limits individual values to ~2 KB.
 * Web falls back to localStorage for the Expo web preview.
 */
export interface SupabaseStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const CHUNK_SIZE = 1800;
const META_SUFFIX = '__chunks';

const isWeb = Platform.OS === 'web';

const webStorage: SupabaseStorageAdapter = {
  async getItem(key) {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  },
};

function metaKey(key: string): string {
  return `${key}${META_SUFFIX}`;
}

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

const nativeStorage: SupabaseStorageAdapter = {
  async getItem(key) {
    const meta = await SecureStore.getItemAsync(metaKey(key));
    if (!meta) {
      // Legacy/un-chunked value.
      return SecureStore.getItemAsync(key);
    }

    const count = Number.parseInt(meta, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts = await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
    );
    if (parts.some((part) => part === null)) return null;
    return parts.join('');
  },

  async setItem(key, value) {
    const previousMeta = await SecureStore.getItemAsync(metaKey(key));
    const previousCount = previousMeta ? Number.parseInt(previousMeta, 10) : 0;

    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += CHUNK_SIZE) {
      chunks.push(value.slice(index, index + CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push('');

    // Write data first, then publish the count so a partial write is never read.
    for (let index = 0; index < chunks.length; index += 1) {
      await SecureStore.setItemAsync(chunkKey(key, index), chunks[index]);
    }
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length));

    for (let index = chunks.length; index < previousCount; index += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, index));
    }
    // Drop any legacy un-chunked value.
    await SecureStore.deleteItemAsync(key);
  },

  async removeItem(key) {
    const meta = await SecureStore.getItemAsync(metaKey(key));
    const count = meta ? Number.parseInt(meta, 10) : 0;

    await Promise.all(
      Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) =>
        SecureStore.deleteItemAsync(chunkKey(key, index)),
      ),
    );
    await SecureStore.deleteItemAsync(metaKey(key));
    await SecureStore.deleteItemAsync(key);
  },
};

export const secureStorage: SupabaseStorageAdapter = isWeb ? webStorage : nativeStorage;
