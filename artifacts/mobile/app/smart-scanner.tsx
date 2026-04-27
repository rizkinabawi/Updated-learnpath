/**
 * Smart Scanner — scan → edit → save
 * Engine: AI (Gemini Vision) or Offline OCR (OCR.space free API)
 */
import React, { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, Image, Dimensions, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { X, Zap, Cpu, Check, Edit3, RefreshCw, ChevronLeft, Camera, AlertCircle } from "lucide-react-native";
import { useColors } from "@/contexts/ThemeContext";
import { getApiKeys } from "@/utils/ai-keys";
import { callGeminiVision } from "@/utils/ai-providers";
import { toast } from "@/components/Toast";
import { cleanText } from "@/utils/text-processing";
import {
  saveLearningPath, saveModule, saveLesson,
  saveFlashcardsBulkChunked, saveNote, generateId,
  type LearningPath, type Module, type Lesson,
} from "@/utils/storage";

const { width } = Dimensions.get("window");

type Engine = "ai" | "offline";
type Step = "camera" | "preview" | "edit";

// ─── OCR.space free API ──────────────────────────────────────────────────────
async function runOfflineOCR(base64: string): Promise<string> {
  // OCR.space free tier — no API key needed for basic usage
  const formData = new FormData();
  formData.append("base64Image", `data:image/jpeg;base64,${base64}`);
  formData.append("language", "ind"); // Indonesian
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");
  formData.append("OCREngine", "2"); // Engine 2 = better accuracy

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: "helloworld" }, // free public demo key
    body: formData,
  });

  if (!res.ok) throw new Error("Server OCR tidak merespons. Periksa koneksi internet.");

  const json = await res.json() as any;
  if (json.IsErroredOnProcessing) {
    throw new Error(json.ErrorMessage?.[0] || "OCR gagal memproses gambar.");
  }

  const text: string = json.ParsedResults?.[0]?.ParsedText ?? "";
  if (!text.trim()) throw new Error("Tidak ada teks yang bisa dibaca dari gambar ini. Coba foto lebih dekat dan pastikan pencahayaan cukup.");
  return text.trim();
}

// ─── Gemini Vision OCR ───────────────────────────────────────────────────────
async function runAIOCR(base64: string, geminiKey: string, mode: string): Promise<{ title: string; content: string }> {
  const isStructured = mode === "course";
  const prompt = isStructured
    ? `Analisa gambar ini. Ekstrak judul dan isi teks. Kembalikan JSON: {"title":"judul materi dari teks","content":"seluruh isi teks bersih tanpa noise"}`
    : `Ekstrak semua teks dari gambar dokumen/buku ini. Kembalikan JSON: {"title":"judul jika ada atau kosong","content":"seluruh teks yang terbaca, bersih dan rapi"}`;

  const result = await callGeminiVision(prompt, base64, geminiKey);
  const raw = result.content.trim().replace(/^```json|```$/g, "").trim();
  const data = JSON.parse(raw);
  return {
    title: data.title ?? "",
    content: data.content ?? "",
  };
}

export default function SmartScannerScreen() {
  const colors = useColors();
  const router = useRouter();
  const { mode, lessonId } = useLocalSearchParams<{ mode?: string; lessonId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const [engine, setEngine] = useState<Engine>("ai");
  const [step, setStep] = useState<Step>("camera");
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // ── Helpers ────────────────────────────────────────────────────────
  const resetToCamera = () => {
    setCapturedUri(null); setCapturedBase64(null);
    setTitle(""); setContent(""); setErrorMsg(null);
    setStep("camera");
  };

  const showUserError = (msg: string) => {
    setErrorMsg(msg);
    Alert.alert("Gagal Memproses Gambar", msg, [{ text: "OK" }]);
  };

  // ── Take picture ───────────────────────────────────────────────────
  const takePicture = async () => {
    if (!cameraRef.current || processing) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: true });
      setCapturedUri(photo.uri);
      setCapturedBase64(photo.base64 ?? null);
      setStep("preview");
    } catch (e: any) {
      showUserError("Kamera gagal mengambil foto. Coba lagi.");
    }
  };

  // ── Process ────────────────────────────────────────────────────────
  const processImage = async () => {
    if (!capturedBase64) return;
    setProcessing(true);
    setErrorMsg(null);
    try {
      if (engine === "ai") {
        const keys = await getApiKeys();
        const geminiKey = keys.find(k => k.provider === "gemini");
        if (!geminiKey) {
          Alert.alert(
            "Tidak Ada API Key Gemini",
            "Kamu belum memasang API Key Gemini. Pilih salah satu:",
            [
              { text: "Pasang API Key", onPress: () => router.push("/ai-keys" as any) },
              { text: "Pakai Offline OCR", onPress: () => { setEngine("offline"); processWithOffline(capturedBase64!); } },
              { text: "Batal", style: "cancel" },
            ]
          );
          return;
        }
        const res = await runAIOCR(capturedBase64, geminiKey.apiKey, mode ?? "note");
        setTitle(res.title);
        setContent(res.content);
        setStep("edit");

      } else {
        await processWithOffline(capturedBase64);
      }
    } catch (e: any) {
      // Jangan crash — tampilkan pesan yang dimengerti user
      const msg = friendlyError(e);
      showUserError(msg);
    } finally {
      setProcessing(false);
    }
  };

  const processWithOffline = async (base64: string) => {
    setProcessing(true);
    try {
      const text = await runOfflineOCR(base64);
      // Coba ambil baris pertama sebagai judul
      const lines = text.split("\n").filter(l => l.trim());
      setTitle(lines[0] ?? "");
      setContent(lines.slice(1).join("\n").trim() || text);
      setStep("edit");
    } catch (e: any) {
      showUserError(friendlyError(e));
    } finally {
      setProcessing(false);
    }
  };

  // Terjemahkan error teknis jadi pesan manusia biasa
  const friendlyError = (e: any): string => {
    const msg: string = e?.message ?? String(e);
    if (msg.includes("JSON")) return "AI mengembalikan format yang tidak terbaca. Coba foto ulang dengan pencahayaan lebih baik.";
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("koneksi")) return "Gagal terhubung ke internet. Pastikan WiFi/data aktif lalu coba lagi.";
    if (msg.includes("quota") || msg.includes("exhausted")) return "Kuota AI habis. Coba lagi besok atau ganti API Key di pengaturan.";
    if (msg.includes("invalid") && msg.includes("key")) return "API Key tidak valid. Periksa kembali di pengaturan AI Key.";
    if (msg.includes("timeout") || msg.includes("AbortError")) return "Koneksi terlalu lambat. Coba lagi atau pindah ke jaringan yang lebih stabil.";
    if (msg.includes("teks")) return msg; // pesan OCR sudah ramah
    return `Terjadi kesalahan: ${msg.substring(0, 120)}`;
  };

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!content.trim() && !title.trim()) {
      Alert.alert("Konten Kosong", "Isi judul atau teks terlebih dahulu sebelum menyimpan.");
      return;
    }
    setSaving(true);
    try {
      const currentMode = mode ?? "note";
      const now = new Date().toISOString();

      if (currentMode === "note") {
        await saveNote({ id: generateId(), lessonId: lessonId ?? "", title: title || "Catatan Hasil Scan", content, createdAt: now, updatedAt: now });
        toast.success("Catatan disimpan!");
      } else if (currentMode === "material") {
        const { saveStudyMaterial } = await import("@/utils/storage");
        await saveStudyMaterial({ id: generateId(), lessonId: lessonId ?? "", title: title || "Materi Hasil Scan", type: "text", content, createdAt: now });
        toast.success("Materi disimpan!");
      } else {
        await buildCourse(title, content, now);
        toast.success("Kursus berhasil dibuat!");
      }
      router.back();
    } catch (e: any) {
      Alert.alert("Gagal Menyimpan", friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  const buildCourse = async (t: string, c: string, now: string) => {
    const pathId = generateId(), modId = generateId(), lesId = generateId();
    const path: LearningPath = { id: pathId, name: t || "Kursus Hasil Scan", description: "Dari scan dokumen", userId: "local", tags: ["Scan"], createdAt: now };
    await saveLearningPath(path);
    const mod: Module = { id: modId, pathId, name: "Modul 1", description: "", order: 1, createdAt: now };
    await saveModule(mod);
    const les: Lesson = { id: lesId, moduleId: modId, name: "Pelajaran 1", description: "", order: 1, createdAt: now };
    await saveLesson(les);
    await saveFlashcardsBulkChunked([{ id: generateId(), lessonId: lesId, question: t || "Apa isi materi?", answer: cleanText(c).substring(0, 800), tag: "Scan", createdAt: now }]);
  };

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  if (!permission.granted) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <AlertCircle size={52} color={colors.textMuted} />
        <Text style={[s.bigTitle, { color: colors.text }]}>Izin Kamera Diperlukan</Text>
        <Text style={[s.sub, { color: colors.textMuted }]}>Scanner butuh akses kamera untuk membaca teks dari buku atau dokumen fisik.</Text>
        <TouchableOpacity style={[s.primaryBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
          <Text style={s.primaryBtnText}>Izinkan Kamera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── STEP: Camera ─────────────────────────────────────────────────
  if (step === "camera") return (
    <View style={s.flex}>
      <CameraView style={s.flex} ref={cameraRef}>
        {/* Top */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Smart Scanner</Text>
          <View style={s.iconBtn} />
        </View>

        {/* Engine toggle */}
        <View style={s.toggleRow}>
          <TouchableOpacity style={[s.togglePill, engine === "ai" && s.toggleActive]} onPress={() => setEngine("ai")}>
            <Zap size={13} color={engine === "ai" ? "#fff" : "rgba(255,255,255,0.55)"} />
            <Text style={[s.toggleText, engine === "ai" && { color: "#fff" }]}>AI Smart Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.togglePill, engine === "offline" && s.toggleActive]} onPress={() => setEngine("offline")}>
            <Cpu size={13} color={engine === "offline" ? "#fff" : "rgba(255,255,255,0.55)"} />
            <Text style={[s.toggleText, engine === "offline" && { color: "#fff" }]}>Offline OCR</Text>
          </TouchableOpacity>
        </View>

        {/* Frame corners */}
        <View style={s.frameWrap}>
          <View style={[s.corner, s.cornerTL]} /><View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} /><View style={[s.corner, s.cornerBR]} />
        </View>

        {/* Hint */}
        <Text style={s.hint}>
          {engine === "ai"
            ? "📷  Arahkan ke teks — AI akan membaca & menganalisa"
            : "📷  Arahkan ke teks — OCR akan mengekstrak tulisan"}
        </Text>

        {/* Capture */}
        <View style={s.captureRow}>
          <TouchableOpacity style={s.captureRing} onPress={takePicture}>
            <LinearGradient colors={["#6366f1", "#8b5cf6"]} style={s.captureInner}>
              <Camera size={28} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );

  // ── STEP: Preview ─────────────────────────────────────────────────
  if (step === "preview") return (
    <View style={s.flex}>
      {capturedUri && <Image source={{ uri: capturedUri }} style={s.flex} resizeMode="cover" />}
      <View style={s.previewOverlay}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.iconBtn} onPress={resetToCamera}>
            <ChevronLeft size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.topTitle}>Pratinjau Foto</Text>
          <View style={s.iconBtn} />
        </View>
        <View style={s.previewBottom}>
          <Text style={s.previewHint}>
            {engine === "ai" ? "🤖  AI akan mengekstrak & merapikan teks" : "🔍  OCR akan membaca teks dari foto ini"}
          </Text>
          {errorMsg && (
            <View style={s.errorBox}>
              <AlertCircle size={15} color="#f87171" />
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}
          <View style={s.previewBtns}>
            <TouchableOpacity style={s.btnSecondary} onPress={resetToCamera}>
              <RefreshCw size={15} color="#fff" /><Text style={s.btnSecondaryText}>Foto Ulang</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnPrimary} onPress={processImage} disabled={processing}>
              {processing
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Zap size={15} color="#fff" /><Text style={s.btnPrimaryText}>{engine === "ai" ? "Proses AI" : "Baca Teks"}</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  // ── STEP: Edit & Save ─────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={[s.flex, { backgroundColor: colors.background }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Header */}
      <View style={[s.editHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={s.iconBtn} onPress={resetToCamera}>
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={s.flex}>
          <Text style={[s.editTitle, { color: colors.text }]}>Edit Hasil Scan</Text>
          <Text style={[s.editSubtitle, { color: colors.textMuted }]}>Periksa & perbaiki sebelum menyimpan</Text>
        </View>
        <TouchableOpacity style={[s.saveIconBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Check size={18} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ScrollView style={s.flex} contentContainerStyle={s.editContent} keyboardShouldPersistTaps="handled">
        {/* Engine badge */}
        <View style={[s.badge, { backgroundColor: engine === "ai" ? colors.primaryLight : colors.surface, borderColor: colors.border }]}>
          {engine === "ai" ? <Zap size={12} color={colors.primary} /> : <Cpu size={12} color={colors.textMuted} />}
          <Text style={[s.badgeText, { color: engine === "ai" ? colors.primary : colors.textMuted }]}>
            {engine === "ai" ? "Hasil AI Smart Scan" : "Hasil Offline OCR"}
          </Text>
        </View>

        {/* Title */}
        <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>JUDUL</Text>
        <TextInput
          style={[s.inputSingle, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Judul catatan atau materi..."
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        {/* Content */}
        <View style={s.fieldLabelRow}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>TEKS HASIL SCAN</Text>
          <Edit3 size={12} color={colors.textMuted} />
        </View>
        <TextInput
          style={[s.inputMulti, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
          placeholder="Teks dari gambar akan muncul di sini. Kamu bisa edit sesuai kebutuhan..."
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />

        {/* Scan ulang */}
        <TouchableOpacity style={[s.retakeBtn, { borderColor: colors.border }]} onPress={resetToCamera}>
          <RefreshCw size={14} color={colors.textMuted} />
          <Text style={[s.retakeBtnText, { color: colors.textMuted }]}>Scan ulang foto lain</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  bigTitle: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 14, textAlign: "center", lineHeight: 21 },
  primaryBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  // Camera
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  topTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },

  toggleRow: { flexDirection: "row", alignSelf: "center", gap: 8, marginBottom: 16 },
  togglePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  toggleActive: { backgroundColor: "rgba(99,102,241,0.85)", borderColor: "#6366f1" },
  toggleText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.55)" },

  frameWrap: { width: width * 0.78, height: width * 0.95, alignSelf: "center", position: "relative", marginVertical: 4 },
  corner: { position: "absolute", width: 26, height: 26 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderTopLeftRadius: 8 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderTopRightRadius: 8 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "#fff", borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "#fff", borderBottomRightRadius: 8 },

  hint: { color: "rgba(255,255,255,0.8)", textAlign: "center", fontSize: 13, fontWeight: "600", marginHorizontal: 32, marginBottom: 8 },
  captureRow: { alignItems: "center", paddingBottom: 44, paddingTop: 12 },
  captureRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: "rgba(255,255,255,0.5)", overflow: "hidden" },
  captureInner: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Preview
  previewOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  previewBottom: { padding: 24, backgroundColor: "rgba(0,0,0,0.78)", gap: 14 },
  previewHint: { color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(239,68,68,0.15)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.3)" },
  errorText: { flex: 1, color: "#f87171", fontSize: 13, lineHeight: 18 },
  previewBtns: { flexDirection: "row", gap: 12 },
  btnSecondary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  btnSecondaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnPrimary: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: "#6366f1" },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // Edit
  editHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  editTitle: { fontSize: 16, fontWeight: "800" },
  editSubtitle: { fontSize: 12, marginTop: 1 },
  saveIconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  editContent: { padding: 20, gap: 12 },

  badge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: "flex-start", borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: "700" },

  fieldLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inputSingle: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: "600", borderWidth: 1.5 },
  inputMulti: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, lineHeight: 22, borderWidth: 1.5, minHeight: 320 },

  retakeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", marginTop: 4 },
  retakeBtnText: { fontSize: 13, fontWeight: "600" },
});
