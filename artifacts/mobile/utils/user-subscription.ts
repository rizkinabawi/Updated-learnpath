import { db, auth } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";

export interface UserSubscription {
  isPremium: boolean;
  expiresAt: Timestamp | null;
  activationCodeHash: string | null;
  activatedAt: Timestamp | null;
}

export async function getUserSubscription(uid: string): Promise<UserSubscription> {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        isPremium: data.isPremium ?? false,
        expiresAt: data.expiresAt ?? null,
        activationCodeHash: data.activationCodeHash ?? null,
        activatedAt: data.activatedAt ?? null,
      };
    }
  } catch (e) {
    console.error("Error fetching subscription:", e);
  }
  return { isPremium: false, expiresAt: null, activationCodeHash: null, activatedAt: null };
}

import * as Crypto from "expo-crypto";

export async function activatePremium(uid: string, code: string, days: number = 365): Promise<boolean> {
  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    // Hash kode aktivasi agar tidak tersimpan sebagai teks biasa
    const hashedCode = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      code
    );

    await updateDoc(doc(db, "users", uid), {
      isPremium: true,
      activationCodeHash: hashedCode,
      activatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiryDate),
    });
    return true;
  } catch (e) {
    console.error("Error activating premium:", e);
    return false;
  }
}

/** Check if the user currently has active premium access */
export function isSubscriptionActive(sub: UserSubscription): boolean {
  if (!sub.isPremium) return false;
  if (!sub.expiresAt) return true; // Lifetime?
  
  const now = Timestamp.now();
  return sub.expiresAt.toMillis() > now.toMillis();
}
