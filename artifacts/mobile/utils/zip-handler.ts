import * as FileSystem from "@/utils/fs-compat";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-image-picker";
import { Platform } from "react-native";
import type { LearningJsonOutput } from "./json-export";
import { isCancellationError } from "./safe-share";

async function loadJsZip() {
  const JSZip = (await import("jszip")).default;
  return JSZip;
}

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
      const localPath = `${FileSystem.cacheDirectory}${filename}`;
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
