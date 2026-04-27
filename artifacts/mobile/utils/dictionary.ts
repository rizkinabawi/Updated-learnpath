/**
 * utils/dictionary.ts
 * 
 * Simple offline dictionary for JLPT vocabulary.
 * This is a lightweight version specifically for quick popups.
 */

export interface DictEntry {
  word: string;
  reading: string;
  meaning: string;
  level?: string;
}

// Expanded JLPT Vocabulary (N2 & N3)
const n2Dict: DictEntry[] = [
  // --- N2 Technical & Common ---
  { word: "縮小", reading: "しゅくしょう", meaning: "Pengurangan, Pengecilan (Reduction, Contraction)", level: "N2" },
  { word: "画像", reading: "がぞう", meaning: "Gambar, Citra (Image, Portrait)", level: "N2" },
  { word: "画面", reading: "がめん", meaning: "Layar (Screen)", level: "N2" },
  { word: "操作", reading: "そうさ", meaning: "Operasi, Manipulasi (Operation, Manipulation)", level: "N2" },
  { word: "機能", reading: "きのう", meaning: "Fungsi, Fitur (Function, Faculty)", level: "N2" },
  { word: "確認", reading: "かくにん", meaning: "Konfirmasi (Confirmation)", level: "N2" },
  { word: "変更", reading: "へんこう", meaning: "Perubahan (Change, Modification)", level: "N2" },
  { word: "削除", reading: "さくじょ", meaning: "Hapus (Deletion)", level: "N2" },
  { word: "保存", reading: "ほぞん", meaning: "Simpan (Preservation, Storage)", level: "N2" },
  { word: "接続", reading: "せつぞく", meaning: "Koneksi (Connection)", level: "N2" },
  { word: "設定", reading: "せってい", meaning: "Pengaturan (Setting, Configuration)", level: "N2" },
  { word: "開発", reading: "かいはつ", meaning: "Pengembangan (Development)", level: "N2" },
  { word: "記録", reading: "きろく", meaning: "Rekor, Catatan (Record)", level: "N2" },
  { word: "詳細", reading: "しょうさい", meaning: "Detail, Rincian (Detail)", level: "N2" },
  { word: "適用", reading: "てきよう", meaning: "Penerapan (Application)", level: "N2" },
  { word: "更新", reading: "こうしん", meaning: "Pembaruan (Update)", level: "N2" },
  { word: "削除", reading: "さくじょ", meaning: "Penghapusan (Elimination)", level: "N2" },
  { word: "選択", reading: "せんたく", meaning: "Pilihan (Selection)", level: "N2" },
  { word: "完了", reading: "かんりょう", meaning: "Selesai (Completion)", level: "N2" },
  { word: "移動", reading: "いどう", meaning: "Perpindahan (Movement)", level: "N2" },
  { word: "検索", reading: "けんさく", meaning: "Pencarian (Search)", level: "N2" },
  { word: "実行", reading: "じっこう", meaning: "Eksekusi, Pelaksanaan (Execution)", level: "N2" },
  { word: "停止", reading: "ていし", meaning: "Berhenti, Suspensi (Stop)", level: "N2" },
  { word: "開始", reading: "かいし", meaning: "Mulai (Start)", level: "N2" },
  { word: "終了", reading: "しゅうりょう", meaning: "Berakhir (End)", level: "N2" },
  { word: "表示", reading: "ひょうじ", meaning: "Tampilan, Display (Display)", level: "N2" },
  { word: "非表示", reading: "ひひょうじ", meaning: "Sembunyi (Hidden)", level: "N2" },
  
  // --- N3 Essential ---
  { word: "準備", reading: "じゅんび", meaning: "Persiapan (Preparation)", level: "N3" },
  { word: "注意", reading: "ちゅうい", meaning: "Peringatan, Perhatian (Caution)", level: "N3" },
  { word: "説明", reading: "せつめい", meaning: "Penjelasan (Explanation)", level: "N3" },
  { word: "練習", reading: "れんしゅう", meaning: "Latihan (Practice)", level: "N3" },
  { word: "復習", reading: "ふくしゅう", meaning: "Review, Mengulang (Review)", level: "N3" },
  { word: "予習", reading: "よしゅう", meaning: "Persiapan Pelajaran (Preparation for lesson)", level: "N3" },
  { word: "宿題", reading: "しゅくだい", meaning: "Pekerjaan Rumah (Homework)", level: "N3" },
  { word: "試験", reading: "しけん", meaning: "Ujian (Exam)", level: "N3" },
  { word: "勉強", reading: "べんきょう", meaning: "Belajar (Study)", level: "N3" },
  { word: "単語", reading: "たんご", meaning: "Kosakata (Vocabulary)", level: "N3" },
  { word: "文法", reading: "ぶんぽう", meaning: "Tata Bahasa (Grammar)", level: "N3" },
  { word: "漢字", reading: "かんじ", meaning: "Kanji", level: "N3" },
  { word: "文章", reading: "ぶんしょう", meaning: "Kalimat, Teks (Sentence)", level: "N3" },
  { word: "意味", reading: "いみ", meaning: "Arti (Meaning)", level: "N3" },
  { word: "発音", reading: "はつおん", meaning: "Pengucapan (Pronunciation)", level: "N3" },
  { word: "会話", reading: "かいわ", meaning: "Percakapan (Conversation)", level: "N3" },
  { word: "理解", reading: "りかい", meaning: "Pemahaman (Understanding)", level: "N3" },
  { word: "解決", reading: "かいけつ", meaning: "Solusi (Solution)", level: "N3" },
  { word: "連絡", reading: "れんらく", meaning: "Kontak (Contact)", level: "N3" },
  { word: "相談", reading: "そうだん", meaning: "Konsultasi (Consultation)", level: "N3" },
  { word: "予約", reading: "よやく", meaning: "Reservasi (Reservation)", level: "N3" },
  { word: "報告", reading: "ほうこく", meaning: "Laporan (Report)", level: "N3" },
  { word: "関係", reading: "かんけい", meaning: "Hubungan (Relationship)", level: "N3" },
  { word: "程度", reading: "ていど", meaning: "Tingkat (Degree)", level: "N3" },
  { word: "方法", reading: "ほうほう", meaning: "Metode, Cara (Method)", level: "N3" },
  { word: "内容", reading: "ないよう", meaning: "Isi (Content)", level: "N3" },
  { word: "目的", reading: "もくてき", meaning: "Tujuan (Purpose)", level: "N3" },
  { word: "結果", reading: "けっか", meaning: "Hasil (Result)", level: "N3" },
  { word: "成功", reading: "せいこう", meaning: "Sukses (Success)", level: "N3" },
  { word: "失敗", reading: "しっぱい", meaning: "Gagal (Failure)", level: "N3" },
];

/**
 * Searches for a word in the local dictionary.
 * Supports exact match and partial match for the word or reading.
 */
export const lookupWord = (text: string): DictEntry | null => {
  const clean = text.trim();
  if (!clean) return null;

  // Exact match
  const exact = n2Dict.find(e => e.word === clean || e.reading === clean);
  if (exact) return exact;

  // Fuzzy match (contains)
  return n2Dict.find(e => clean.includes(e.word) || e.word.includes(clean)) || null;
};

/**
 * Basic tokenizer for Japanese text to make words clickable.
 * This is a simple regex-based splitter that groups Kanji and Kana blocks.
 */
export const tokenizeJapanese = (text: string): string[] => {
  // Regex to split by Kanji blocks, Katakana blocks, Hiragana blocks, words, or whitespace/punctuation
  // We include \s+ to capture spaces so they are preserved in the output tokens.
  const regex = /([\u4E00-\u9FAF]+|[\u3040-\u309F]+|[\u30A0-\u30FF]+|[0-9]+|[a-zA-Z]+|[\s]+|[^\u4E00-\u9FAF\u3040-\u309F\u30A0-\u30FF0-9a-zA-Z\s]+)/g;
  return text.match(regex) || [text];
};
