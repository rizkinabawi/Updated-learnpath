export interface PromptTemplate {
  id: string;
  topic: string;
  type: "quiz" | "flashcard";
  title: string;
  description: string;
  template: string;
}

export const LANGUAGE_OPTIONS = [
  { id: "Bahasa Indonesia", label: "🇮🇩 Indonesia" },
  { id: "English", label: "🇺🇸 English" },
  { id: "Arabic", label: "🇸🇦 Arabic" },
  { id: "Japanese", label: "🇯🇵 Japanese" },
  { id: "Mandarin", label: "🇨🇳 Mandarin" },
  { id: "French", label: "🇫🇷 French" },
  { id: "German", label: "🇩🇪 German" },
  { id: "Korean", label: "🇰🇷 Korean" },
];

// Canonical quiz format reminder (used in multiple templates)
const QUIZ_FORMAT_EXAMPLE = `[
  {
    "question": "Apa fungsi utama mitokondria dalam sel?",
    "options": [
      "Menghasilkan energi (ATP) melalui respirasi seluler",
      "Menyimpan informasi genetik",
      "Mengontrol masuk keluarnya zat dari sel",
      "Mensintesis protein"
    ],
    "correct_answer": "Menghasilkan energi (ATP) melalui respirasi seluler",
    "explanation": "Mitokondria dikenal sebagai 'powerhouse of the cell' karena menghasilkan ATP melalui proses respirasi seluler."
  }
]`;

const QUIZ_RULES = `ATURAN WAJIB — wajib diikuti untuk setiap soal:
1. Field "question": string pertanyaan yang jelas
2. Field "options": array TEPAT 4 string (teks lengkap, BUKAN huruf A/B/C/D)
3. Field "correct_answer": string yang IDENTIK SAMA PERSIS (huruf, spasi, tanda baca) dengan salah satu elemen di "options"
4. Field "explanation": string penjelasan singkat mengapa jawaban tersebut benar
5. JANGAN gunakan "A", "B", "C", "D" sebagai nilai "correct_answer" — gunakan teks lengkap
6. Tidak ada field lain selain "question", "options", "correct_answer", "explanation"
7. Minimum 5 soal`;

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // ── FLASHCARD TEMPLATES ──────────────────────────────────────
  {
    id: "fc-concepts",
    topic: "Umum",
    type: "flashcard",
    title: "Konsep & Definisi",
    description: "Flashcard konsep inti dan definisi",
    template: `Buatkan 10 flashcard tentang [TOPIC] untuk level [LEVEL]. Gunakan bahasa [LANGUAGE].
Fokus pada konsep inti, definisi, dan contoh nyata.
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Jangan tambahkan teks, penjelasan, markdown, atau blok kode. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON yang WAJIB digunakan:
[
  {
    "question": "Apa yang dimaksud dengan fotosintesis?",
    "answer": "Proses di mana tumbuhan mengubah cahaya matahari, air, dan CO₂ menjadi glukosa dan oksigen.",
    "tag": "biologi-dasar"
  }
]

ATURAN WAJIB:
1. Field "question": pertanyaan atau konsep yang diuji
2. Field "answer": jawaban lengkap dan informatif
3. Field "tag": kata kunci singkat dengan tanda hubung
4. Hanya field "question", "answer", "tag"
5. Minimum 3 item
6. Topik: [TOPIC]`,
  },
  {
    id: "fc-vocab",
    topic: "Bahasa",
    type: "flashcard",
    title: "Kosakata & Frasa",
    description: "Flashcard kosakata dan frasa penting",
    template: `Buatkan 15 flashcard kosakata untuk belajar [TOPIC], level [LEVEL]. Gunakan bahasa [LANGUAGE].
Sertakan kata, makna, dan contoh kalimat.
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON yang WAJIB digunakan:
[
  {
    "question": "Apa arti kata 'Ubiquitous'?",
    "answer": "Ada di mana-mana. Contoh: 'Smartphones have become ubiquitous in modern society.'",
    "tag": "kosakata"
  }
]

ATURAN: Hanya field "question", "answer", "tag". Minimum 3 item. Topik: [TOPIC]`,
  },
  {
    id: "fc-dates",
    topic: "Sejarah",
    type: "flashcard",
    title: "Tanggal & Peristiwa",
    description: "Flashcard peristiwa historis penting",
    template: `Buatkan 10 flashcard tentang peristiwa, tanggal, dan tokoh penting dalam [TOPIC], level [LEVEL]. Gunakan bahasa [LANGUAGE].
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON:
[
  {
    "question": "Kapan Proklamasi Kemerdekaan Indonesia dibacakan?",
    "answer": "17 Agustus 1945, di Jakarta, oleh Soekarno dan Mohammad Hatta.",
    "tag": "sejarah"
  }
]

ATURAN: Hanya field "question", "answer", "tag". Minimum 3 item. Topik: [TOPIC]`,
  },
  {
    id: "fc-formula",
    topic: "Sains",
    type: "flashcard",
    title: "Rumus & Formula",
    description: "Flashcard rumus sains dan matematika",
    template: `Buatkan 10 flashcard tentang rumus dan formula dalam [TOPIC], level [LEVEL]. Gunakan bahasa [LANGUAGE].
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON:
[
  {
    "question": "Apa rumus luas lingkaran?",
    "answer": "L = π × r², di mana r adalah jari-jari lingkaran dan π ≈ 3.14.",
    "tag": "matematika"
  }
]

ATURAN: Hanya field "question", "answer", "tag". Minimum 3 item. Topik: [TOPIC]`,
  },

  // ── QUIZ TEMPLATES ───────────────────────────────────────────
  {
    id: "qz-mcq",
    topic: "Umum",
    type: "quiz",
    title: "Pilihan Ganda",
    description: "Quiz pilihan ganda dengan 4 opsi + penjelasan",
    template: `Buatkan 10 soal pilihan ganda tentang [TOPIC] untuk level [LEVEL]. Gunakan bahasa [LANGUAGE].
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON yang WAJIB digunakan:
${QUIZ_FORMAT_EXAMPLE}

${QUIZ_RULES}
8. Topik: [TOPIC]`,
  },
  {
    id: "qz-truefalse",
    topic: "Umum",
    type: "quiz",
    title: "Benar / Salah",
    description: "Quiz pernyataan benar atau salah",
    template: `Buatkan 10 soal benar/salah tentang [TOPIC] untuk level [LEVEL]. Gunakan bahasa [LANGUAGE].
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON:
[
  {
    "question": "Matahari berputar mengelilingi Bumi.",
    "options": ["Benar", "Salah"],
    "correct_answer": "Salah",
    "explanation": "Bumi yang mengelilingi Matahari, bukan sebaliknya."
  }
]

ATURAN: "options" harus ["Benar","Salah"]. "correct_answer" identik salah satu opsi. Sertakan "explanation". Minimum 5 item. Topik: [TOPIC]`,
  },
  {
    id: "qz-math",
    topic: "Matematika",
    type: "quiz",
    title: "Soal & Pemecahan",
    description: "Quiz pemecahan soal matematika",
    template: `Buatkan 8 soal matematika tentang [TOPIC] untuk level [LEVEL]. Gunakan bahasa [LANGUAGE].
Mulai dari soal mudah dan tingkatkan kesulitannya secara bertahap.
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON:
[
  {
    "question": "Berapakah hasil dari 15 × 12?",
    "options": ["180", "170", "175", "165"],
    "correct_answer": "180",
    "explanation": "15 × 12 = 15 × 10 + 15 × 2 = 150 + 30 = 180."
  }
]

ATURAN: "options" TEPAT 4 string. "correct_answer" identik salah satu opsi. Sertakan "explanation". Minimum 5 item. Topik: [TOPIC]`,
  },
  {
    id: "qz-reading",
    topic: "Bahasa",
    type: "quiz",
    title: "Pemahaman Bacaan",
    description: "Quiz soal pemahaman teks",
    template: `Buatkan 8 soal pemahaman bacaan tentang [TOPIC] untuk level [LEVEL]. Gunakan bahasa [LANGUAGE].
[CUSTOM_NOTE]

PENTING: Balas HANYA dengan array JSON murni. Langsung mulai dengan [ dan akhiri dengan ].

Format JSON:
[
  {
    "question": "Apa tujuan utama dari fotosintesis?",
    "options": [
      "Menghasilkan oksigen untuk respirasi",
      "Mengubah energi cahaya menjadi energi kimia berupa glukosa",
      "Menyerap air dari tanah",
      "Menghasilkan karbon dioksida"
    ],
    "correct_answer": "Mengubah energi cahaya menjadi energi kimia berupa glukosa",
    "explanation": "Fotosintesis mengubah energi cahaya matahari menjadi glukosa yang disimpan sebagai energi kimia."
  }
]

ATURAN: "options" TEPAT 4 string. "correct_answer" identik salah satu opsi. Sertakan "explanation". Minimum 5 item. Topik: [TOPIC]`,
  },
];

export function generatePrompt(
  template: string,
  topic: string,
  level: string,
  language: string = "Bahasa Indonesia",
  customNote: string = ""
): string {
  const noteSection = customNote.trim()
    ? `Catatan tambahan dari pengguna: ${customNote.trim()}`
    : "";
  return template
    .replace(/\[TOPIC\]/g, topic)
    .replace(/\[LEVEL\]/g, level)
    .replace(/\[LANGUAGE\]/g, language)
    .replace(/\[CUSTOM_NOTE\]/g, noteSection);
}
