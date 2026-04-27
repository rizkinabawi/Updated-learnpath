/**
 * fs-compat.ts
 * Thin compatibility layer over expo-file-system v19 (SDK 54).
 * Provides the same surface area as the old v1 API so that all
 * existing callers can keep using familiar names.
 *
 * On web, expo-file-system is not supported, so we provide no-ops.
 */

import { Platform } from "react-native";

export const EncodingType = {
  UTF8: "utf8" as const,
  Base64: "base64" as const,
};

// Re-export as a standard object for files using it as FileSystem.EncodingType
export const FileSystem = {
  EncodingType,
};

export interface FileInfo {
  exists: boolean;
  uri: string;
  size?: number;
  isDirectory?: boolean;
  modificationTime?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web helpers
// ─────────────────────────────────────────────────────────────────────────────
// On web, file URIs from DocumentPicker / ImagePicker are typically blob URLs
// (`blob:https://...`) or data URLs (`data:...`). We can fetch them directly.
// Plain URLs (http/https) also work. For unsupported schemes (file://, content://)
// we throw a clear error.

const isWebFetchable = (uri: string): boolean => {
  if (!uri) return false;
  return (
    uri.startsWith("blob:") ||
    uri.startsWith("data:") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("/")
  );
};

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (b64: string): ArrayBuffer => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

// Web stubs (now functional for in-memory file URIs)
const webStub = {
  cacheDirectory: null as string | null,
  documentDirectory: null as string | null,

  async getInfoAsync(uri: string): Promise<FileInfo> {
    if (!isWebFetchable(uri)) return { exists: false, uri };
    try {
      const res = await fetch(uri);
      if (!res.ok) return { exists: false, uri };
      const blob = await res.blob();
      return { exists: true, uri, size: blob.size };
    } catch {
      return { exists: false, uri };
    }
  },

  async readAsStringAsync(
    uri: string,
    options?: { encoding?: "utf8" | "base64" },
  ): Promise<string> {
    if (!isWebFetchable(uri)) {
      throw new Error(
        `[fs-compat:web] Cannot read URI on web: "${uri.slice(0, 60)}". ` +
          `Only blob:, data:, http(s):, and absolute paths are supported.`,
      );
    }
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`[fs-compat:web] Fetch failed: ${res.status}`);
    if (options?.encoding === "base64") {
      const buf = await res.arrayBuffer();
      return arrayBufferToBase64(buf);
    }
    return await res.text();
  },

  async writeAsStringAsync(
    _uri: string,
    _contents: string,
    _options?: { encoding?: "utf8" | "base64" },
  ): Promise<void> {
    // Writing arbitrary files isn't supported on web — caller should persist
    // to AsyncStorage / IndexedDB or trigger a download instead.
    console.warn("[fs-compat:web] writeAsStringAsync is a no-op on web");
  },

  async makeDirectoryAsync(
    _uri: string,
    _options?: { intermediates?: boolean },
  ): Promise<void> {},

  async deleteAsync(_uri: string): Promise<void> {},

  async copyAsync(opts: { from: string; to: string }): Promise<void> {
    // On web we can't truly copy to a "to" path. Best-effort: return silently —
    // callers that depend on `to` being a usable URI should check the source URI.
    console.warn("[fs-compat:web] copyAsync no-op:", opts.from, "→", opts.to);
  },

  async readDirectoryAsync(_uri: string): Promise<string[]> {
    return [];
  },

  async downloadAsync(_url: string, _fileUri: string): Promise<{ uri: string }> {
    // Just return the original URL — it's already accessible from the browser
    return { uri: _url };
  },

  async readAsBytesAsync(uri: string): Promise<Uint8Array> {
    if (!isWebFetchable(uri)) {
      throw new Error(
        `[fs-compat:web] Cannot read URI on web: "${uri.slice(0, 60)}". ` +
          `Only blob:, data:, http(s):, and absolute paths are supported.`,
      );
    }
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`[fs-compat:web] Fetch failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  },

  async writeAsBytesAsync(_uri: string, _bytes: Uint8Array): Promise<void> {
    console.warn("[fs-compat:web] writeAsBytesAsync is a no-op on web");
  },
};

// Lazy-load native implementation only on non-web platforms
let _native: typeof webStub | null = null;

async function getNative(): Promise<typeof webStub> {
  if (Platform.OS === "web") return webStub;
  if (_native) return _native;

  const FileSystem = await import("expo-file-system/legacy");

  _native = {
    cacheDirectory: (FileSystem as any).Paths?.cache?.uri || FileSystem.cacheDirectory || null,
    documentDirectory: (FileSystem as any).Paths?.document?.uri || FileSystem.documentDirectory || null,

    async getInfoAsync(fileUri: string): Promise<FileInfo> {
      try {
        const info = await FileSystem.getInfoAsync(fileUri);
        return {
          exists: info.exists,
          uri: info.uri,
          size: (info as any).size,
          isDirectory: (info as any).isDirectory,
        };
      } catch {
        return { exists: false, uri: fileUri };
      }
    },

    async readAsStringAsync(fileUri: string, options?: { encoding?: "utf8" | "base64" }): Promise<string> {
      return await FileSystem.readAsStringAsync(fileUri, {
        encoding: options?.encoding === "base64" ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
      });
    },

    async writeAsStringAsync(fileUri: string, contents: string, options?: { encoding?: "utf8" | "base64" }): Promise<void> {
      await FileSystem.writeAsStringAsync(fileUri, contents, {
        encoding: options?.encoding === "base64" ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
      });
    },

    async makeDirectoryAsync(fileUri: string, options?: { intermediates?: boolean }): Promise<void> {
      await FileSystem.makeDirectoryAsync(fileUri, options);
    },

    async deleteAsync(fileUri: string): Promise<void> {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    },

    async copyAsync(options: { from: string; to: string }): Promise<void> {
      await FileSystem.copyAsync({ from: options.from, to: options.to });
    },

    async readDirectoryAsync(fileUri: string): Promise<string[]> {
      return await FileSystem.readDirectoryAsync(fileUri);
    },

    async downloadAsync(url: string, fileUri: string): Promise<{ uri: string }> {
      const res = await FileSystem.downloadAsync(url, fileUri);
      return { uri: res.uri };
    },

    async readAsBytesAsync(fileUri: string): Promise<Uint8Array> {
      if ((FileSystem as any).readAsBytesAsync) {
        return await (FileSystem as any).readAsBytesAsync(fileUri);
      }
      const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const base64js = await import("base64-js");
      return base64js.toByteArray(b64);
    },

    async writeAsBytesAsync(fileUri: string, bytes: Uint8Array): Promise<void> {
      if ((FileSystem as any).writeAsBytesAsync) {
        await (FileSystem as any).writeAsBytesAsync(fileUri, bytes);
        return;
      }
      const { fromByteArray } = await import("base64-js");
      const b64 = fromByteArray(bytes);
      await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
    },
  };

  return _native;
}

// Sync-accessible constants (null on web)
export let cacheDirectory: string | null = null;
export let documentDirectory: string | null = null;

if (Platform.OS !== "web") {
  try {
    const FS = require("expo-file-system/legacy");
    cacheDirectory = FS.cacheDirectory || FS.Paths?.cache?.uri || null;
    documentDirectory = FS.documentDirectory || FS.Paths?.document?.uri || null;
  } catch (e) {
    console.error("[fs-compat] Failed to init sync paths:", e);
  }
}

export async function getInfoAsync(
  fileUri: string,
  _options?: { size?: boolean; md5?: boolean }
): Promise<FileInfo> {
  const n = await getNative();
  return n.getInfoAsync(fileUri);
}

export async function readAsStringAsync(
  fileUri: string,
  options?: { encoding?: "utf8" | "base64" }
): Promise<string> {
  const n = await getNative();
  return n.readAsStringAsync(fileUri, options);
}

export async function writeAsStringAsync(
  fileUri: string,
  contents: string,
  options?: { encoding?: "utf8" | "base64" }
): Promise<void> {
  const n = await getNative();
  return n.writeAsStringAsync(fileUri, contents, options);
}

export async function makeDirectoryAsync(
  fileUri: string,
  options?: { intermediates?: boolean }
): Promise<void> {
  const n = await getNative();
  return n.makeDirectoryAsync(fileUri, options);
}

export async function deleteAsync(
  fileUri: string,
  _options?: { idempotent?: boolean }
): Promise<void> {
  const n = await getNative();
  return n.deleteAsync(fileUri);
}

export async function copyAsync(options: {
  from: string;
  to: string;
}): Promise<void> {
  const n = await getNative();
  return n.copyAsync(options);
}

export async function readDirectoryAsync(fileUri: string): Promise<string[]> {
  const n = await getNative();
  return n.readDirectoryAsync(fileUri);
}

export async function downloadAsync(
  url: string,
  fileUri: string
): Promise<{ uri: string }> {
  const n = await getNative();
  return n.downloadAsync(url, fileUri);
}

export async function readAsBytesAsync(fileUri: string): Promise<Uint8Array> {
  const n = await getNative();
  return n.readAsBytesAsync(fileUri);
}

export async function writeAsBytesAsync(
  fileUri: string,
  bytes: Uint8Array
): Promise<void> {
  const n = await getNative();
  return n.writeAsBytesAsync(fileUri, bytes);
}

/**
 * Android-only: Save a temporary file to a user-picked public directory.
 * On iOS, falls back to sharing (which allows "Save to Files").
 */
export async function downloadToFile(
  tempUri: string,
  filename: string,
  mimeType: string = "application/json"
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  
  if (Platform.OS === "android") {
    try {
      const { StorageAccessFramework } = await import("expo-file-system/legacy");
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      
      if (permissions.granted) {
        const content = await readAsStringAsync(tempUri, { encoding: "base64" });
        const createdUri = await StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          filename,
          mimeType
        );
        await writeAsStringAsync(createdUri, content, { encoding: "base64" });
        return true;
      }
      return false;
    } catch (e) {
      console.warn("[fs-compat] downloadToFile failed:", e);
      return false;
    }
  } else {
    // iOS: Open the share sheet; users can select "Save to Files"
    const Sharing = await import("expo-sharing");
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(tempUri);
    return true;
  }
}
