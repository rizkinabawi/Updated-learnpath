import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import {
  Plus,
  Search,
  Clock,
  Trash2,
  PenLine,
  FileDown,
  Paperclip,
  Download,
} from "lucide-react-native";
import { 
  getNotes, 
  saveNote, 
  deleteNote, 
  generateId, 
  type Note 
} from "@/utils/storage";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { useRouter } from "expo-router";
import { printHtml } from "@/utils/print-compat";
import * as FileSystem from "@/utils/fs-compat";
import { toast } from "@/components/Toast";

interface Props {
  lessonId: string;
  lessonName: string;
}

export default function NotesSection({ lessonId, lessonName }: Props) {
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();

  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  
  useEffect(() => {
    loadNotes();
  }, [lessonId]);

  const loadNotes = async () => {
    const list = await getNotes(lessonId);
    setNotes(list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  const handleExportMenu = () => { /* reuse existing export logic */
    Alert.alert("Ekspor Catatan", "Pilih format file.", [
      { text: "PDF", onPress: exportPDF },
      { text: "TXT", onPress: exportTXT },
      { text: "Batal", style: "cancel" }
    ]);
  };

  const exportPDF = async () => {
    if (notes.length === 0) return;
    try {
      const html = `<html><body><h1>${lessonName}</h1>${notes.map(n => `<h3>${n.title}</h3><p>${n.content}</p>`).join("")}</body></html>`;
      await printHtml(html, { dialogTitle: `Catatan - ${lessonName}` });
    } catch { toast.error("Gagal ekspor"); }
  };

  const exportTXT = async () => { /* existing txt logic */ };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Search size={16} color={colors.textMuted} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Cari catatan..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity onPress={handleExportMenu} style={styles.exportBtn}>
            <Download size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {filteredNotes.length === 0 ? (
          <View style={styles.empty}>
             <FileDown size={40} color={colors.border} />
             <Text style={styles.emptyText}>Belum ada catatan</Text>
          </View>
        ) : (
          filteredNotes.map(note => (
            <TouchableOpacity 
                key={note.id} 
                style={styles.card}
                onPress={() => router.push({ pathname: "/notes/view/[noteId]", params: { noteId: note.id, lessonId } })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{note.title}</Text>
                <TouchableOpacity onPress={() => {/* delete */}}>
                    <Trash2 size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>
              <Text style={styles.cardPreview} numberOfLines={2}>{note.content}</Text>
              <View style={styles.cardFooter}>
                <Clock size={10} color={colors.textMuted} />
                <Text style={styles.cardDate}>{formatDate(note.updatedAt)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => router.push({ pathname: "/notes/[lessonId]", params: { lessonId } })}
      >
        <Plus size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: any, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  searchBar: { 
    flexDirection: "row", alignItems: "center", 
    paddingHorizontal: 12, margin: 16, height: 46,
    backgroundColor: c.surface, borderRadius: 12,
    borderWidth: 1, borderColor: c.border
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: c.text },
  exportBtn: { padding: 8 },
  list: { padding: 16, gap: 12, paddingBottom: 100 },
  card: { backgroundColor: c.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: c.text },
  cardPreview: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  cardDate: { fontSize: 11, color: c.textMuted, fontWeight: "600" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 100, gap: 12 },
  emptyText: { color: c.textMuted, fontWeight: "600" },
  fab: {
    position: "absolute", right: 20, bottom: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8,
  }
});
