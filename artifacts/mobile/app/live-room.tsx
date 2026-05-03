import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Animated,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors, useTheme } from "@/contexts/ThemeContext";
import { toast } from "@/components/Toast";
import { shadow, shadowSm, type ColorScheme } from "@/constants/colors";
import { LinearGradient } from "expo-linear-gradient";

import { db, auth } from "@/utils/firebase";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  limit,
  doc 
} from "firebase/firestore";
import { getUserSubscription, isSubscriptionActive, type UserSubscription } from "@/utils/user-subscription";

const { width, height } = Dimensions.get("window");

interface ChatMessage {
  id: string;
  user: string;
  avatar: string;
  message: string;
  isSystem?: boolean;
  createdAt?: any;
}

export default function LiveRoomPage() {
  const { id = "default_room", title = "Live Class" } = useLocalSearchParams<{ id: string, title: string }>();
  const colors = useColors();
  const { isDark, palette } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark, palette), [colors, isDark, palette]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const videoRef = useRef(null);

  const [viewers, setViewers] = useState(142);
  const [session, setSession] = useState<any>(null);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);

  // ── CHECK SUBSCRIPTION ──
  useEffect(() => {
    if (auth.currentUser) {
      getUserSubscription(auth.currentUser.uid).then(sub => {
        setSubscription(sub);
        setLoadingSub(false);
      });
    } else {
      setLoadingSub(false);
    }
  }, []);

  // ── FETCH SESSION DETAILS ──
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, "live_sessions", id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setSession(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, [id]);

  // ── FIREBASE REALTIME CHAT ──
  useEffect(() => {
    if (!subscription || !isSubscriptionActive(subscription)) return;
    
    const chatRef = collection(db, "live_rooms", id, "messages");
    const q = query(chatRef, orderBy("createdAt", "asc"), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      setMessages(msgs);
    }, (error) => {
      console.warn("Firestore error:", error);
      // Fallback message if Firebase not configured yet
      if (error.message.includes("YOUR_API_KEY")) {
        toast.error("Firebase belum di-config (Cek utils/firebase.ts)");
      }
    });

    return () => unsubscribe();
  }, [id]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");

    try {
      const user = auth.currentUser;
      const chatRef = collection(db, "live_rooms", id, "messages");
      await addDoc(chatRef, {
        user: user?.displayName || "Pelajar",
        avatar: user?.photoURL || `https://i.pravatar.cc/100?u=${user?.uid || "anon"}`,
        message: text,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      toast.error("Gagal mengirim pesan.");
      console.error(e);
    }
  };

  const spawnHeart = () => {
    const id = Date.now();
    const x = Math.random() * 60 - 30; // Random horizontal jitter
    setHearts(prev => [...prev, { id, x }]);
    setTimeout(() => {
      setHearts(prev => prev.filter(h => h.id !== id));
    }, 2000);
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.isSystem) {
      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemMsgText}>{item.message}</Text>
        </View>
      );
    }
    return (
      <View style={styles.chatRow}>
        <Image source={{ uri: item.avatar }} style={styles.chatAvatar} />
        <View style={styles.chatContent}>
          <Text style={styles.chatUser}>{item.user}</Text>
          <Text style={styles.chatText}>{item.message}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── VIDEO PLAYER ── */}
      <View style={[styles.videoContainer, { paddingTop: insets.top }]}>
        <Video
          ref={videoRef}
          style={styles.video}
          source={{ uri: session?.streamUrl || "https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4" }} 
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          isLooping
          shouldPlay
        />
        
        {/* Overlays */}
        <View style={[styles.videoOverlay, { top: insets.top + 10 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <View style={styles.viewerBadge}>
            <Feather name="users" size={12} color="#fff" />
            <Text style={styles.viewerText}>{viewers}</Text>
          </View>
        </View>
      </View>

      {/* ── STREAM INFO ── */}
      <View style={styles.infoBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.streamTitle}>{session?.title || title}</Text>
          <Text style={styles.streamSub}>{session?.teacher || "Sensei"} · {session?.description || "Live Class"}</Text>
        </View>
        <TouchableOpacity style={styles.followBtn}>
          <Text style={styles.followBtnText}>Follow</Text>
        </TouchableOpacity>
      </View>

      {/* ── CHAT SECTION ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.chatSection}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Floating Hearts Layer */}
        <View style={styles.heartLayer} pointerEvents="none">
          {hearts.map(h => (
            <FloatingHeart key={h.id} x={h.x} styles={styles} />
          ))}
        </View>

        {/* Input Bar */}
        <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={spawnHeart}>
            <Feather name="heart" size={20} color={colors.danger} />
          </TouchableOpacity>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Ketik sesuatu..."
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
              <Feather name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function FloatingHeart({ x, styles }: { x: number; styles: any }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -200],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 1, 1, 0],
  });
  const scale = anim.interpolate({
    inputRange: [0, 0.2],
    outputRange: [0.5, 1],
  });

  return (
    <Animated.View style={[
      styles.floatingHeart, 
      { transform: [{ translateY }, { translateX: x }, { scale }], opacity }
    ]}>
      <Feather name="heart" size={20} color="#FF4B4B" fill="#FF4B4B" />
    </Animated.View>
  );
}

const makeStyles = (c: ColorScheme, isDark: boolean, palette: string) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  videoContainer: {
    width: "100%",
    backgroundColor: "#000",
    aspectRatio: 16 / 9,
  },
  video: {
    flex: 1,
  },
  videoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF4B4B",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  viewerText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  infoBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.borderLight,
    backgroundColor: c.surface,
  },
  streamTitle: { fontSize: 16, fontWeight: "900", color: c.text },
  streamSub: { fontSize: 12, color: c.textMuted, fontWeight: "600", marginTop: 2 },
  followBtn: {
    backgroundColor: c.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  followBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  chatSection: { flex: 1 },
  chatList: { padding: 16, paddingBottom: 10 },
  chatRow: { flexDirection: "row", marginBottom: 16, gap: 12 },
  chatAvatar: { width: 32, height: 32, borderRadius: 12, backgroundColor: c.border },
  chatContent: { flex: 1, backgroundColor: c.surface, padding: 10, borderRadius: 16, borderTopLeftRadius: 0 },
  chatUser: { fontSize: 11, fontWeight: "800", color: c.primary, marginBottom: 2 },
  chatText: { fontSize: 13, color: c.text, lineHeight: 18 },
  systemMsg: { paddingVertical: 8, alignItems: "center" },
  systemMsgText: { fontSize: 11, color: c.textMuted, fontWeight: "600", fontStyle: "italic" },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.borderLight,
    gap: 12,
  },
  actionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.danger + "15", alignItems: "center", justifyContent: "center" },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: c.background, borderRadius: 20, paddingLeft: 16, paddingRight: 4, height: 40 },
  input: { flex: 1, fontSize: 14, color: c.text, height: "100%" },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },

  heartLayer: { position: "absolute", right: 20, bottom: 80, height: 200, width: 80, alignItems: "center", justifyContent: "flex-end" },
  floatingHeart: { position: "absolute" },
});
