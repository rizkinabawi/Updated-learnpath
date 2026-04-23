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

export interface FileInfo {
  exists: boolean;
  uri: string;
  size?: number;
  isDirectory?: boolean;
  modificationTime?: number;
}

// Web stubs
const webStub = {
  cacheDirectory: null as string | null,
  documentDirectory: null as string | null,
  async getInfoAsync(_uri: string): Promise<FileInfo> {
    return { exists: false, uri: _uri };
  },
  async readAsStringAsync(_uri: string): Promise<string> {
    return "";
  },
  async writeAsStringAsync(_uri: string, _contents: string): Promise<void> {},
  async makeDirectoryAsync(_uri: string): Promise<void> {},
  async deleteAsync(_uri: string): Promise<void> {},
  async copyAsync(_opts: { from: string; to: string }): Promise<void> {},
  async readDirectoryAsync(_uri: string): Promise<string[]> {
    return [];
  },
};

// Lazy-load native implementation only on non-web platforms
let _native: typeof webStub | null = null;

async function getNative(): Promise<typeof webStub> {
  if (Platform.OS === "web") return webStub;
  if (_native) return _native;

  const { Paths, File, Directory } = await import("expo-file-system");

  _native = {
    cacheDirectory: Paths.cache.uri,
    documentDirectory: Paths.document.uri,

    async getInfoAsync(fileUri: string): Promise<FileInfo> {
      const isDir = fileUri.endsWith("/");
      try {
        if (isDir) {
          const d = new Directory(fileUri);
          if (!d.exists) return { exists: false, uri: fileUri, isDirectory: true };
          return { exists: true, uri: fileUri, isDirectory: true };
        }
        const f = new File(fileUri);
        if (!f.exists) return { exists: false, uri: fileUri };
        const info = f.info();
        return { exists: true, uri: fileUri, size: info.size ?? undefined };
      } catch {
        try {
          const d = new Directory(fileUri);
          if (d.exists) return { exists: true, uri: fileUri, isDirectory: true };
        } catch {}
        return { exists: false, uri: fileUri };
      }
    },

    async readAsStringAsync(fileUri: string, options?: { encoding?: "utf8" | "base64" }): Promise<string> {
      const f = new File(fileUri);
      if (options?.encoding === "base64") return await f.base64();
      return await f.text();
    },

    async writeAsStringAsync(fileUri: string, contents: string): Promise<void> {
      const f = new File(fileUri);
      f.write(contents);
    },

    async makeDirectoryAsync(fileUri: string, options?: { intermediates?: boolean }): Promise<void> {
      const d = new Directory(fileUri);
      if (d.exists) return;
      d.create({ intermediates: options?.intermediates ?? false });
    },

    async deleteAsync(fileUri: string): Promise<void> {
      try {
        const f = new File(fileUri);
        if (f.exists) f.delete();
      } catch {
        try {
          const d = new Directory(fileUri);
          if (d.exists) d.delete();
        } catch {}
      }
    },

    async copyAsync(options: { from: string; to: string }): Promise<void> {
      const src = new File(options.from);
      src.copy(new File(options.to));
    },

    async readDirectoryAsync(fileUri: string): Promise<string[]> {
      const d = new Directory(fileUri);
      return d.list().map((entry) => {
        const uri = entry.uri.replace(/\/$/, "");
        return uri.split("/").pop() ?? uri;
      });
    },
  };

  return _native;
}

// Sync-accessible constants (null on web)
export let cacheDirectory: string | null = null;
export let documentDirectory: string | null = null;

if (Platform.OS !== "web") {
  try {
    const { Paths } = require("expo-file-system");
    cacheDirectory = Paths.cache.uri;
    documentDirectory = Paths.document.uri;
  } catch {}
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
  _options?: { encoding?: "utf8" | "base64" }
): Promise<void> {
  const n = await getNative();
  return n.writeAsStringAsync(fileUri, contents);
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
