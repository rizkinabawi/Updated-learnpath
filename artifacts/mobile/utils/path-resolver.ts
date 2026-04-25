import { documentDirectory } from "./fs-compat";

const IOS_CONTAINER_RE = /\/Containers\/Data\/Application\/[^/]+\/Documents\/(.+)$/;
const ANDROID_FILES_RE = /\/data\/(?:user\/\d+|data)\/[^/]+\/files\/(.+)$/;

export function resolveAssetUri(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  if (typeof uri !== "string") return undefined;

  if (/^(https?|data|blob|content|asset):/i.test(uri)) return uri;

  if (!documentDirectory) return uri;

  if (!uri.startsWith("file://") && !uri.startsWith("/")) {
    return documentDirectory + uri.replace(/^\.?\/+/, "");
  }

  if (uri.startsWith(documentDirectory)) return uri;

  const ios = uri.match(IOS_CONTAINER_RE);
  if (ios && ios[1]) return documentDirectory + ios[1];

  const android = uri.match(ANDROID_FILES_RE);
  if (android && android[1]) return documentDirectory + android[1];

  return uri;
}

export function resolveAssetUris(
  uris: (string | null | undefined)[] | null | undefined,
): string[] {
  if (!uris || !Array.isArray(uris)) return [];
  const out: string[] = [];
  for (const u of uris) {
    const r = resolveAssetUri(u);
    if (r) out.push(r);
  }
  return out;
}
