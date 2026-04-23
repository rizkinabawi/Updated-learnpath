import { Platform } from "react-native";
import { getUser, getStats, getProgress, getLearningPaths, getFlashcards, getQuizzes } from "./storage";
import { classifyAllItems } from "./difficulty-classifier";

function buildBarChart(data: { label: string; value: number; max: number; color: string }[]): string {
  const W = 520;
  const H = 160;
  const barW = Math.min(48, (W - 40) / data.length - 8);
  const gap = (W - 40 - data.length * barW) / (data.length - 1 || 1);
  const maxVal = Math.max(...data.map((d) => d.max), 1);

  const bars = data.map((d, i) => {
    const barH = Math.max(4, Math.round((d.value / maxVal) * (H - 40)));
    const x = 20 + i * (barW + gap);
    const y = H - 28 - barH;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="6" fill="${d.color}" opacity="0.9"/>
      <text x="${x + barW / 2}" y="${H - 30 + 16}" text-anchor="middle" font-size="9" fill="#64748B" font-family="system-ui,sans-serif">${d.label}</text>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="${d.color}" font-weight="bold" font-family="system-ui,sans-serif">${d.value}</text>
    `;
  }).join("");

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

function buildDonutChart(correct: number, wrong: number): string {
  const total = correct + wrong || 1;
  const pct = correct / total;
  const r = 50;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * r;
  const correctArc = circumference * pct;
  const wrongArc = circumference * (1 - pct);

  return `<svg width="140" height="140" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="18"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#38BDF8" stroke-width="18"
      stroke-dasharray="${correctArc} ${wrongArc}"
      stroke-dashoffset="${circumference * 0.25}"
      stroke-linecap="round"/>
    ${wrong > 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FF6B6B" stroke-width="18"
      stroke-dasharray="${wrongArc} ${correctArc}"
      stroke-dashoffset="${circumference * 0.25 - correctArc}"
      stroke-linecap="round"/>` : ""}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="20" font-weight="900" fill="#0A2540" font-family="system-ui,sans-serif">${Math.round(pct * 100)}%</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" fill="#64748B" font-family="system-ui,sans-serif">AKURASI</text>
  </svg>`;
}

function buildActivityHeatmap(progress: { timestamp: string; isCorrect: boolean }[]): string {
  const last14: { date: string; correct: number; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayProg = progress.filter((p) => p.timestamp.slice(0, 10) === key);
    last14.push({ date: key, correct: dayProg.filter((p) => p.isCorrect).length, total: dayProg.length });
  }

  const cells = last14.map((day, i) => {
    const acc = day.total === 0 ? -1 : day.correct / day.total;
    const color = day.total === 0 ? "#E2E8F0" : acc >= 0.7 ? "#38BDF8" : acc >= 0.4 ? "#FF9500" : "#FF6B6B";
    const label = new Date(day.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    const x = 10 + i * 37;
    return `
      <rect x="${x}" y="10" width="30" height="30" rx="6" fill="${color}"/>
      <text x="${x + 15}" y="52" text-anchor="middle" font-size="7.5" fill="#94A3B8" font-family="system-ui,sans-serif">${label}</text>
      ${day.total > 0 ? `<text x="${x + 15}" y="28" text-anchor="middle" font-size="9" fill="white" font-weight="bold" font-family="system-ui,sans-serif">${day.total}</text>` : ""}
    `;
  }).join("");

  return `<svg width="530" height="65" xmlns="http://www.w3.org/2000/svg">${cells}</svg>`;
}

export async function generateReportHTML(): Promise<string> {
  const [user, stats, progress, paths, flashcards, quizzes, difficulty] = await Promise.all([
    getUser(), getStats(), getProgress(), getLearningPaths(),
    getFlashcards(), getQuizzes(), classifyAllItems(),
  ]);

  const accuracy = stats && stats.totalAnswers > 0 ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0;
  const wrong = (stats?.totalAnswers ?? 0) - (stats?.correctAnswers ?? 0);
  const dateStr = new Date().toLocaleDateString("id-ID", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Weekly accuracy data (last 7 days)
  const weeklyData: { label: string; value: number; max: number; color: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayP = progress.filter((p) => p.timestamp.slice(0, 10) === key);
    const dayCorrect = dayP.filter((p) => p.isCorrect).length;
    const dayAcc = dayP.length > 0 ? Math.round((dayCorrect / dayP.length) * 100) : 0;
    weeklyData.push({
      label: d.toLocaleDateString("id-ID", { weekday: "short" }),
      value: dayAcc,
      max: 100,
      color: dayAcc >= 70 ? "#38BDF8" : dayAcc >= 40 ? "#FF9500" : dayAcc === 0 ? "#E2E8F0" : "#FF6B6B",
    });
  }

  const diffBarData = [
    { label: "Mudah", value: difficulty.mudah.length, max: difficulty.total || 1, color: "#38BDF8" },
    { label: "Sedang", value: difficulty.sedang.length, max: difficulty.total || 1, color: "#FF9500" },
    { label: "Susah", value: difficulty.susah.length, max: difficulty.total || 1, color: "#FF6B6B" },
  ];

  const donutSVG = buildDonutChart(stats?.correctAnswers ?? 0, wrong);
  const weeklyBarSVG = buildBarChart(weeklyData);
  const diffBarSVG = buildBarChart(diffBarData);
  const heatmapSVG = buildActivityHeatmap(progress);

  const recentRows = [...progress]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15)
    .map((p, i) => `
      <tr style="background:${i % 2 === 0 ? "#F8FAFC" : "#fff"}">
        <td style="padding:10px 14px;font-size:12px;color:#64748B">${new Date(p.timestamp).toLocaleDateString("id-ID")}</td>
        <td style="padding:10px 14px;font-size:12px;color:#0A2540">${p.flashcardId ? "Flashcard" : "Quiz"}</td>
        <td style="padding:10px 14px;text-align:center">
          <span style="background:${p.isCorrect ? "#D1FAE5" : "#FEE2E2"};color:${p.isCorrect ? "#059669" : "#DC2626"};padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700">
            ${p.isCorrect ? "✓ Benar" : "✗ Salah"}
          </span>
        </td>
      </tr>
    `).join("");

  const susahRows = difficulty.susah.slice(0, 10).map((item, i) => `
    <tr style="background:${i % 2 === 0 ? "#FFF5F5" : "#fff"}">
      <td style="padding:10px 14px;font-size:12px;color:#0A2540;max-width:260px">${item.question.substring(0, 80)}${item.question.length > 80 ? "..." : ""}</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;color:#64748B">${item.type === "flashcard" ? "Kartu" : "Quiz"}</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;font-weight:700;color:#DC2626">${item.accuracy}%</td>
      <td style="padding:10px 14px;text-align:center;font-size:12px;color:#64748B">${item.attempts}x</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Laporan Belajar — ${user?.name ?? "Learner"}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #F8FAFC; color: #0A2540; }
    .page { max-width: 680px; margin: 0 auto; background: #fff; }
    .header { background: linear-gradient(135deg, #0A1628 0%, #1A3066 100%); padding: 40px 36px; position: relative; overflow: hidden; }
    .header::before { content: ''; position: absolute; width: 240px; height: 240px; border-radius: 50%; background: rgba(74,158,255,0.1); top: -60px; right: -60px; }
    .header::after { content: ''; position: absolute; width: 140px; height: 140px; border-radius: 50%; background: rgba(10,211,193,0.08); bottom: -40px; left: 40px; }
    .header-title { font-size: 28px; font-weight: 900; color: #fff; letter-spacing: -0.5px; margin-bottom: 4px; }
    .header-sub { font-size: 13px; color: rgba(255,255,255,0.55); font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
    .header-meta { font-size: 12px; color: rgba(255,255,255,0.5); }
    .header-name { font-size: 16px; color: rgba(255,255,255,0.9); font-weight: 700; margin-bottom: 4px; }
    .body { padding: 28px 36px; }
    .section { margin-bottom: 28px; }
    .section-title { font-size: 14px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #E2E8F0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .kpi { background: #F8FAFC; border-radius: 14px; padding: 16px; text-align: center; border: 1px solid #E2E8F0; }
    .kpi-val { font-size: 26px; font-weight: 900; margin-bottom: 4px; }
    .kpi-lbl { font-size: 10px; color: #94A3B8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-row { display: flex; align-items: center; gap: 28px; }
    .chart-card { background: #F8FAFC; border-radius: 16px; padding: 20px; border: 1px solid #E2E8F0; }
    .chart-title { font-size: 12px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0; }
    thead { background: #0A2540; }
    thead th { padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.75); text-transform: uppercase; letter-spacing: 0.5px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .diff-pills { display: flex; gap: 10px; flex-wrap: wrap; }
    .diff-pill { padding: 8px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
    .footer { padding: 24px 36px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; }
    .footer-brand { font-size: 12px; font-weight: 700; color: #94A3B8; }
    .footer-date { font-size: 11px; color: #CBD5E1; }
  </style>
</head>
<body>
<div class="page">
  <!-- HEADER -->
  <div class="header">
    <div class="header-sub">Laporan Perkembangan Belajar</div>
    <div class="header-name">${user?.name ?? "Learner"}</div>
    <div class="header-title">Progress Report</div>
    <div class="header-meta">${dateStr} &nbsp;·&nbsp; ${user?.topic ?? "—"} &nbsp;·&nbsp; Level ${user?.level ?? "—"}</div>
  </div>

  <div class="body">
    <!-- KPI TILES -->
    <div class="section">
      <div class="section-title">Ringkasan Utama</div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-val" style="color:#4A9EFF">${accuracy}%</div><div class="kpi-lbl">Akurasi</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#38BDF8">${stats?.correctAnswers ?? 0}</div><div class="kpi-lbl">Benar</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#FF6B6B">${wrong}</div><div class="kpi-lbl">Salah</div></div>
        <div class="kpi"><div class="kpi-val" style="color:#FF9500">${stats?.streak ?? 0}</div><div class="kpi-lbl">Streak</div></div>
      </div>
    </div>

    <!-- SUMMARY WITH DONUT -->
    <div class="section">
      <div class="section-title">Akurasi & Konten</div>
      <div class="summary-row">
        <div>${donutSVG}</div>
        <div style="flex:1">
          <div class="chart-card" style="margin-bottom:10px">
            <div class="chart-title">Konten Tersedia</div>
            <div style="display:flex;gap:20px;flex-wrap:wrap">
              <div><span style="font-size:20px;font-weight:900;color:#4A9EFF">${paths.length}</span><br/><span style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase">Kursus</span></div>
              <div><span style="font-size:20px;font-weight:900;color:#38BDF8">${flashcards.length}</span><br/><span style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase">Flashcard</span></div>
              <div><span style="font-size:20px;font-weight:900;color:#FF9500">${quizzes.length}</span><br/><span style="font-size:10px;color:#94A3B8;font-weight:700;text-transform:uppercase">Soal Quiz</span></div>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-title">Target Belajar</div>
            <div style="font-size:13px;font-weight:700;color:#0A2540">${user?.goal ?? "—"}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- WEEKLY ACCURACY CHART -->
    <div class="section">
      <div class="section-title">Akurasi 7 Hari Terakhir (%)</div>
      <div class="chart-card">${weeklyBarSVG}</div>
    </div>

    <!-- ACTIVITY HEATMAP -->
    <div class="section">
      <div class="section-title">Aktivitas 14 Hari Terakhir</div>
      <div class="chart-card">
        ${heatmapSVG}
        <div style="display:flex;gap:16px;margin-top:10px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px"><div style="width:12px;height:12px;border-radius:3px;background:#38BDF8"></div><span style="font-size:10px;color:#94A3B8;font-weight:600">≥70% benar</span></div>
          <div style="display:flex;align-items:center;gap:6px"><div style="width:12px;height:12px;border-radius:3px;background:#FF9500"></div><span style="font-size:10px;color:#94A3B8;font-weight:600">40–69% benar</span></div>
          <div style="display:flex;align-items:center;gap:6px"><div style="width:12px;height:12px;border-radius:3px;background:#FF6B6B"></div><span style="font-size:10px;color:#94A3B8;font-weight:600">&lt;40% benar</span></div>
          <div style="display:flex;align-items:center;gap:6px"><div style="width:12px;height:12px;border-radius:3px;background:#E2E8F0"></div><span style="font-size:10px;color:#94A3B8;font-weight:600">Tidak ada aktivitas</span></div>
        </div>
      </div>
    </div>

    <!-- DIFFICULTY BREAKDOWN -->
    <div class="section">
      <div class="section-title">Klasifikasi Soal berdasarkan Performa</div>
      <div class="chart-card" style="margin-bottom:14px">
        ${diffBarSVG}
        <div class="diff-pills" style="margin-top:12px">
          <div class="diff-pill" style="background:#D1FAE5;color:#059669">✓ ${difficulty.mudah.length} Mudah</div>
          <div class="diff-pill" style="background:#FEF3C7;color:#B45309">◐ ${difficulty.sedang.length} Sedang</div>
          <div class="diff-pill" style="background:#FEE2E2;color:#DC2626">✗ ${difficulty.susah.length} Susah</div>
        </div>
      </div>
      ${difficulty.susah.length > 0 ? `
      <div style="margin-top:14px">
        <div style="font-size:11px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">⚠ Soal yang Perlu Diperhatikan</div>
        <table>
          <thead><tr>
            <th>Pertanyaan</th><th style="text-align:center">Tipe</th><th style="text-align:center">Akurasi</th><th style="text-align:center">Attempt</th>
          </tr></thead>
          <tbody>${susahRows}</tbody>
        </table>
      </div>` : `<div style="text-align:center;padding:20px;color:#38BDF8;font-weight:700">🎉 Tidak ada soal sulit — performa sangat baik!</div>`}
    </div>

    <!-- RECENT ACTIVITY TABLE -->
    ${recentRows ? `<div class="section">
      <div class="section-title">Aktivitas Terbaru</div>
      <table>
        <thead><tr><th>Tanggal</th><th>Tipe</th><th style="text-align:center">Hasil</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>` : ""}
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-brand">Mobile Learning App · Laporan Otomatis</div>
    <div class="footer-date">Digenerate: ${dateStr}</div>
  </div>
</div>
</body>
</html>`;
}
