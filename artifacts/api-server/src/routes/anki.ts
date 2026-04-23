import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import JSZip from "jszip";
import initSqlJs, { type Database } from "sql.js";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

let SQLPromise: ReturnType<typeof initSqlJs> | null = null;
function getSQL() {
  if (!SQLPromise) {
    SQLPromise = initSqlJs({});
  }
  return SQLPromise;
}

interface ParsedCard {
  id: string;
  front: string;
  back: string;
  tags: string;
  deckName: string;
}

function stripHtml(input: string): string {
  if (!input) return "";
  let s = input.replace(/<br\s*\/?>(?=)/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/\[sound:[^\]]+\]/g, "");
  return s.trim();
}

function splitFields(flds: string): string[] {
  // Anki separates fields with U+001F
  return flds.split("\x1f");
}

function parseDecksJson(json: string): Map<number, string> {
  const map = new Map<number, string>();
  try {
    const obj = JSON.parse(json) as Record<string, { id?: number; name?: string }>;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      const id = v?.id ?? Number(key);
      const name = v?.name ?? "Default";
      if (typeof id === "number") map.set(id, name);
    }
  } catch {
    // ignore
  }
  return map;
}

function readNotesFromDb(
  db: Database,
  decks: Map<number, string>,
): ParsedCard[] {
  const out: ParsedCard[] = [];

  // Map note.id -> deckId via cards table
  const noteDeck = new Map<number, number>();
  try {
    const cardRes = db.exec("SELECT nid, did FROM cards");
    if (cardRes.length > 0) {
      for (const row of cardRes[0]!.values) {
        const nid = Number(row[0]);
        const did = Number(row[1]);
        if (!noteDeck.has(nid)) noteDeck.set(nid, did);
      }
    }
  } catch {
    // ignore
  }

  const noteRes = db.exec("SELECT id, flds, tags FROM notes");
  if (noteRes.length === 0) return out;
  for (const row of noteRes[0]!.values) {
    const id = String(row[0]);
    const flds = String(row[1] ?? "");
    const tags = String(row[2] ?? "").trim();
    const fields = splitFields(flds).map(stripHtml).filter((s) => s.length > 0);
    if (fields.length < 2) continue;
    const front = fields[0]!;
    const back = fields.slice(1).join("\n\n");
    const did = noteDeck.get(Number(id));
    const deckName = (did != null ? decks.get(did) : undefined) ?? "Imported";
    out.push({ id, front, back, tags, deckName });
  }
  return out;
}

router.post(
  "/anki/parse",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const buffer = req.file?.buffer;
      if (!buffer) {
        return res.status(400).json({ error: "No file uploaded (field 'file' required)" });
      }

      const SQL = await getSQL();
      const zip = await JSZip.loadAsync(buffer);

      // Look for collection.anki21 (newer) first, then collection.anki2
      let dbFile = zip.file("collection.anki21");
      if (!dbFile) dbFile = zip.file("collection.anki2");
      if (!dbFile) {
        return res.status(400).json({
          error: "Not a valid .apkg file (collection database not found)",
        });
      }
      const dbData = await dbFile.async("uint8array");
      const db = new SQL.Database(dbData);

      // Read decks from col table
      let decks = new Map<number, string>();
      try {
        const colRes = db.exec("SELECT decks FROM col LIMIT 1");
        if (colRes.length > 0 && colRes[0]!.values[0]) {
          decks = parseDecksJson(String(colRes[0]!.values[0][0] ?? "{}"));
        }
      } catch {
        // ignore
      }

      const cards = readNotesFromDb(db, decks);
      db.close();

      // Group by deck
      const byDeck = new Map<string, ParsedCard[]>();
      for (const c of cards) {
        if (!byDeck.has(c.deckName)) byDeck.set(c.deckName, []);
        byDeck.get(c.deckName)!.push(c);
      }
      const decksOut = Array.from(byDeck.entries()).map(([name, items]) => ({
        name,
        cards: items.map((c) => ({
          front: c.front,
          back: c.back,
          tags: c.tags,
        })),
      }));

      req.log.info({ totalCards: cards.length, decks: decksOut.length }, "Anki parsed");

      return res.json({
        totalCards: cards.length,
        decks: decksOut,
      });
    } catch (err) {
      req.log.error({ err }, "Anki parse failed");
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to parse .apkg",
      });
    }
  },
);

export default router;
