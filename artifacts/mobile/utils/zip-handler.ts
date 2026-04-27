import * as FileSystem from "@/utils/fs-compat";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-image-picker";
import { Platform } from "react-native";
import type { LearningJsonOutput } from "./json-export";
import type { CoursePack } from "./storage";
import { isCancellationError } from "./safe-share";

async function loadJsZip() {
  const JSZip = (await import("jszip")).default;
  return JSZip;
}

const ZIP_ASSET_PREFIX = "@zip:";

export async function exportAsZip(
  data: LearningJsonOutput,
  imageUris: string[] = []
): Promise<void> {
  const JSZip = await loadJsZip();
  const zip = new JSZip();

  const jsonStr = JSON.stringify(data, null, 2);
  zip.file("data.json", jsonStr);

  const imgFolder = zip.folder("images");
  for (let i = 0; i < imageUris.length; i++) {
    try {
      const uri = imageUris[i];
      const ext = uri.split(".").pop()?.toLowerCase() ?? "png";
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      imgFolder?.file(`img${i + 1}.${ext}`, b64, { base64: true });
    } catch {
    }
  }

  const blob = await zip.generateAsync({ type: "base64" });
  const topic = data.topic.replace(/\s+/g, "_").toLowerCase();
  const filename = `${data.type}_${topic}_${Date.now()}.zip`;
  const path = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(path, blob, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    try {
      await Sharing.shareAsync(path, {
        mimeType: "application/zip",
        dialogTitle: `Export ZIP — ${data.topic}`,
      });
    } catch (e) {
      if (!isCancellationError(e)) throw e;
    }
  }
}

export interface ImportedZipResult {
  data: LearningJsonOutput | null;
  imageMap: Record<string, string>;
  error?: string;
}

export async function importFromZip(zipBase64: string): Promise<ImportedZipResult> {
  try {
    const JSZip = await loadJsZip();
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });

    const dataFile = zip.file("data.json");
    if (!dataFile) return { data: null, imageMap: {}, error: "data.json tidak ditemukan dalam ZIP" };

    const jsonStr = await dataFile.async("string");
    const data = JSON.parse(jsonStr) as LearningJsonOutput;

    const imageMap: Record<string, string> = {};
    const imageFiles = Object.keys(zip.files).filter((f) => f.startsWith("images/") && !zip.files[f].dir);

    for (const imgPath of imageFiles) {
      const b64 = await zip.files[imgPath].async("base64");
      const ext = imgPath.split(".").pop() ?? "png";
      const filename = `zip_import_${Date.now()}_${imgPath.split("/").pop()}`;
      const targetDir = `${FileSystem.documentDirectory}imports/`;
      try {
        await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      } catch {}
      const localPath = `${targetDir}${filename}`;
      await FileSystem.writeAsStringAsync(localPath, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const key = imgPath.split("/").pop() ?? imgPath;
      imageMap[key] = localPath;
    }

    return { data, imageMap };
  } catch (e: any) {
    return { data: null, imageMap: {}, error: e?.message ?? "Gagal membaca ZIP" };
  }
}

// ─── Course-pack ZIP export/import ──────────────────────────────────────────
//
// Layout inside the .zip:
//   data.json   — the CoursePack with `assetData[uri]` rewritten to
//                 "@zip:assets/<filename>" (instead of inline base64)
//   assets/     — binary asset files extracted from the original assetData map
//
// On import we reverse the rewrite: read each `assets/<filename>` back as
// base64 and put it into `assetData[originalUri]`, then hand the result to
// the existing `extractAssetsFromPack()` flow which already knows how to
// write everything to disk and remap URIs.

const sanitizeAssetName = (uri: string, index: number): string => {
  const noQuery = uri.replace(/\?.*$/, "");
  const last = noQuery.split("/").pop() || `asset_${index}`;
  // Strip anything that's not a-z0-9._- to keep the ZIP entry name portable.
  const safe = last.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  return `${index}_${safe || `asset_${index}`}`;
};

/**
 * Package a CoursePack as a .zip with binary assets in an `assets/` folder.
 * The pack's `assetData` map is rewritten to point at zip-relative paths so
 * the ZIP can be re-imported losslessly.
 *
 * Shares the resulting file on native platforms; triggers a browser download
 * on web. Throws on real errors (cancellation is swallowed).
 */
export async function exportCoursePackAsZip(
  pack: CoursePack,
  baseName: string
): Promise<void> {
  const JSZip = await loadJsZip();
  const zip = new JSZip();

  const assetData = pack.assetData ?? {};
  const rewrittenAssetData: Record<string, string> = {};
  const assetsFolder = zip.folder("assets");
  let index = 0;
  for (const [uri, b64] of Object.entries(assetData)) {
    if (!b64 || typeof b64 !== "string") continue;
    const name = sanitizeAssetName(uri, index);
    assetsFolder?.file(name, b64, { base64: true });
    rewrittenAssetData[uri] = `${ZIP_ASSET_PREFIX}assets/${name}`;
    index += 1;
  }

  const packForZip: CoursePack = {
    ...pack,
    assetData: Object.keys(rewrittenAssetData).length > 0 ? rewrittenAssetData : undefined,
  };

  zip.file("data.json", JSON.stringify(packForZip));

  const safeBase = (baseName || "bundle").replace(/[^A-Za-z0-9._-]+/g, "-").toLowerCase();
  const filename = `bundle-${safeBase}-${Date.now()}.zip`;

  if (Platform.OS === "web") {
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const b64 = await zip.generateAsync({ type: "base64" });
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    try {
      await Sharing.shareAsync(path, {
        mimeType: "application/zip",
        dialogTitle: `Bundle Kursus — ${baseName}`,
      });
    } catch (e) {
      if (!isCancellationError(e)) throw e;
    }
  }
}

/**
 * Read a CoursePack ZIP produced by `exportCoursePackAsZip()` from disk and
 * rebuild the inline `assetData` map (uri → base64). The returned pack is
 * compatible with `extractAssetsFromPack()` / `importCourse()`.
 */
export async function extractCoursePackFromZipUri(
  zipUri: string
): Promise<CoursePack> {
  const JSZip = await loadJsZip();
  let zip: any;

  if (Platform.OS === "web" && typeof fetch !== "undefined") {
    const res = await fetch(zipUri);
    const buf = await res.arrayBuffer();
    zip = await JSZip.loadAsync(buf);
  } else {
    const b64 = await FileSystem.readAsStringAsync(zipUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zip = await JSZip.loadAsync(b64, { base64: true });
  }

  const dataFile = zip.file("data.json");
  if (!dataFile) {
    throw new Error("data.json tidak ditemukan dalam ZIP");
  }

  const jsonStr = await dataFile.async("string");
  const pack = JSON.parse(jsonStr) as CoursePack;

  if (pack.assetData) {
    const restored: Record<string, string> = {};
    for (const [uri, ref] of Object.entries(pack.assetData)) {
      if (typeof ref !== "string") continue;
      if (ref.startsWith(ZIP_ASSET_PREFIX)) {
        const innerPath = ref.slice(ZIP_ASSET_PREFIX.length);
        const entry = zip.file(innerPath);
        if (!entry) continue; // missing asset — drop the reference
        restored[uri] = await entry.async("base64");
      } else {
        // already inline base64 (older zip layout) — keep as-is
        restored[uri] = ref;
      }
    }
    pack.assetData = restored;
  }

  return pack;
}

/** True when the picked document looks like a course-pack ZIP. */
export function looksLikeZipDocument(name: string | undefined, mime: string | undefined): boolean {
  if (mime && mime.toLowerCase().includes("zip")) return true;
  if (name && /\.zip$/i.test(name)) return true;
  return false;
}
