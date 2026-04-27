import React from 'react';
import { View, Text, StyleSheet, Image, Linking, TouchableOpacity } from 'react-native';
import { useColors } from '@/contexts/ThemeContext';
import { resolveAssetUri } from '@/utils/path-resolver';

interface Props {
  content: string;
  selectable?: boolean;
  onNoteLinkPress?: (noteId: string) => void;
}

export const RichTextRenderer: React.FC<Props> = ({ content, selectable = true, onNoteLinkPress }) => {
  const colors = useColors();

  if (!content) return null;

  // Split by lines to process tags
  const lines = content.split('\n');
  
  const renderSegment = (line: string, index: number) => {
    const trimmed = line.trim();
    
    // Check for H1: tag
    if (trimmed.toUpperCase().startsWith('H1:')) {
      return (
        <Text key={index} style={[styles.h1, { color: colors.primary }]}>
          {trimmed.slice(3).trim()}
        </Text>
      );
    }
    
    // Check for H2: tag
    if (trimmed.toUpperCase().startsWith('H2:')) {
      return (
        <Text key={index} style={[styles.h2, { color: colors.primary }]}>
          {trimmed.slice(3).trim()}
        </Text>
      );
    }

    // Check for P: tag (explicit paragraph)
    if (trimmed.toUpperCase().startsWith('P:')) {
      return (
        <Text key={index} style={[styles.p, { color: colors.text }]}>
          {renderInlineFormatting(trimmed.slice(2).trim(), colors, onNoteLinkPress)}
        </Text>
      );
    }

    // Check for LIST: or * tag
    if (trimmed.toUpperCase().startsWith('LIST:') || trimmed.startsWith('* ')) {
      const text = trimmed.toUpperCase().startsWith('LIST:') ? trimmed.slice(5).trim() : trimmed.slice(2).trim();
      return (
        <View key={index} style={styles.listItem}>
          <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
          <Text style={[styles.p, { flex: 1, color: colors.text }]}>
            {renderInlineFormatting(text, colors, onNoteLinkPress)}
          </Text>
        </View>
      );
    }

    // Default line rendering with inline formatting
    return (
      <Text key={index} style={[styles.p, { color: colors.text }]}>
        {renderInlineFormatting(line, colors, onNoteLinkPress)}
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      {lines.map((line, i) => renderSegment(line, i))}
    </View>
  );
};

// Handle inline formatting like B: (bold), I: (italic), and Note Links [[note:id|title]]
const renderInlineFormatting = (text: string, colors: any, onNoteLinkPress?: (id: string) => void) => {
  const NOTE_LINK_RE = /\[\[note:([^|\]]+)\|([^\]]+)\]\]/g;
  const BOLD_RE = /B:([^:]+):/g;
  const ITALIC_RE = /I:([^:]+):/g;
  
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  
  // This is a simplified parser. For a real app, a more robust regex-based segmenter would be better.
  // We'll combine all patterns and sort them.
  const matches: { start: number; end: number; type: string; data: any }[] = [];
  
  let m;
  while ((m = NOTE_LINK_RE.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: 'NOTE', data: { id: m[1], title: m[2] } });
  }
  while ((m = BOLD_RE.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: 'BOLD', data: m[1] });
  }
  while ((m = ITALIC_RE.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, type: 'ITALIC', data: m[1] });
  }
  
  matches.sort((a, b) => a.start - b.start);
  
  let currentPos = 0;
  matches.forEach((match, i) => {
    if (match.start > currentPos) {
      segments.push(text.slice(currentPos, match.start));
    }
    
    if (match.type === 'NOTE') {
      segments.push(
        <Text
          key={`match-${i}`}
          onPress={() => onNoteLinkPress?.(match.data.id)}
          style={{ color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' }}
        >
          @{match.data.title}
        </Text>
      );
    } else if (match.type === 'BOLD') {
      segments.push(
        <Text key={`match-${i}`} style={{ fontWeight: '900', color: colors.text }}>
          {match.data}
        </Text>
      );
    } else if (match.type === 'ITALIC') {
      segments.push(
        <Text key={`match-${i}`} style={{ fontStyle: 'italic', color: colors.text }}>
          {match.data}
        </Text>
      );
    }
    
    currentPos = match.end;
  });
  
  if (currentPos < text.length) {
    segments.push(text.slice(currentPos));
  }
  
  return segments.length > 0 ? segments : text;
};

const styles = StyleSheet.create({
  container: { width: '100%' },
  h1: { fontSize: 28, fontWeight: '900', marginTop: 16, marginBottom: 8, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '800', marginTop: 12, marginBottom: 6, lineHeight: 28 },
  p: { fontSize: 16, lineHeight: 26, marginBottom: 8, fontWeight: '500' },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 10 },
});
