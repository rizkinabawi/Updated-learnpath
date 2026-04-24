/**
 * secure-storage.ts
 *
 * Thin wrapper around expo-secure-store with an AsyncStorage fallback for
 * platforms where SecureStore is unavailable (currently: web). All secrets
 * (app license, creator private key, device id) flow through this module.
 */

import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const native = Platform.OS === "ios" || Platform.OS === "android";

export async function secureGet(key: string): Promise<string | null> {
  if (native) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (native) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      /* fall through to AsyncStorage */
    }
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* swallow — storage failure surfaces on read */
  }
}

export async function secureDelete(key: string): Promise<void> {
  if (native) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
