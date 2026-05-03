import JSZip from "jszip";
import * as FileSystem from "./fs-compat";
import { type BeamPack } from "./beam";

export interface IngestedBundle {
  type: "course" | "collection";
  data: any;
  version: number;
}

/**
 * Universal bundle ingester. 
 * Supports both legacy JSON (.lpack, .lcoll) and new ZIP-based bundles.
 */
export const ingestBundleFile = async (uri: string): Promise<IngestedBundle> => {
  try {
    // 1. Read as bytes to check magic numbers
    const bytes = await FileSystem.readAsBytesAsync(uri);
    
    // Check for ZIP magic number 'PK' (0x50 0x4B)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      const zip = await JSZip.loadAsync(bytes);
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) throw new Error("Format ZIP tidak valid: manifest.json tidak ditemukan.");
      
      const manifestStr = await manifestFile.async("string");
      const pack = JSON.parse(manifestStr) as BeamPack;
      
      // If it has assets in the zip, reconstruct the assetData map
      const assetFolder = zip.folder("assets");
      if (assetFolder) {
        const assetData: Record<string, string> = {};
        const assetFiles = assetFolder.filter((path, file) => !file.dir);
        
        for (const file of assetFiles) {
          // The filename is the URL-encoded original URI
          const originalUri = decodeURIComponent(file.name.replace("assets/", ""));
          const b64 = await file.async("base64");
          assetData[originalUri] = b64;
        }
        
        // Re-inject assetData into the course/collection pack
        if (pack.type === "course") {
          pack.data.assetData = assetData;
        } else if (pack.type === "collection") {
          // Collections currently don't use assetData in 'data' but we could add it
          // Or handle assets separately. For now, let's keep it consistent.
          pack.data.assetData = assetData;
        }
      }
      
      return {
        type: pack.type,
        data: pack.data,
        version: pack.version
      };
    } else {
      // 2. Fallback to legacy JSON string
      const text = await FileSystem.readAsStringAsync(uri);
      const pack = JSON.parse(text) as BeamPack;
      return {
        type: pack.type,
        data: pack.data,
        version: pack.version
      };
    }
  } catch (error) {
    console.error("[Ingest] Bundle ingestion failed:", error);
    throw error;
  }
};
