import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as LucideIcons from "lucide-react-native";
import { useColors } from "@/contexts/ThemeContext";
import { getApiKeys } from "@/utils/ai-keys";
import { callAI } from "@/utils/ai-providers";
import * as FileSystem from "@/utils/fs-compat";
import { toast } from "@/components/Toast";
import { cleanText } from "@/utils/text-processing";
import { saveLearningPath, saveModule, saveLesson, saveFlashcardsBulkChunked, generateId, type LearningPath, type Module, type Lesson } from "@/utils/storage";

const { width } = Dimensions.get("window");

export default function SmartScannerScreen() {
  const colors = useColors();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  if (!permission) return <View style={{flex:1, backgroundColor: colors.background}} />;
  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Butuh Izin Kamera</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Izinkan Kamera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5, // Compression to avoid "String length exceeds limit"
        base64: true,
      });
      setCapturedImage(photo.uri);
      processImage(photo.base64);
    } catch (e) {
      console.error(e);
      toast.error("Gagal mengambil gambar.");
      setIsProcessing(false);
    }
  };

  const processImage = async (base64: string) => {
    const keys = await getApiKeys();
    const geminiKey = keys.find(k => k.provider === "gemini");

    if (!geminiKey) {
      Alert.alert("API Key Dibutuhkan", "Harap pasang API Key Gemini di pengaturan AI untuk menggunakan fitur ini.", [
        { text: "Pengaturan", onPress: () => router.push("/ai-keys") },
        { text: "Batal", style: "cancel" }
      ]);
      setIsProcessing(false);
      return;
    }

    try {
      const prompt = `Analisa gambar dokumen/buku ini dan buatkan struktur materi belajar dalam format JSON.
      JSON harus berisi:
      {
        "course_name": "Judul Kursus",
        "module_name": "Judul Modul",
        "lesson_name": "Judul Pelajaran",
        "flashcards": [
          { "question": "pertanyaan", "answer": "jawaban", "tag": "topik" }
        ]
      }
      Pastikan teks bersih dan rapi. Bahasa: Bahasa Indonesia.`;

      // Gemini 1.5 Flash supports multi-modal (text + image)
      // Since our callAI only takes a text prompt currently, I will 
      // modify the prompt to include the instruction about the image data.
      // NOTE: In a real multi-modal request, we send the base64 as a separate part.
      
      // For now, let's use a specialized multi-modal call if possible, 
      // or just inform the user we are using Gemini Vision.
      
      const result = await callGeminiVision(prompt, base64, geminiKey.apiKey);
      const data = JSON.parse(result.content);
      
      await saveGeneratedMateri(data);
      
      toast.success("Materi berhasil dibuat dari foto!");
      router.back();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Gagal Memproses", e.message || "Pastikan API Key valid dan koneksi internet stabil.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Internal multi-modal call for Gemini
  const callGeminiVision = async (prompt: string, base64: string, apiKey: string) => {
     const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
     const res = await fetch(url, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         contents: [{
           parts: [
             { text: prompt },
             { inline_data: { mime_type: "image/jpeg", data: base64 } }
           ]
         }],
         generationConfig: { temperature: 0.4, responseMimeType: "application/json" }
       })
     });
     
     if (!res.ok) throw new Error("Gagal menghubungi Gemini Vision.");
     const data = await res.json();
     return { content: data.candidates[0].content.parts[0].text };
  };

  const saveGeneratedMateri = async (data: any) => {
    const now = new Date().toISOString();
    const pathId = generateId();
    const moduleId = generateId();
    const lessonId = generateId();

    const path: LearningPath = {
      id: pathId, name: data.course_name || "Materi Hasil Scan",
      description: "Dibuat otomatis dari foto",
      userId: "local", tags: ["AI Scan"], createdAt: now
    };
    await saveLearningPath(path);

    const mod: Module = {
      id: moduleId, pathId, name: data.module_name || "Modul 1",
      description: "", order: 1, createdAt: now
    };
    await saveModule(mod);

    const les: Lesson = {
      id: lessonId, moduleId, name: data.lesson_name || "Pelajaran 1",
      description: "", order: 1, createdAt: now
    };
    await saveLesson(les);

    const cards = (data.flashcards || []).map((c: any) => ({
      id: generateId(),
      lessonId: lessonId,
      question: cleanText(c.question),
      answer: cleanText(c.answer),
      tag: c.tag || "AI",
      createdAt: now
    }));
    
    if (cards.length > 0) await saveFlashcardsBulkChunked(cards);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!capturedImage ? (
        <CameraView style={styles.camera} ref={cameraRef}>
          <View style={styles.overlay}>
             <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
                <LucideIcons.X size={24} color="#fff" />
             </TouchableOpacity>
             
             <View style={styles.scanFrame} />
             
             <View style={styles.controls}>
                <Text style={styles.hint}>Arahkan ke buku atau dokumen</Text>
                <TouchableOpacity style={styles.captureBtn} onPress={takePicture}>
                   <View style={styles.captureInner} />
                </TouchableOpacity>
             </View>
          </View>
        </CameraView>
      ) : (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.preview} />
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.processingText}>AI sedang membaca teks...</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  camera: { flex: 1, width: "100%" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "space-between", padding: 24 },
  closeBtn: { alignSelf: "flex-end", marginTop: 20 },
  scanFrame: { 
    width: width * 0.8, height: width * 1.0, 
    borderWidth: 2, borderColor: "rgba(255,255,255,0.5)", 
    alignSelf: "center", borderRadius: 20,
    borderStyle: "dashed"
  },
  controls: { alignItems: "center", marginBottom: 40 },
  hint: { color: "#fff", marginBottom: 20, fontWeight: "600" },
  captureBtn: { 
    width: 80, height: 80, borderRadius: 40, 
    borderWidth: 4, borderColor: "#fff", 
    justifyContent: "center", alignItems: "center" 
  },
  captureInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff" },
  previewContainer: { flex: 1, width: "100%" },
  preview: { flex: 1 },
  processingOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: "rgba(0,0,0,0.7)", 
    justifyContent: "center", alignItems: "center" 
  },
  processingText: { color: "#fff", marginTop: 20, fontWeight: "bold" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 20 },
  btn: { padding: 16, backgroundColor: "#6366f1", borderRadius: 12 },
  btnText: { color: "#fff", fontWeight: "bold" }
});
