import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import {
  ExternalScreen,
  addExternalScreen,
  deleteExternalScreen,
  getExternalScreens,
  updateExternalScreen,
} from "@/utils/externalScreens";

export default function ExternalScreensPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ExternalScreen[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<ExternalScreen | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getExternalScreens();
    setItems(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAddModal = () => {
    setEditing(null);
    setTitleInput("");
    setUrlInput("");
    setModalVisible(true);
  };

  const openEditModal = (item: ExternalScreen) => {
    setEditing(item);
    setTitleInput(item.title);
    setUrlInput(item.url);
    setModalVisible(true);
  };

  const handleSave = async () => {
    const title = titleInput.trim();
    const url = urlInput.trim();
    if (!title || !url) {
      Alert.alert("Lengkapi data", "Judul dan URL wajib diisi.");
      return;
    }
    if (editing) {
      await updateExternalScreen(editing.id, { title, url });
    } else {
      await addExternalScreen({ title, url });
    }
    setModalVisible(false);
    await load();
  };

  const handleDelete = (item: ExternalScreen) => {
    Alert.alert("Hapus halaman?", `Yakin hapus "${item.title}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          await deleteExternalScreen(item.id);
          await load();
        },
      },
    ]);
  };

  const openScreen = (item: ExternalScreen) => {
    router.push(`/external-view/${item.id}` as any);
  };

  const renderItem = ({ item }: { item: ExternalScreen }) => (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardMain} onPress={() => openScreen(item)} activeOpacity={0.7}>
        <View style={styles.iconBox}>
          <Feather name="globe" size={20} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.cardUrl} numberOfLines={1}>
            {item.url}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(item)}>
          <Feather name="edit-2" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
          <Feather name="trash-2" size={14} color="#E5484D" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Halaman Eksternal</Text>
          <Text style={styles.headerSub}>Tambahkan website sebagai screen page</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Feather name="plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Memuat...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Feather name="globe" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Belum ada halaman</Text>
          <Text style={styles.emptyText}>
            Tap tombol + untuk menambahkan halaman website external sebagai screen page.
          </Text>
          <TouchableOpacity style={styles.emptyCta} onPress={openAddModal}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.emptyCtaText}>Tambah Halaman</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>
                {editing ? "Edit Halaman" : "Tambah Halaman Baru"}
              </Text>
              <Text style={styles.modalSub}>
                Tampilkan website apapun sebagai screen page di app kamu.
              </Text>

              <Text style={styles.label}>Judul</Text>
              <TextInput
                value={titleInput}
                onChangeText={setTitleInput}
                placeholder="Contoh: Dokumentasi React"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
              />

              <Text style={styles.label}>URL</Text>
              <TextInput
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="https://reactnative.dev"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="url"
                autoCorrect={false}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnGhost]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalBtnGhostText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={handleSave}
                >
                  <Feather name="save" size={16} color="#fff" />
                  <Text style={styles.modalBtnPrimaryText}>Simpan</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg ?? "#F6F7FB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.bg ?? "#F6F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: Colors.text },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#0F1F3D",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: Colors.text },
  cardUrl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  actions: { flexDirection: "row", gap: 4 },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.bg ?? "#F6F7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 6 },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyCtaText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,31,61,0.4)" },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: Colors.text },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginTop: 4, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "700", color: Colors.text, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.bg ?? "#F6F7FB",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalBtnGhost: { backgroundColor: Colors.bg ?? "#F6F7FB" },
  modalBtnGhostText: { color: Colors.text, fontWeight: "700" },
  modalBtnPrimary: { backgroundColor: Colors.primary },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "700" },
});
