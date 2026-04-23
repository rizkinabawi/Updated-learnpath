/**
 * bundle-assets.ts
 * Handles embedding ALL local files as base64 in a CoursePack (version 2),
 * and extracting them back to the device filesystem on import.
 *
 * Embedded asset map (assetData):
 *   key   = original device URI of the file
 *   value = base64-encoded file content
 *
 * On extraction, every key is re-written to imported_assets/ and all
 * matching URI references inside the pack are updated to the new local paths.
 */

import * as FileSystem from "@/utils/fs-compat";
import { Platform } from "react-native";
import type { CoursePack, StudyMaterial, Flashcard, Quiz } from "./storage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** True only for URIs that point to a real file on this device. */
const isLocalUri = (uri?: string): boolean => {
  if (!uri) return false;
  return (
    uri.startsWith("file://") ||
    uri.startsWith("/var/")  ||  // iOS absolute path (sometimes no scheme)
    uri.startsWith("/data/") ||  // Android absolute path
    uri.startsWith(FileSystem.documentDirectory ?? "__NONE__") ||
    uri.startsWith(FileSystem.cacheDirectory    ?? "__NONE__")
  );
};

/** Read a local file as base64.  Returns null if missing or unreadable. */
const readBase64Safe = async (uri: string): Promise<string | null> => {
  if (Platform.OS === "web") return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // Discard obviously empty reads
    return b64 && b64.length > 0 ? b64 : null;
  } catch {
    return null;
  }
};

/**
 * Write a base64 string to imported_assets/.
 * Uses a unique filename to prevent collisions across multiple bundles.
 */
const writeBase64Asset = async (
  base64: string,
  originalUri: string,
  index: number
): Promise<string> => {
  const base = FileSystem.documentDirectory ?? "";
  const dir  = base + "imported_assets/";
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  // Build a unique filename: index_originalBasename
  const parts    = originalUri.replace(/\?.*$/, "").split("/");
  const basename = parts[parts.length - 1] || `asset_${index}`;
  const filename = `${index}_${basename}`;

  const dest = dir + filename;
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Verify the file was actually written
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists) throw new Error(`Write failed: ${dest}`);

  return dest;
};

// ─── Collect all local URIs that need embedding ──────────────────────────────

function collectLocalUris(pack: CoursePack): string[] {
  const uris: string[] = [];

  for (const mat of pack.materials ?? []) {
    // Images: the study-material screen stores in filePath;
    //         older/import-roadmap code may use imageLocalPath.
    if (mat.type === "image") {
      const uri = mat.imageLocalPath || mat.filePath;
      if (uri && isLocalUri(uri)) uris.push(uri);
    }
    // File attachments
    if (mat.type === "file" && mat.filePath && isLocalUri(mat.filePath)) {
      uris.push(mat.filePath);
    }
  }

  for (const fc of pack.flashcards ?? []) {
    if (fc.image && isLocalUri(fc.image)) uris.push(fc.image);
  }

  for (const qz of pack.quizzes ?? []) {
    if (qz.image && isLocalUri(qz.image)) uris.push(qz.image);
  }

  return [...new Set(uris)]; // deduplicate
}

// ─── Embed: local files → base64 inside pack ─────────────────────────────────

export const embedAssetsInPack = async (pack: CoursePack): Promise<CoursePack> => {
  if (Platform.OS === "web") return { ...pack, version: 2 };

  const assetData: Record<string, string> = { ...(pack.assetData ?? {}) };
  const uris = collectLocalUris(pack);

  await Promise.all(
    uris.map(async (uri) => {
      if (assetData[uri]) return; // already embedded from a previous pass
      const b64 = await readBase64Safe(uri);
      if (b64) assetData[uri] = b64;
      // If b64 is null the file is missing; silently skip (don't embed broken refs)
    })
  );

  return { ...pack, version: 2, assetData };
};

// ─── Extract: base64 inside pack → local files ───────────────────────────────

export const extractAssetsFromPack = async (pack: CoursePack): Promise<CoursePack> => {
  if (
    Platform.OS === "web" ||
    !pack.assetData ||
    Object.keys(pack.assetData).length === 0
  ) {
    return pack;
  }

  // Write every embedded asset to the device and build oldUri → newUri map.
  // Use sequential index (not counter++) to avoid race conditions in Promise.all.
  const entries = Object.entries(pack.assetData);
  const uriMap: Record<string, string> = {};

  await Promise.all(
    entries.map(async ([originalUri, base64], index) => {
      if (!base64 || base64.length === 0) return; // skip empty/corrupt entries
      try {
        const newUri = await writeBase64Asset(base64, originalUri, index);
        uriMap[originalUri] = newUri;
      } catch {
        // Asset could not be written — leave URI unmapped; viewer will handle missing file
      }
    })
  );

  // Remap all URI references in study materials
  const remappedMaterials: StudyMaterial[] = (pack.materials ?? []).map((mat) => {
    const updated = { ...mat };
    // imageLocalPath (legacy field)
    if (mat.imageLocalPath && uriMap[mat.imageLocalPath]) {
      updated.imageLocalPath = uriMap[mat.imageLocalPath];
    }
    // filePath (used for both images and file attachments)
    if (mat.filePath && uriMap[mat.filePath]) {
      updated.filePath = uriMap[mat.filePath];
    }
    return updated;
  });

  // Remap flashcard images
  const remappedFlashcards: Flashcard[] = (pack.flashcards ?? []).map((fc) => {
    if (fc.image && uriMap[fc.image]) return { ...fc, image: uriMap[fc.image] };
    return fc;
  });

  // Remap quiz images
  const remappedQuizzes: Quiz[] = (pack.quizzes ?? []).map((qz) => {
    if (qz.image && uriMap[qz.image]) return { ...qz, image: uriMap[qz.image] };
    return qz;
  });

  return {
    ...pack,
    materials:  remappedMaterials,
    flashcards: remappedFlashcards,
    quizzes:    remappedQuizzes,
    assetData:  undefined, // free memory — all assets are now on disk
  };
};

// ─── Count assets for UI summary display ─────────────────────────────────────

export const countEmbeddedAssets = (
  pack: CoursePack
): { images: number; files: number; links: number } => {
  let images = 0, files = 0, links = 0;

  for (const mat of pack.materials ?? []) {
    if (mat.type === "image")  images++;
    else if (mat.type === "file") files++;
    else if (mat.type === "youtube" || mat.type === "googledoc") links++;
  }

  for (const fc of pack.flashcards ?? []) { if (fc.image) images++; }
  for (const qz of pack.quizzes ?? []) { if (qz.image) images++; }

  return { images, files, links };
};
