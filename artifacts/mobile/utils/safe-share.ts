/**
 * safe-share.ts
 *
 * Wrapper aman untuk semua operasi share.
 * iOS melempar error saat user membatalkan share sheet.
 * Semua error pembatalan ditangkap secara diam-diam (tidak crash).
 */

import { Share } from "react-native";
import * as Sharing from "expo-sharing";

/** Deteksi apakah error adalah pembatalan oleh user (bukan error nyata) */
export function isCancellationError(e: unknown): boolean {
  if (!e) return false;
  const msg = (e as any)?.message ?? String(e);
  const lower = msg.toLowerCase();
  return (
    lower.includes("cancel") ||
    lower.includes("abort") ||
    lower.includes("dismiss") ||
    lower.includes("share was cancelled") ||
    lower.includes("user cancelled")
  );
}

/**
 * Berbagi teks/link dengan aman.
 * Tidak crash jika user membatalkan.
 * @returns true jika berhasil, false jika dibatalkan atau gagal
 */
export async function safeShareText(
  options: Parameters<typeof Share.share>[0]
): Promise<boolean> {
  try {
    const result = await Share.share(options);
    return result.action !== Share.dismissedAction;
  } catch (e) {
    if (!isCancellationError(e)) {
      console.warn("[safeShareText] Unexpected share error:", e);
    }
    return false;
  }
}

/**
 * Berbagi file dengan expo-sharing secara aman.
 * Tidak crash jika user membatalkan.
 * @returns true jika berhasil, false jika dibatalkan atau gagal
 */
export async function safeShareFile(
  uri: string,
  options?: Parameters<typeof Sharing.shareAsync>[1]
): Promise<boolean> {
  try {
    const available = await Sharing.isAvailableAsync();
    if (!available) return false;
    await Sharing.shareAsync(uri, options);
    return true;
  } catch (e) {
    if (!isCancellationError(e)) {
      console.warn("[safeShareFile] Unexpected share error:", e);
    }
    return false;
  }
}
