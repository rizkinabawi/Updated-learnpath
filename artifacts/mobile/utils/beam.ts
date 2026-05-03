import * as FileSystem from "@/utils/fs-compat";
import { shareAsync } from "expo-sharing";
import JSZip from "jszip";
import { 
  exportCourse, 
  getFlashcards, 
  type StandaloneCollection,
  importCourse
} from "./storage";
import { safeShareFile } from "./safe-share";
import { toast } from "@/components/Toast";

export interface BeamPack {
  type: "collection" | "course";
  data: any;
  version: number;
  format?: "zip";
}

/**
 * Share a course via native share sheet (WiFi/Bluetooth/Nearby Share/AirDrop)
 * Upgraded to use ZIP compression for large bundles.
 */
export const shareCourseBeam = async (pathId: string, name: string) => {
  try {
    toast.info("Menyiapkan kursus...");
    const pack = await exportCourse(pathId);
    
    const zip = new JSZip();
    const assets = pack.assetData || {};
    // Remove heavy assets from the main JSON to avoid String length limits
    const packNoAssets = { ...pack };
    delete packNoAssets.assetData;

    const beamPack: BeamPack = {
      type: "course",
      data: packNoAssets,
      version: 2,
      format: "zip"
    };

    // 1. Add manifest
    zip.file("manifest.json", JSON.stringify(beamPack));

    // 2. Add assets
    const assetFolder = zip.folder("assets");
    if (assetFolder) {
      for (const [uri, b64] of Object.entries(assets)) {
        const ext = uri.split(".").pop()?.split("?")[0] ?? "dat";
        const fileName = `${Math.random().toString(36).substring(7)}.${ext}`;
        // Store the mapping so importer can reconstruct URIs
        // We can just use the original URI as the filename (encoded)
        const safeName = encodeURIComponent(uri);
        assetFolder.file(safeName, b64, { base64: true });
      }
    }

    const content = await zip.generateAsync({ type: "uint8array" });
    
    const fileName = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.lpack`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsBytesAsync(filePath, content);
    
    await safeShareFile(filePath, { 
      mimeType: "application/zip", 
      dialogTitle: `Kirim Kursus: ${name}`,
      UTI: "com.pkware.zip-archive" 
    });
  } catch (error) {
    console.error("[Beam] Share course failed:", error);
    toast.error("Gagal menyiapkan kursus.");
  }
};

/**
 * Share a standalone collection via native share sheet
 * Upgraded to use ZIP compression.
 */
export const shareCollectionBeam = async (col: StandaloneCollection, name: string) => {
  try {
    toast.info("Menyiapkan koleksi...");
    // Security check: only creator can share
    if (col.userId && col.userId !== "local") {
        toast.error("Koleksi ini dilindungi dan tidak dapat dibagikan.");
        return;
    }

    const cards = await getFlashcards(col.id);
    const zip = new JSZip();

    const beamPack: BeamPack = {
      type: "collection",
      data: {
        collection: col,
        flashcards: cards
      },
      version: 2,
      format: "zip"
    };

    // Note: standalone collections currently don't embed assets in 'data'
    // but the cards might point to local URIs. We should extract them.
    const assetData: Record<string, string> = {};
    const localUris = new Set<string>();
    const collect = (uri?: string) => {
      if (uri && (uri.startsWith("file://") || (FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)))) {
        localUris.add(uri);
      }
    };

    cards.forEach(c => {
      collect(c.image);
      collect(c.audio);
      c.images?.forEach(collect);
      c.imagesBack?.forEach(collect);
      c.audios?.forEach(collect);
      c.audiosBack?.forEach(collect);
    });

    for (const uri of localUris) {
      try {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
        assetData[uri] = b64;
      } catch (e) {
        console.warn("[Beam] Export skipping asset:", uri, e);
      }
    }

    // 1. Add manifest (without assetData to be safe, though not currently used here)
    zip.file("manifest.json", JSON.stringify(beamPack));

    // 2. Add assets
    const assetFolder = zip.folder("assets");
    if (assetFolder) {
      for (const [uri, b64] of Object.entries(assetData)) {
        const safeName = encodeURIComponent(uri);
        assetFolder.file(safeName, b64, { base64: true });
      }
    }

    const content = await zip.generateAsync({ type: "uint8array" });

    const fileName = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.lcoll`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsBytesAsync(filePath, content);
    
    await safeShareFile(filePath, { 
      mimeType: "application/zip", 
      dialogTitle: `Kirim Koleksi: ${name}`,
      UTI: "com.pkware.zip-archive" 
    });
  } catch (error) {
    console.error("[Beam] Share collection failed:", error);
    toast.error("Gagal menyiapkan koleksi.");
  }
};
