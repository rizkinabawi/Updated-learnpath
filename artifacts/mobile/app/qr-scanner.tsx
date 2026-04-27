import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, Animated, Easing, Modal } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scanAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 250,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scanAnim]);

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  if (!permission) {
    return <View style={styles.container}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Akses kamera diperlukan untuk memindai QR Code.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Izinkan Kamera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      // Data format: learningpath://flashcard/[id] or learningpath://quiz/[id]
      if (data.startsWith("learningpath://")) {
        const url = data.replace("learningpath://", "/");
        router.replace(url as any);
      } else {
        Alert.alert("Format Tidak Dikenal", "QR Code ini bukan dari LearnPath.", [{ text: "OK", onPress: () => setScanned(false) }]);
      }
    } catch (e) {
      Alert.alert("Error", "Gagal membaca QR Code.", [{ text: "OK", onPress: () => setScanned(false) }]);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
      />
      
      <View style={[styles.overlay, { paddingTop: insets.top + 20 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Scan QR Materi</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setShowHelp(true)}>
            <Feather name="help-circle" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.scannerBox}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanAnim }] }]} />
        </View>

        <Text style={styles.hint}>Arahkan kamera ke QR Code di PDF LearnPath</Text>
      </View>

      {/* HELP MODAL */}
      <Modal visible={showHelp} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Cara Kerja QR Sync</Text>
            
            <View style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
              <Text style={styles.stepText}>Ekspor materi favorit Anda ke format PDF (classic/zen/dll).</Text>
            </View>
            
            <View style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
              <Text style={styles.stepText}>Cetak atau buka PDF tersebut di perangkat lain.</Text>
            </View>
            
            <View style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
              <Text style={styles.stepText}>Pindai QR Code yang ada di pojok kanan atas halaman pertama.</Text>
            </View>
            
            <View style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
              <Text style={styles.stepText}>Aplikasi akan otomatis sinkron dan membuka materi tersebut!</Text>
            </View>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowHelp(false)}>
              <Text style={styles.modalCloseBtnText}>Mengerti</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    color: "#fff",
    textAlign: "center",
    marginBottom: 20,
    fontSize: 16,
  },
  button: {
    backgroundColor: Colors.primary,
    padding: 15,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 20,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  scannerBox: {
    width: 250,
    height: 250,
    borderWidth: 0,
    position: "relative",
  },
  hint: {
    color: "#fff",
    fontSize: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: Colors.primary,
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  scanLine: {
    position: "absolute",
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#e2e8f0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1a202c",
    marginBottom: 24,
    textAlign: "center",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: "#4a5568",
    lineHeight: 20,
    fontWeight: "500",
  },
  modalCloseBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 20,
  },
  modalCloseBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
