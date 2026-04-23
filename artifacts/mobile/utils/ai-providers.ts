import type { AIProvider } from "./ai-keys";

export interface AIResponse {
  content: string;
  usedModel?: string;
}

// ─── Constants ───────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2_000; // 2s, 4s

// Gemini free-tier fallback chain (ordered by quota friendliness)
const GEMINI_FALLBACK_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

// ─── Helpers ─────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ─── OpenAI ──────────────────────────────────────────────────────
async function callOpenAIOnce(
  prompt: string,
  apiKey: string,
  model: string
): Promise<AIResponse> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "Return ONLY valid JSON. No explanation. No markdown. No extra text outside JSON.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
        }),
      }
    );
  } catch (netErr: any) {
    if (netErr?.name === "AbortError") {
      throw new Error("Request ke OpenAI timeout (30 detik). Coba lagi atau ganti model yang lebih kecil.");
    }
    throw new Error("Tidak bisa terhubung ke OpenAI. Periksa koneksi internet.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    const rawMsg: string = err?.error?.message ?? "";
    const code: string = err?.error?.code ?? "";

    if (res.status === 401) {
      throw new Error("API key OpenAI tidak valid atau sudah kadaluarsa.");
    }
    if (res.status === 429) {
      if (
        rawMsg.toLowerCase().includes("quota") ||
        rawMsg.toLowerCase().includes("billing") ||
        code === "insufficient_quota"
      ) {
        throw new Error(
          "Kuota/kredit OpenAI habis. Tambah kredit di platform.openai.com/settings/billing."
        );
      }
      // Retryable rate limit — caller handles backoff
      const err429 = new Error(`Rate limit OpenAI. Tunggu sebentar lalu coba lagi.${rawMsg ? `\n\nDetail: ${rawMsg}` : ""}`) as any;
      err429.retryable = true;
      throw err429;
    }
    if (res.status === 402 || res.status === 403) {
      throw new Error("Akses ditolak OpenAI. Periksa kuota atau izin API key.");
    }
    if (res.status === 404) {
      throw new Error(
        `Model "${model}" tidak ditemukan di OpenAI. Ganti model di pengaturan AI Keys.`
      );
    }
    if (res.status === 400) {
      throw new Error(`Request tidak valid: ${rawMsg || "bad request"}`);
    }
    throw new Error(rawMsg || `OpenAI error ${res.status}`);
  }

  const data = await res.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Respons OpenAI kosong atau tidak terduga.");
  return { content, usedModel: model };
}

export async function callOpenAI(
  prompt: string,
  apiKey: string,
  model = "gpt-4o-mini"
): Promise<AIResponse> {
  let lastErr: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callOpenAIOnce(prompt, apiKey, model);
    } catch (e: any) {
      lastErr = e;
      if (e?.retryable && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ─── Gemini ──────────────────────────────────────────────────────
async function callGeminiOnce(
  prompt: string,
  apiKey: string,
  model: string
): Promise<AIResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Return ONLY valid JSON. No explanation. No markdown. No extra text outside JSON.\n\n" +
                  prompt,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.7 },
      }),
    });
  } catch (netErr: any) {
    if (netErr?.name === "AbortError") {
      throw new Error("Request ke Gemini timeout (30 detik). Coba lagi atau ganti model yang lebih kecil.");
    }
    throw new Error("Tidak bisa terhubung ke Gemini. Periksa koneksi internet.");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    const rawMsg: string = err?.error?.message ?? "";
    const status: string = err?.error?.status ?? "";

    if (res.status === 400) {
      if (rawMsg.includes("API_KEY") || rawMsg.toLowerCase().includes("api key")) {
        throw new Error("API key Gemini tidak valid.");
      }
      if (rawMsg.toLowerCase().includes("not found") || status === "NOT_FOUND") {
        const e404 = new Error(`Model "${model}" tidak ditemukan.`) as any;
        e404.modelNotFound = true;
        throw e404;
      }
      throw new Error(`Request tidak valid: ${rawMsg || "bad request"}`);
    }
    if (res.status === 403) {
      throw new Error(
        "API key Gemini tidak memiliki izin. Pastikan Gemini API sudah diaktifkan di Google Cloud Console."
      );
    }
    if (res.status === 429) {
      // Quota exhausted → try next fallback model
      if (
        status === "RESOURCE_EXHAUSTED" ||
        rawMsg.toLowerCase().includes("quota") ||
        rawMsg.toLowerCase().includes("exhausted")
      ) {
        const eQuota = new Error(`Kuota model "${model}" habis.`) as any;
        eQuota.quotaExhausted = true;
        eQuota.exhaustedModel = model;
        throw eQuota;
      }
      // Generic rate limit → retryable
      const eRate = new Error(`Rate limit Gemini. Tunggu sebentar lalu coba lagi.${rawMsg ? `\n\nDetail: ${rawMsg}` : ""}`) as any;
      eRate.retryable = true;
      throw eRate;
    }
    if (res.status === 404) {
      const e404 = new Error(`Model "${model}" tidak ditemukan di Gemini.`) as any;
      e404.modelNotFound = true;
      throw e404;
    }
    throw new Error(rawMsg || `Gemini error ${res.status}`);
  }

  const data = await res.json() as any;

  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(
      `Konten diblokir Gemini (${blockReason}). Coba ubah topik atau catatan tambahan.`
    );
  }

  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason === "RECITATION") {
    throw new Error("Respons Gemini diblokir (RECITATION). Coba topik yang berbeda.");
  }
  if (finishReason === "SAFETY") {
    throw new Error("Respons Gemini diblokir oleh filter keamanan. Coba ubah topik.");
  }

  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Respons Gemini kosong. Coba lagi atau ganti model.");
  return { content: text, usedModel: model };
}

export async function callGemini(
  prompt: string,
  apiKey: string,
  model = "gemini-2.0-flash"
): Promise<AIResponse> {
  // Build fallback chain starting from requested model
  const startIdx = GEMINI_FALLBACK_MODELS.indexOf(model);
  const chain = startIdx >= 0
    ? GEMINI_FALLBACK_MODELS.slice(startIdx)
    : [model, ...GEMINI_FALLBACK_MODELS];

  let lastErr: any;

  for (const currentModel of chain) {
    let retryCount = 0;
    while (retryCount <= MAX_RETRIES) {
      try {
        const result = await callGeminiOnce(prompt, apiKey, currentModel);
        return result;
      } catch (e: any) {
        lastErr = e;

        // Quota exhausted → break inner loop, try next model in chain
        if (e?.quotaExhausted || e?.modelNotFound) {
          break;
        }

        // Retryable (rate limit) → exponential backoff
        if (e?.retryable && retryCount < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount);
          await sleep(delay);
          retryCount++;
          continue;
        }

        // Non-retryable error → rethrow immediately
        throw e;
      }
    }
  }

  // All models in the chain exhausted
  throw new Error(
    `Kuota Gemini habis untuk semua model (${chain.join(", ")}).\n\nTunggu besok atau tambah API key lain.`
  );
}

// ─── Unified entry point ─────────────────────────────────────────
export async function callAI(
  provider: AIProvider,
  prompt: string,
  apiKey: string,
  model?: string
): Promise<AIResponse> {
  switch (provider) {
    case "openai":
      return callOpenAI(prompt, apiKey, model);
    case "gemini":
      return callGemini(prompt, apiKey, model);
    default:
      throw new Error("Provider tidak dikenal.");
  }
}
