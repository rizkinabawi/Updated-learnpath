import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@external_screens_v1";

export interface ExternalScreen {
  id: string;
  title: string;
  url: string;
  icon?: string;
  createdAt: string;
}

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  return "https://" + v;
}

export async function getExternalScreens(): Promise<ExternalScreen[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveExternalScreens(items: ExternalScreen[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function addExternalScreen(input: { title: string; url: string; icon?: string }): Promise<ExternalScreen> {
  const items = await getExternalScreens();
  const screen: ExternalScreen = {
    id: `ext_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim() || "Untitled",
    url: normalizeUrl(input.url),
    icon: input.icon,
    createdAt: new Date().toISOString(),
  };
  items.unshift(screen);
  await saveExternalScreens(items);
  return screen;
}

export async function updateExternalScreen(id: string, patch: Partial<Pick<ExternalScreen, "title" | "url" | "icon">>): Promise<void> {
  const items = await getExternalScreens();
  const idx = items.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const next = { ...items[idx], ...patch };
  if (patch.url !== undefined) next.url = normalizeUrl(patch.url);
  if (patch.title !== undefined) next.title = patch.title.trim() || "Untitled";
  items[idx] = next;
  await saveExternalScreens(items);
}

export async function deleteExternalScreen(id: string): Promise<void> {
  const items = await getExternalScreens();
  await saveExternalScreens(items.filter((s) => s.id !== id));
}

export async function getExternalScreen(id: string): Promise<ExternalScreen | null> {
  const items = await getExternalScreens();
  return items.find((s) => s.id === id) ?? null;
}
