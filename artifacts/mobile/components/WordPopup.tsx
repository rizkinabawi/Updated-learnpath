import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { X, Book, Info } from 'lucide-react-native';
import { useColors } from '@/contexts/ThemeContext';
import { type DictEntry } from '@/utils/dictionary';

interface WordPopupProps {
  visible: boolean;
  entry: DictEntry | null;
  onClose: () => void;
}

export const WordPopup: React.FC<WordPopupProps> = ({ visible, entry, onClose }) => {
  const colors = useColors();

  if (!entry) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.content, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Book size={20} color={colors.primary} />
              <Text style={[styles.headerTitle, { color: colors.text }]}>Kamus Cepat</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.wordRow}>
              <Text style={[styles.word, { color: colors.text }]}>{entry.word}</Text>
              <Text style={[styles.reading, { color: colors.textSecondary }]}>【{entry.reading}】</Text>
            </View>
            
            <View style={[styles.meaningBox, { backgroundColor: colors.background }]}>
              <Info size={14} color={colors.primary} style={styles.infoIcon} />
              <Text style={[styles.meaning, { color: colors.text }]}>{entry.meaning}</Text>
            </View>

            {entry.level && (
              <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  {entry.level === "USER" ? "KURKULUM SAYA" : `JLPT ${entry.level}`}
                </Text>
              </View>
            )}

            {entry.source && (
              <Text style={[styles.sourceText, { color: colors.textMuted }]}>Sumber: {entry.source}</Text>
            )}
          </View>

          <TouchableOpacity style={[styles.footerBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={styles.footerBtnText}>Mengerti</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    gap: 12,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  word: {
    fontSize: 28,
    fontWeight: '900',
  },
  reading: {
    fontSize: 16,
    fontWeight: '600',
  },
  meaningBox: {
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
  },
  infoIcon: {
    marginTop: 2,
  },
  meaning: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  sourceText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
  },
  footerBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  footerBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
