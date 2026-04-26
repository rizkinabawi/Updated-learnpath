import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { FlashcardItem, QuizItem } from "./json-export";

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

/**
 * Memotong jawaban panjang menjadi maksimal 'limit' sampel.
 * @param startIndex Indeks awal baris yang dianggap sebagai 'jawaban' (default 1 untuk skip Kanji).
 */
function truncateAnswer(text: string, limit: number = 5, startIndex: number = 1): string {
  if (!text) return "";
  
  const cleanText = text.replace(/<[^>]*>?/gm, "").trim();
  const parts = cleanText.split(/\n|\. /).filter(p => p.trim().length > 0);
  
  // Jika parts sangat sedikit, jangan dipotong agar tidak kosong
  if (parts.length <= startIndex) return cleanText;
  
  // Ambil mulai dari startIndex, maksimal 'limit' sampel
  const samples = parts.slice(startIndex, startIndex + limit);
  const result = samples.join(". ");
  
  return result + (parts.length > startIndex + limit ? "..." : "");
}

export async function exportFlashcardsToPDF(
  topic: string, 
  items: FlashcardItem[], 
  id?: string,
  startIndex: number = 1
): Promise<void> {
  const dateStr = new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" });
  const qrHtml = id ? generateQRCodeImg(id, "flashcard") : "";

  const tableRows = items.map((item, i) => {
    let q = item.question.replace(/<[^>]*>?/gm, "").trim();
    let a = item.answer.replace(/<[^>]*>?/gm, "").trim();

    // Cloze Deletion Detection: {{text}} -> [...]
    const clozeMatch = q.match(/{{(.*?)}}/);
    if (clozeMatch) {
      q = q.replace(/{{.*?}}/g, "[ ... ]");
    }

    return `
      <tr style="background: ${i % 2 === 0 ? "#ffffff" : "#f8fafc"}">
        <td style="width: 40%; font-weight: 600; color: #1a202c;">${q}</td>
        <td style="color: #4a5568;">${truncateAnswer(item.answer, 5, startIndex)}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            margin: 0;
            size: A4;
          }
          body { 
            font-family: 'Helvetica', 'Arial', sans-serif; 
            padding: 12mm; 
            color: #2d3748;
            position: relative;
            background: white;
            line-height: 1.2;
          }
          /* Watermark Extra Large di tengah halaman */
          body::before {
            content: "LEARNPATH";
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 100pt;
            color: rgba(255, 0, 0, 0.05);
            font-weight: 900;
            z-index: -1;
            pointer-events: none;
            white-space: nowrap;
          }
          .header { text-align: left; margin-bottom: 20px; border-bottom: 1.5px solid #2c5282; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end; }
          .header h1 { margin: 0; color: #2c5282; font-size: 16pt; text-transform: uppercase; }
          .header p { margin: 0; color: #718096; font-size: 9pt; font-weight: bold; }
          
          table { width: 100%; border-collapse: collapse; table-layout: fixed; background: transparent; }
          th { 
            background: #2c5282; 
            color: white; 
            text-align: left; 
            padding: 8px 12px; 
            font-size: 9pt; 
            text-transform: uppercase; 
            -webkit-print-color-adjust: exact;
          }
          tr { 
            page-break-inside: avoid;
            break-inside: avoid;
            background: transparent !important;
          }
          tr:nth-child(even) {
            background: rgba(248, 250, 252, 0.7) !important;
          }
          td { 
            vertical-align: top; 
            word-wrap: break-word; 
            padding: 8px 12px; 
            border-bottom: 1px solid #e2e8f0; 
            font-size: 10pt;
          }
          .footer { 
            margin-top: 15px; 
            text-align: center; 
            font-size: 7pt; 
            color: #cbd5e1; 
            border-top: 1px solid #e2e8f0; 
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div><p>Flashcard Study Module</p><h1>${topic}</h1><p>Generated on ${dateStr}</p></div>
          ${qrHtml}
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="width: 40%">Question</th>
              <th>Answer (Sample)</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by Mobile Learning App - Clean Text Version
        </div>
      </body>
    </html>
  `;

  try {
    if (Platform.OS === "web") {
      // Untuk web, kita print langsung
      await Print.printAsync({ html });
    } else {
      // Untuk mobile, kita buat file PDF lalu buka dialog sharing
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Unduh PDF Flashcard - ${topic}`,
        UTI: "com.adobe.pdf"
      });
    }
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
        <div class="footer">Simulasi Ujian LearnPath - Kerjakan dengan jujur.</div>
        ${extrasHtml}
      </body>
    </html>
  `;

  try {
    if (Platform.OS === "web") {
      await Print.printAsync({ html });
    } else {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Exam Paper - ${topic}`, UTI: "com.adobe.pdf" });
    }
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
          ${truncateAnswer(item.answer, 5, batch.startIndex)}
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
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Batch Flashcards - ${title}`, UTI: "com.adobe.pdf" });
  } catch (e) { console.error(e); }
}

/**
 * Batch Export Quizzes into a single Exam Paper PDF
 */
export async function exportMultipleQuizzesToPDF(
  title: string,
  batches: { topic: string; items: QuizItem[] }[]
): Promise<void> {
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
      body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 12mm; color: #1a202c; position: relative; line-height: 1.3; background: white; }
      body::before {
        content: "LEARNPATH EXAM";
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 100pt; color: rgba(255, 0, 0, 0.03); font-weight: 900; z-index: -1; pointer-events: none; white-space: nowrap;
      }
    </style></head><body>${contentHtml}${extrasHtml}</body></html>`;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Batch Exam - ${title}`, UTI: "com.adobe.pdf" });
  } catch (e) { console.error(e); }
}

/**
 * Worksheet Export: Blank column for writing practice
 */
export async function exportFlashcardWorksheetToPDF(
  topic: string, 
  items: FlashcardItem[],
  blankSide: "question" | "answer" = "answer"
): Promise<void> {
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
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 12mm; color: #2d3748; position: relative; background: white; }
          body::before {
            content: "LEARNPATH WORKBOOK";
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 80pt; color: rgba(0, 0, 0, 0.03); font-weight: 900; z-index: -1; pointer-events: none; white-space: nowrap;
          }
          .header { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 20px; text-align: left; display: flex; justify-content: space-between; align-items: flex-end; }
          .header h1 { margin: 0; font-size: 16pt; text-transform: uppercase; }
          .header p { margin: 0; font-size: 9pt; color: #718096; }
          
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th { background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px; font-size: 9pt; text-transform: uppercase; color: #475569; }
          td { border: 1px solid #cbd5e1; padding: 15px 10px; font-size: 11pt; }
          .num-cell { width: 30px; text-align: center; color: #94a3b8; font-weight: bold; font-size: 9pt; }
          .write-line { border-bottom: 1px dotted #94a3b8; height: 20px; width: 100%; margin-top: 5px; }
          .footer { margin-top: 20px; text-align: center; font-size: 7pt; color: #94a3b8; }
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
        <div class="footer">LearnPath Flashcard Workbook - Practice makes perfect.</div>
      </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Worksheet - ${topic}` });
  } catch (e) { console.error(e); }
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
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Certificate - ${userName}`, UTI: "com.adobe.pdf" });
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
          @page { margin: 15mm; size: A4; }
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
        
        <div class="footer">LearnPath Academy - Teruslah belajar untuk masa depan yang lebih cerah.</div>
      </body>
    </html>
  `;

  try {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `Progress Report - ${userName}`, UTI: "com.adobe.pdf" });
  } catch (e) { console.error(e); }
}
