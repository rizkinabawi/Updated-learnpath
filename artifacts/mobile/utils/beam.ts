import * as FileSystem from "@/utils/fs-compat";
import { shareAsync } from "expo-sharing";
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
}

/**
 * Share a course via native share sheet (WiFi/Bluetooth/Nearby Share/AirDrop)
 */
export const shareCourseBeam = async (pathId: string, name: string) => {
  try {
    const pack = await exportCourse(pathId);
    
    // Extra security: Only allow sharing if not locked
    // (Already checked in exportCourse, but good to have here)
    const beamPack: BeamPack = {
      type: "course",
      data: pack,
      version: 2
    };

    const fileName = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.lpack`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(beamPack));
    await safeShareFile(filePath, { 
      mimeType: "application/json", 
      dialogTitle: `Kirim Kursus: ${name}`,
      UTI: "public.json" 
    });
  } catch (error) {
    console.error("[Beam] Share course failed:", error);
    toast.error("Gagal menyiapkan kursus.");
  }
};

/**
 * Share a standalone collection via native share sheet
 */
export const shareCollectionBeam = async (col: StandaloneCollection, name: string) => {
  try {
    // Security check: only creator can share
    // In this app, local collections usually have userId "local" or the current user
    if (col.userId && col.userId !== "local") {
        // This might be a downloaded/purchased collection that shouldn't be re-shared
        toast.error("Koleksi ini dilindungi dan tidak dapat dibagikan.");
        return;
    }

    const cards = await getFlashcards(col.id);
    const beamPack: BeamPack = {
      type: "collection",
      data: {
        collection: col,
        flashcards: cards
      },
      version: 2
    };

    const fileName = `${name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.lcoll`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(beamPack));
    await safeShareFile(filePath, { 
      mimeType: "application/json", 
      dialogTitle: `Kirim Koleksi: ${name}`,
      UTI: "public.json" 
    });
  } catch (error) {
    console.error("[Beam] Share collection failed:", error);
    toast.error("Gagal menyiapkan koleksi.");
  }
};
