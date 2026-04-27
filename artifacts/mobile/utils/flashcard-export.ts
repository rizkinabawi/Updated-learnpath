import { printHtml } from "./print-compat";
import { FlashcardItem, QuizItem } from "./json-export";

export type PdfTheme = "classic" | "zen" | "minimalist" | "elegant";

const THEME_DATA = {
  classic: { primary: "#2c5282", secondary: "#718096", accent: "#f8fafc", font: "sans-serif" },
  zen: { primary: "#276749", secondary: "#4a5568", accent: "#f0fff4", font: "'Segoe UI', Roboto, sans-serif" },
  minimalist: { primary: "#1a202c", secondary: "#718096", accent: "#ffffff", font: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  elegant: { primary: "#744210", secondary: "#975a16", accent: "#fffaf0", font: "'Georgia', serif" }
};

function generateQRCodeImg(id: string, type: "flashcard" | "quiz"): string {
  const deepLink = `learningpath://${type}/${id}`;
  const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(deepLink)}&size=80x80&bgcolor=ffffff&color=2c5282&margin=0`;
  return `
    <div style="text-align: center; border: 1px solid #e2e8f0; padding: 4px; border-radius: 8px; background: #fff;">
      <img src="${apiUrl}" alt="QR" width="60" height="60" />
      <p style="margin: 2px 0 0 0; font-size: 6pt; color: #94a3b8; font-weight: bold;">SCAN TO OPEN</p>
    </div>
  `;
}

function truncateAnswer(text: string, charLimit: number = 220): string {
  if (!text) return "";
  const cleanText = text.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
  if (cleanText.length <= charLimit) return cleanText;
  const sub = cleanText.substring(0, charLimit);
  const lastFullStop = Math.max(sub.lastIndexOf(". "), sub.lastIndexOf("。"));
  if (lastFullStop > charLimit * 0.5) return cleanText.substring(0, lastFullStop + 1) + " ...";
  const lastComma = Math.max(sub.lastIndexOf(", "), sub.lastIndexOf("; "), sub.lastIndexOf("、"));
  if (lastComma > charLimit * 0.7) return cleanText.substring(0, lastComma + 1) + " ...";
  const lastSpace = sub.lastIndexOf(" ");
  return cleanText.substring(0, lastSpace > 0 ? lastSpace : charLimit) + " ...";
}

/**
 * Smartly truncates text to a word limit, focusing on the area around a keyword.
 */
function smartTruncate(text: string, keyword: string, wordLimit: number = 12): string {
  if (!text) return "";
  const clean = text.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
  const words = clean.split(" ");
  if (words.length <= wordLimit) return clean;

  // Try to find the keyword or its parts
  const kw = keyword.replace(/<[^>]*>?/gm, "").trim().toLowerCase();
  const keywordIdx = words.findIndex(w => w.toLowerCase().includes(kw));
  
  const start = keywordIdx === -1 ? 0 : Math.max(0, keywordIdx - Math.floor(wordLimit / 2));
  const end = Math.min(words.length, start + wordLimit);
  
  let result = words.slice(start, end).join(" ");
  if (start > 0) result = "... " + result;
  if (end < words.length) result = result + " ...";
  
  return result;
}

export async function exportFlashcardsToPDF(
  topic: string, 
  items: FlashcardItem[], 
  id?: string,
  startIndex: number = 1,
  theme: PdfTheme = "classic"
): Promise<void> {
  const t = THEME_DATA[theme] || THEME_DATA.classic;
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
  const qrHtml = id ? generateQRCodeImg(id, "flashcard") : "";

  const chunks: FlashcardItem[][] = [];
  const chunkSize = 9;
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  const pagesHtml = chunks.map((chunk, pageIdx) => {
    const tableRows = chunk.map((item, i) => {
      const globalIdx = pageIdx * chunkSize + i;
      let q = item.question.replace(/<[^>]*>?/gm, "").trim();
      let a = item.answer.replace(/<[^>]*>?/gm, "").trim();
      if (q.match(/{{(.*?)}}/)) q = q.replace(/{{.*?}}/g, "[ ... ]");

      return `
        <tr style="background: #ffffff">
          <td class="num-cell" rowspan="2">${startIndex + globalIdx}</td>
          <td class="q-cell"><strong>${q}</strong></td>
        </tr>
        <tr style="background: #fcfcfc">
          <td class="a-cell">${truncateAnswer(a)}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="page-wrap" style="${pageIdx > 0 ? 'page-break-before: always;' : ''}">
        <div class="header">
          <div>
            <p class="header-meta">Flashcard Study Workbook • Halaman ${pageIdx + 1}</p>
            <h1 class="header-title">${topic}</h1>
            <p style="margin: 4px 0 0 0; color: #4a5568; font-size: 8pt;">Dibuat pada ${dateStr}</p>
          </div>
          ${qrHtml}
        </div>
        <table>
          <tbody>${tableRows}</tbody>
        </table>
        <div style="margin-top: 15px; font-weight: bold; color: #718096; font-family: 'Georgia', serif; font-style: italic; font-size: 8pt; text-align: right;">
          Digitally Signed by Rizki Nabawi
        </div>
      </div>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; }
          @page { margin: 10mm; }
          body { 
            font-family: ${t.font}; 
            padding: 0; margin: 0; width: 100%;
            color: #1a202c; background: white; line-height: 1.4;
            -webkit-print-color-adjust: exact;
          }
          .watermark {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120pt; color: rgba(0, 0, 0, 0.02); font-weight: 900; z-index: -100; pointer-events: none; white-space: nowrap;
          }
          .page-wrap { padding: 5mm; min-height: 100%; }
          .header { 
            border-bottom: 2px solid ${t.primary}; padding-bottom: 8px; margin-bottom: 15px; 
            display: flex; justify-content: space-between; align-items: flex-end; width: 100%;
          }
          .header-title { margin: 0; color: ${t.primary}; font-size: 18pt; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
          .header-meta { margin: 0; color: ${t.secondary}; font-size: 9pt; font-weight: 600; text-transform: uppercase; }
          
          table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 5px; border: 1px solid #e2e8f0; }
          td { vertical-align: top; word-wrap: break-word; padding: 10px; border: 1px solid #e2e8f0; }
          .num-cell { width: 45px; background: ${t.accent}; text-align: center; font-weight: bold; color: ${t.secondary}; vertical-align: middle; border-right: 2px solid ${t.primary}; font-size: 9pt; }
          .q-cell { width: auto; font-size: 11pt; font-weight: 700; color: #2d3748; background: #fff; }
          .a-cell { width: auto; font-size: 9.5pt; color: #4a5568; background: #fafafa; font-style: italic; border-top: 1px dashed #cbd5e1; }
          
          .footer { 
            position: fixed; bottom: 0; left: 0; right: 0;
            text-align: center; font-size: 8pt; color: #a0aec0; padding: 8px 0; border-top: 1px solid #edf2f7;
          }
        </style>
      </head>
      <body>
        <div class="watermark">LEARNPATH</div>
        ${pagesHtml}
        <div class="footer">
          LearnPath Flashcard System • ${topic} • Certified by Rizki Nabawi
        </div>
      </body>
    </html>
  `;

  try {
    const filename = `LEARNPATH-PDF-EKSPORT-${topic.replace(/\s+/g, "-").toUpperCase()}-${(id || "WORKBOOK").substring(0, 6).toUpperCase()}`;
    await printHtml(html, { filename, dialogTitle: `Unduh PDF Flashcard - ${topic}` });
  } catch (error) {
    console.error("PDF Export Error:", error);
  }
}

/**
 * Helper: Generate Answer Sheet and Answer Key HTML
 */
function generateExamExtras(items: QuizItem[]): string {
  const answerSheetHtml = `
    <div class="batch-section" style="page-break-before: always;">
      <div class="header" style="border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 20px;">
        <h1 style="font-size: 16pt;">LEMBAR JAWABAN (ANSWER SHEET)</h1>
      </div>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
        ${items.map((_, i) => `
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11pt; padding: 5px; border-bottom: 1px solid #f1f5f9;">
            <b style="width: 25px;">${i + 1}.</b>
            <span style="border: 1px solid #000; width: 18px; height: 18px; display: inline-block; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt;">A</span>
            <span style="border: 1px solid #000; width: 18px; height: 18px; display: inline-block; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt;">B</span>
            <span style="border: 1px solid #000; width: 18px; height: 18px; display: inline-block; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt;">C</span>
            <span style="border: 1px solid #000; width: 18px; height: 18px; display: inline-block; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt;">D</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  const answerKeyHtml = `
    <div class="batch-section" style="page-break-before: always;">
      <div class="header" style="border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 20px;">
        <h1 style="font-size: 16pt;">KUNCI JAWABAN (ANSWER KEY)</h1>
      </div>
      <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px;">
        ${items.map((item, i) => {
          const rawCorrect = (item.correct_answer || (item as any).answer || "").trim();
          let correctIdx = -1;

          // 1. Cek jika jawaban adalah huruf tunggal (A, B, C, D)
          if (/^[A-D]$/i.test(rawCorrect)) {
            correctIdx = rawCorrect.toUpperCase().charCodeAt(0) - 65;
          } 
          // 2. Cek jika jawaban adalah angka index (0, 1, 2, 3)
          else if (/^[0-3]$/.test(rawCorrect)) {
            correctIdx = parseInt(rawCorrect, 10);
          }
          // 3. Jika bukan huruf/angka, lakukan pencocokan teks lengkap
          else {
            const cleanCorrect = rawCorrect.replace(/<[^>]*>?/gm, "").toLowerCase();
            correctIdx = item.options.findIndex(opt => {
              const cleanOpt = (opt || "").replace(/<[^>]*>?/gm, "").trim().toLowerCase();
              return cleanOpt === cleanCorrect;
            });
          }

          const letter = correctIdx >= 0 && correctIdx < item.options.length 
            ? String.fromCharCode(65 + correctIdx) 
            : "?";

          return `
            <div style="font-size: 12pt; padding: 5px; border-bottom: 1px solid #edf2f7;">
              <b>${i + 1}.</b> <span style="color: #2c5282; font-weight: 900;">${letter}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  return answerSheetHtml + answerKeyHtml;
}

export async function exportQuizzesToPDF(topic: string, items: QuizItem[], id?: string, shuffle: boolean = false): Promise<void> {
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
  const qrHtml = id ? generateQRCodeImg(id, "quiz") : "";

  let displayItems = [...items];
  if (shuffle) {
    displayItems = displayItems.sort(() => Math.random() - 0.5).map(item => ({
      ...item,
      options: [...item.options].sort(() => Math.random() - 0.5)
    }));
  }

  const quizBlocks = displayItems.map((item, i) => `
    <div class="quiz-item">
      <div class="question">
        <span class="q-num">${i + 1}.</span> ${item.question.replace(/<[^>]*>?/gm, "").trim()}
      </div>
      <div class="options-grid">
        ${item.options.map((opt, idx) => `
          <div class="option">
            <span class="opt-label">${String.fromCharCode(65 + idx)}</span> ${opt.replace(/<[^>]*>?/gm, "").trim()}
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  const extrasHtml = generateExamExtras(items);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { margin: 0; size: A4; }
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 12mm; color: #1a202c; position: relative; line-height: 1.3; background: white; }
          body::before {
            content: "LEARNPATH EXAM";
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 100pt; color: rgba(255, 0, 0, 0.03); font-weight: 900; z-index: -1; pointer-events: none; white-space: nowrap;
          }
          .header { text-align: left; margin-bottom: 15px; border-bottom: 1px solid #000; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end; }
          .header h1 { margin: 0; font-size: 14pt; text-transform: uppercase; }
          .header p { margin: 0; font-size: 9pt; color: #4a5568; }
          .quiz-item { margin-bottom: 12px; page-break-inside: avoid; border-bottom: 0.5px solid #f1f5f9; padding-bottom: 8px; }
          .question { font-size: 11pt; font-weight: 700; margin-bottom: 5px; }
          .q-num { color: #000; margin-right: 5px; font-size: 11pt; }
          .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 15px; padding-left: 15px; }
          .option { font-size: 11pt; display: flex; align-items: flex-start; }
          .opt-label { font-weight: 700; color: #000; margin-right: 8px; width: 20px; }
          .footer { margin-top: 15px; text-align: center; font-size: 7pt; color: #cbd5e1; border-top: 1px solid #f1f5f9; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div><p>LEARNPATH EXAM PAPER — SIMULATION ${shuffle ? '(SET SHUFFLE)' : ''}</p><h1>${topic.toUpperCase()}</h1><p>Generated on ${dateStr}</p></div>
          ${qrHtml}
        </div>
        <div class="content">${quizBlocks}</div>
        <div class="footer">Simulasi Ujian LearnPath • Certified by Rizki Nabawi</div>
        ${extrasHtml}
      </body>
    </html>
  `;

  try {
    await printHtml(html, { dialogTitle: `Exam Paper - ${topic}` });
  } catch (error) {
    console.error("Quiz PDF Export Error:", error);
  }
}

/**
 * Batch Export Flashcards into a single PDF
 */
export async function exportMultipleFlashcardsToPDF(
  title: string,
  batches: { topic: string; items: FlashcardItem[]; startIndex: number }[]
): Promise<void> {
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });

  const contentHtml = batches.map(batch => {
    const tableRows = batch.items.map((item, i) => `
      <tr style="background: ${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="width: 40%; font-weight: 600; color: #1a202c;">
          ${item.question.replace(/<[^>]*>?/gm, "").trim()}
        </td>
        <td style="color: #4a5568;">
          ${truncateAnswer(item.answer)}
        </td>
      </tr>
    `).join("");

    return `
      <div class="batch-section" style="page-break-after: always; margin-bottom: 25px;">
        <div class="header" style="text-align: left; border-bottom: 1.5px solid #2c5282; padding-bottom: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-end;">
          <h1 style="margin: 0; color: #2c5282; font-size: 16pt; text-transform: uppercase;">${batch.topic}</h1>
          <p style="margin: 0; color: #718096; font-size: 9pt; font-weight: bold;">Flashcard Module · ${title}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
          <thead>
            <tr><th style="background: #2c5282; color: white; text-align: left; padding: 8px 12px; font-size: 9pt; text-transform: uppercase;">Question</th>
            <th style="background: #2c5282; color: white; text-align: left; padding: 8px 12px; font-size: 9pt; text-transform: uppercase;">Answer (Sample)</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { margin: 0; size: A4; }
      body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 12mm; color: #2d3748; position: relative; background: white; line-height: 1.2; }
      body::before {
        content: "LEARNPATH";
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 100pt; color: rgba(255, 0, 0, 0.05); font-weight: 900; z-index: -1; pointer-events: none; white-space: nowrap;
      }
      th { -webkit-print-color-adjust: exact; }
      tr { page-break-inside: avoid; }
      tr:nth-child(even) { background: rgba(248, 250, 252, 0.7); }
      td { vertical-align: top; word-wrap: break-word; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 10pt; }
    </style></head><body>${contentHtml}</body></html>`;

  try {
    await printHtml(html, { dialogTitle: `Batch Flashcards - ${title}` });
  } catch (e) { console.error(e); }
}

/**
 * Batch Export Quizzes into a single Exam Paper PDF
 */
export async function exportMultipleQuizzesToPDF(
  title: string, 
  batches: { topic: string; items: QuizItem[] }[],
  theme: PdfTheme = "classic"
): Promise<void> {
  const t = THEME_DATA[theme] || THEME_DATA.classic;
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });

  const contentHtml = batches.map(batch => {
    const quizBlocks = batch.items.map((item, i) => `
      <div class="quiz-item" style="margin-bottom: 15px; page-break-inside: avoid; border-bottom: 0.5px solid #f1f5f9; padding-bottom: 10px;">
        <div style="font-size: 12pt; font-weight: 700; margin-bottom: 8px;">
          <span style="color: #000; margin-right: 5px;">${i + 1}.</span> ${item.question.replace(/<[^>]*>?/gm, "").trim()}
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; padding-left: 20px;">
          ${item.options.map((opt, idx) => `
            <div style="font-size: 11pt; display: flex; align-items: flex-start;">
              <span style="font-weight: 700; color: #000; margin-right: 8px; width: 22px;">${String.fromCharCode(65 + idx)}</span> 
              ${opt.replace(/<[^>]*>?/gm, "").trim()}
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");

    return `
      <div class="batch-section" style="page-break-after: always; margin-bottom: 30px;">
        <div class="header" style="text-align: left; margin-bottom: 20px; border-bottom: 1.5px solid #000; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end;">
          <h1 style="margin: 0; font-size: 16pt; text-transform: uppercase;">EXAM: ${batch.topic}</h1>
          <p style="margin: 0; font-size: 9pt; color: #4a5568;">Generated on ${dateStr}</p>
        </div>
        <div class="content">${quizBlocks}</div>
      </div>
    `;
  }).join("");

  const allItems = batches.flatMap(b => b.items);
  const extrasHtml = generateExamExtras(allItems);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { margin: 0; size: A4; }
      body { font-family: ${t.font}; padding: 12mm; color: #1a202c; position: relative; line-height: 1.3; background: white; }
      body::before {
        content: "LEARNPATH EXAM";
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 100pt; color: rgba(0, 0, 0, 0.03); font-weight: 900; z-index: -1; pointer-events: none; white-space: nowrap;
      }
      .header { border-bottom: 2px solid ${t.primary}; padding-bottom: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
      .header h1 { margin: 0; font-size: 16pt; color: ${t.primary}; text-transform: uppercase; }
    </style></head><body>${contentHtml}${extrasHtml}</body></html>`;

  try {
    const filename = `LEARNPATH-PDF-EKSPORT-BATCH-${title.replace(/\s+/g, "-").toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await printHtml(html, { filename, dialogTitle: `Unduh Batch PDF - ${title}` });
  } catch (error) {
    console.error(error);
  }
}

/**
 * Worksheet Export: Blank column for writing practice
 */
export async function exportFlashcardWorksheetToPDF(
  topic: string, 
  items: FlashcardItem[],
  blankSide: "question" | "answer" = "answer",
  theme: PdfTheme = "classic"
): Promise<void> {
  const t = THEME_DATA[theme] || THEME_DATA.classic;
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });

  const tableRows = items.map((item, i) => {
    const qText = item.question.replace(/<[^>]*>?/gm, "").trim();
    const aText = item.answer.replace(/<[^>]*>?/gm, "").trim();
    
    return `
      <tr>
        <td class="num-cell">${i + 1}</td>
        <td style="width: 45%; vertical-align: middle;">
          ${blankSide === "question" ? '<div class="write-line"></div>' : `<b>${qText}</b>`}
        </td>
        <td style="width: 45%; vertical-align: middle;">
          ${blankSide === "answer" ? '<div class="write-line"></div>' : `<b>${aText}</b>`}
        </td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { margin: 0; size: A4; }
          body { font-family: ${t.font}; padding: 12mm; color: #2d3748; position: relative; background: white; }
          body::before {
            content: "LEARNPATH WORKBOOK";
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 80pt; color: rgba(0, 0, 0, 0.03); font-weight: 900; z-index: -1; pointer-events: none; white-space: nowrap;
          }
          .header { border-bottom: 2px solid ${t.primary}; padding-bottom: 8px; margin-bottom: 20px; text-align: left; display: flex; justify-content: space-between; align-items: flex-end; }
          .header h1 { margin: 0; font-size: 16pt; color: ${t.primary}; text-transform: uppercase; }
          .header p { margin: 0; font-size: 9pt; color: ${t.secondary}; }
          
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th { background: ${t.accent}; border: 1px solid #cbd5e1; padding: 10px; font-size: 9pt; text-transform: uppercase; color: ${t.secondary}; }
          td { border: 1px solid #cbd5e1; padding: 15px 10px; font-size: 11pt; }
          .num-cell { width: 30px; text-align: center; color: #94a3b8; font-weight: bold; font-size: 9pt; }
          .write-line { border-bottom: 1px dotted ${t.primary}; height: 20px; width: 100%; margin-top: 5px; }
          .footer { margin-top: 20px; text-align: center; font-size: 7pt; color: #94a3b8; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="header">
          <div><h1>WORKSHEET: ${topic}</h1><p>Latihlah kemampuan menulis Anda di kolom yang kosong.</p></div>
          <p>${dateStr}</p>
        </div>
        <table>
          <thead>
            <tr> <th class="num-cell">#</th> <th>Pelajaran / Soal</th> <th>Jawaban / Latihan Menulis</th> </tr>
          </thead>
          <tbody> ${tableRows} </tbody>
        </table>
        <div class="footer">LearnPath Flashcard Workbook • Certified by Rizki Nabawi</div>
      </body>
    </html>
  `;

  try {
    const filename = `LEARNPATH-PDF-EKSPORT-WORKSHEET-${topic.replace(/\s+/g, "-").toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    await printHtml(html, { filename, dialogTitle: `Unduh Worksheet - ${topic}` });
  } catch (error) {
    console.error(error);
  }
}

/**
 * Professional Course Certificate
 */
export async function exportCourseCertificate(
  userName: string, 
  courseName: string
): Promise<void> {
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { margin: 0; size: A4 landscape; }
          body { 
            font-family: 'Helvetica', 'Arial', sans-serif; 
            padding: 0; margin: 0;
            background: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .cert-border {
            width: 90%;
            height: 85%;
            border: 15px solid #2c5282;
            padding: 40px;
            position: relative;
            background: #fff;
            text-align: center;
          }
          .cert-inner-border {
            width: 100%;
            height: 100%;
            border: 2px solid #2c5282;
            padding: 20px;
            box-sizing: border-box;
          }
          .brand { font-size: 28pt; color: #2c5282; font-weight: 900; margin-bottom: 40px; letter-spacing: 2px; }
          .title { font-size: 36pt; color: #1a202c; margin-bottom: 20px; text-transform: uppercase; }
          .subtitle { font-size: 14pt; color: #718096; margin-bottom: 50px; font-style: italic; }
          .name { font-size: 42pt; color: #2c5282; font-weight: bold; border-bottom: 2px solid #e2e8f0; display: inline-block; padding: 0 40px 10px; margin-bottom: 30px; }
          .course-text { font-size: 16pt; color: #4a5568; margin-bottom: 10px; }
          .course-name { font-size: 24pt; color: #2d3748; font-weight: 800; margin-bottom: 60px; }
          
          .footer-grid { display: flex; justify-content: space-around; align-items: flex-end; margin-top: 40px; }
          .signature { width: 200px; border-top: 1.5px solid #2d3748; padding-top: 10px; font-size: 12pt; font-weight: bold; }
          .verify { font-size: 10pt; color: #718096; }
          
          .seal { 
            position: absolute; bottom: 60px; right: 60px; 
            width: 120px; height: 120px; border-radius: 60px; 
            background: #2c5282; color: #fff; 
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            font-size: 8pt; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            -webkit-print-color-adjust: exact;
          }
        </style>
      </head>
      <body>
        <div class="cert-border">
          <div class="cert-inner-border">
            <div class="brand">LEARNPATH</div>
            <div class="title">CERTIFICATE of ACHIEVEMENT</div>
            <div class="subtitle">Sertifikat ini dengan bangga dipersembahkan kepada:</div>
            <div class="name">${userName.toUpperCase()}</div>
            <div class="course-text">telah berhasil menyelesaikan kursus:</div>
            <div class="course-name">${courseName}</div>
            
            <div class="footer-grid">
              <div>
                <div class="signature">Direktur Pengajaran</div>
                <div style="font-size: 10pt; color: #718096; margin-top: 4px;">LearnPath Academy</div>
              </div>
              <div class="verify">
                Dikeluarkan pada: ${dateStr}<br/>
                ID Verifikasi: LP-${Math.random().toString(36).substr(2, 9).toUpperCase()}
              </div>
              <div>
                <div class="signature">Instruktur Utama</div>
              </div>
            </div>
            
            <div class="seal">
              <div style="font-size: 12pt;">OFFICIAL</div>
              <div>GUARANTEE</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    await printHtml(html, { dialogTitle: `Certificate - ${userName}` });
  } catch (e) { console.error(e); }
}

/**
 * Visual Progress Report PDF
 */
export async function exportProgressReport(
  userName: string, 
  stats: { totalAnswers: number; correctAnswers: number; level: number; xp: number; days: number }
): Promise<void> {
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
  const accuracy = stats.totalAnswers > 0 ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page { margin: 10mm; size: A4; }
          body { font-family: 'Helvetica', 'Arial', sans-serif; color: #2d3748; line-height: 1.5; }
          .header { border-bottom: 2px solid #2c5282; padding-bottom: 10px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
          .header h1 { margin: 0; color: #2c5282; font-size: 22pt; }
          
          .profile { background: #f8fafc; border-radius: 16px; padding: 20px; margin-bottom: 30px; border: 1px solid #e2e8f0; }
          .profile h2 { margin: 0 0 10px 0; font-size: 16pt; color: #2c5282; }
          
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; text-align: center; }
          .card-val { font-size: 24pt; font-weight: bold; color: #2c5282; }
          .card-lbl { font-size: 10pt; color: #718096; text-transform: uppercase; font-weight: bold; }
          
          .chart-area { margin-top: 40px; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; text-align: center; }
          .progress-bar { width: 100%; height: 30px; background: #edf2f7; border-radius: 15px; overflow: hidden; margin: 15px 0; }
          .progress-fill { height: 100%; background: #2c5282; border-radius: 15px; }
          
          .footer { margin-top: 60px; text-align: center; font-size: 9pt; color: #a0aec0; border-top: 1px solid #e2e8f0; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LEARNPATH PROGRESS REPORT</h1>
          <p style="font-size: 10pt; font-weight: bold;">${dateStr}</p>
        </div>
        
        <div class="profile">
          <h2>STUDENT: ${userName}</h2>
          <p>Laporan ini merangkum pencapaian belajar Anda sejauh ini.</p>
        </div>
        
        <div class="grid">
          <div class="card"><div class="card-val">${stats.xp}</div><div class="card-lbl">Total Experience (XP)</div></div>
          <div class="card"><div class="card-val">${accuracy}%</div><div class="card-lbl">Akurasi Jawaban</div></div>
          <div class="card"><div class="card-val">${stats.totalAnswers}</div><div class="card-lbl">Total Latihan</div></div>
          <div class="card"><div class="card-val">${stats.days}</div><div class="card-lbl">Hari Beruntun (Streak)</div></div>
        </div>
        
        <div class="chart-area">
          <div class="card-lbl">Level Kemajuan (Level ${stats.level})</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(100, (stats.xp % 1000) / 10)}%"></div>
          </div>
          <p style="font-size: 9pt; color: #718096;">Dibutuhkan ${1000 - (stats.xp % 1000)} XP lagi untuk mencapai Level ${stats.level + 1}</p>
        </div>
        
        <div class="footer">LearnPath Academy • Progress Report Verified by Rizki Nabawi</div>
      </body>
    </html>
  `;

  try {
    await printHtml(html, { dialogTitle: `Progress Report - ${userName}` });
  } catch (e) { console.error(e); }
}

/**
 * Structured Table Export: # | Kanji/Word | Meaning/Explanation
 * Optimized for word lists where repetitions occur.
 */
export async function exportFlashcardsToTablePDF(
  topic: string, 
  items: FlashcardItem[], 
  id?: string,
  isConcise: boolean = false,
  theme: PdfTheme = "classic"
): Promise<void> {
  const t = THEME_DATA[theme] || THEME_DATA.classic;
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
  const qrHtml = id ? generateQRCodeImg(id, "flashcard") : "";

  const tableRows = items.map((item, i) => {
    let q = item.question.replace(/<[^>]*>?/gm, "").trim();
    let a = item.answer.replace(/<[^>]*>?/gm, "").trim();
    
    // Cloze Deletion Detection: {{text}} -> [...]
    if (q.match(/{{(.*?)}}/)) {
      q = q.replace(/{{.*?}}/g, "[ ... ]");
    }

    const displayAnswer = isConcise ? smartTruncate(a, q, 12) : truncateAnswer(a, 350);

    return `
      <tr>
        <td class="num-col">${i + 1}</td>
        <td class="word-col"><strong>${q}</strong></td>
        <td class="info-col">${displayAnswer}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; }
          @page { margin: 10mm; }
          body { 
            font-family: ${t.font}; 
            padding: 0; margin: 0; width: 100%;
            color: #2d3748; background: white; line-height: 1.6;
            -webkit-print-color-adjust: exact;
          }
          .watermark {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120pt; color: rgba(0, 0, 0, 0.015); font-weight: 900; z-index: -100; pointer-events: none; white-space: nowrap;
          }
          .header { 
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: 4px solid ${t.primary}; padding-bottom: 15px; margin-bottom: 30px;
            width: 100%;
          }
          .header h1 { margin: 0; color: ${t.primary}; font-size: 24pt; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; }
          .header p { margin: 0; color: ${t.secondary}; font-size: 10pt; font-weight: bold; text-transform: uppercase; }
          
          table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #e2e8f0; }
          thead { display: table-header-group; }
          tr { page-break-inside: auto; }
          th { 
            background: ${t.primary}; color: white; text-align: left; 
            padding: 12px 15px; font-size: 10pt; text-transform: uppercase; letter-spacing: 1px;
            border: 1px solid ${t.primary};
          }
          td { 
            vertical-align: top; word-wrap: break-word; 
            padding: 18px 15px; border: 1px solid #e2e8f0; font-size: 11pt;
          }
          tr:nth-child(even) { background: ${t.accent}; }
          
          .num-col { width: 8%; text-align: center; color: #cbd5e1; font-weight: 900; font-size: 10pt; border-right: 2px solid #edf2f7; }
          .word-col { width: 27%; color: #1a202c; font-weight: 700; font-size: 12pt; border-right: 1px solid #edf2f7; }
          .info-col { width: 65%; color: #4a5568; font-style: normal; }
          
          .footer { 
            position: fixed; bottom: 0; left: 0; right: 0;
            text-align: center; font-size: 8pt; color: #cbd5e1; padding: 10px 0; border-top: 1px solid #f1f5f9;
          }
        </style>
      </head>
      <body>
        <div class="watermark">LEARNPATH</div>
        <div class="header">
          <div><p>Vocab & Kanji Summary Table</p><h1>${topic}</h1><p style="margin-top:5px; text-transform:none; color:#a0aec0;">${dateStr}</p></div>
          ${qrHtml}
        </div>
        
        <table>
          <thead>
            <tr>
              <th class="num-col">#</th>
              <th class="word-col">Kata / Kanji</th>
              <th class="info-col">Arti / Penjelasan</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          LearnPath Flashcard Table System — Certified by Rizki Nabawi
        </div>
      </body>
    </html>
  `;

  try {
    const filename = `LEARNPATH-PDF-EKSPORT-TABEL-${topic.replace(/\s+/g, "-").toUpperCase()}-${(id || "TABLE").substring(0, 6).toUpperCase()}`;
    await printHtml(html, { filename, dialogTitle: `Unduh Tabel Flashcard - ${topic}` });
  } catch (error) {
    console.error("Table PDF Export Error:", error);
  }
}
