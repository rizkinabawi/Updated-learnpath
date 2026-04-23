import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const REMINDER_KEY = "study_reminder";
const DAILY_NOTIF_ID_KEY = "daily_notif_id";
const REMINDER_NOTIF_ID_KEY = "study_reminder_notif_id";

export interface ReminderSettings {
  enabled: boolean;
  hour: number;
  minute: number;
}

export const MOTIVATIONAL_MESSAGES = [
  { title: "📚 Hei, Sudah Belajar Hari Ini?", body: "Kamu sudah sangat dekat dengan tujuanmu. Yuk, luangkan 10 menit untuk belajar sekarang!" },
  { title: "🔥 Jangan Putus Semangatmu!", body: "Konsistensi adalah kunci. Buka kursusmu dan teruskan progressmu hari ini!" },
  { title: "🎯 Ingat Targetmu!", body: "Setiap hari kamu belajar, kamu selangkah lebih dekat menuju impianmu. Ayo mulai!" },
  { title: "⚡ Waktu Belajar!", body: "Otak terbaik bekerja dengan latihan rutin. Buka app dan pelajari sesuatu yang baru!" },
  { title: "🌟 Kamu Bisa!", body: "Progress kamu luar biasa! Jangan berhenti sekarang — teruskan belajarmu hari ini." },
  { title: "💪 Waktunya Berlatih!", body: "Flashcard dan quiz sudah menunggumu. Yuk, asah kemampuanmu sekarang!" },
  { title: "🧠 Asah Otakmu Hari Ini", body: "Belum terlambat! Luangkan waktu sebentar untuk belajar dan menjaga streak-mu." },
  { title: "🚀 Mulai Harimu dengan Belajar!", body: "Pelajar sukses belajar setiap hari. Buka kursusmu dan jadilah yang terbaik!" },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const requestNotificationPermissions = async (): Promise<boolean> => {
  if (Platform.OS === "web") return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
};

export const scheduleDailyMotivation = async (): Promise<string | null> => {
  if (Platform.OS === "web") return null;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    const prev = await AsyncStorage.getItem(DAILY_NOTIF_ID_KEY);
    if (prev) {
      try { await Notifications.cancelScheduledNotificationAsync(prev); } catch {}
    }

    const msg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: msg.title,
        body: msg.body,
        sound: true,
        data: { type: "daily_motivation" },
      },
      trigger: { hour: 8, minute: 0, repeats: true } as any,
    });
    await AsyncStorage.setItem(DAILY_NOTIF_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
};

export const getReminderSettings = async (): Promise<ReminderSettings> => {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, hour: 19, minute: 0 };
};

export const saveReminderSettings = async (settings: ReminderSettings): Promise<void> => {
  await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(settings));
};

export const scheduleStudyReminder = async (hour: number, minute: number): Promise<string | null> => {
  if (Platform.OS === "web") return null;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    const prev = await AsyncStorage.getItem(REMINDER_NOTIF_ID_KEY);
    if (prev) {
      try { await Notifications.cancelScheduledNotificationAsync(prev); } catch {}
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "⏰ Waktunya Belajar!",
        body: "Pengingat belajarmu berbunyi! Yuk, buka kursus dan pelajari sesuatu hari ini.",
        sound: true,
        data: { type: "study_reminder" },
      },
      trigger: { hour, minute, repeats: true } as any,
    });
    await AsyncStorage.setItem(REMINDER_NOTIF_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
};

export const cancelStudyReminder = async (): Promise<void> => {
  if (Platform.OS === "web") return;
  try {
    const prev = await AsyncStorage.getItem(REMINDER_NOTIF_ID_KEY);
    if (prev) {
      await Notifications.cancelScheduledNotificationAsync(prev);
      await AsyncStorage.removeItem(REMINDER_NOTIF_ID_KEY);
    }
  } catch {}
};

export const sendInstantMotivation = async (title: string, body: string): Promise<void> => {
  if (Platform.OS === "web") return;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  } catch {}
};
