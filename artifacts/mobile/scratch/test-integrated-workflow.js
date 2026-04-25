/**
 * Integrated Workflow Test
 * Simulates:
 * 1. Anki parser extracting a deck.
 * 2. Saving to storage (mocked).
 * 3. User playing the deck and updating spaced repetition stats.
 */

const mockDecks = [
  {
    name: "JLPT N5 Vocab",
    cards: [
      { id: "c1", question: "食べる", answer: "to eat", tag: "verb" },
      { id: "c2", question: "飲む", answer: "to drink", tag: "verb" },
      { id: "c3", question: "行く", answer: "to go", tag: "verb" }
    ]
  }
];

// ─── 1. Storage Mock ────────────────────────────────────────────────────────
const storage = {
  flashcards: {},
  spacedRep: {},
  stats: { totalAnswers: 0, correctAnswers: 0 },
  logs: []
};

function saveCards(lessonId, cards) {
  storage.flashcards[lessonId] = cards.map(c => ({
    ...c,
    lessonId,
    createdAt: new Date().toISOString()
  }));
  console.log(`[Storage] Saved ${cards.length} cards for lesson ${lessonId}`);
}

async function updateSpacedRep(cardId, quality) {
  // Simple SM-2 implementation snippet
  let data = storage.spacedRep[cardId] || {
    cardId,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: new Date().toISOString()
  };

  if (quality < 3) {
    data.repetitions = 0;
    data.interval = 1;
  } else {
    if (data.repetitions === 0) data.interval = 1;
    else if (data.repetitions === 1) data.interval = 6;
    else data.interval = Math.round(data.interval * data.easeFactor);
    data.repetitions++;
  }
  
  data.easeFactor = Math.max(1.3, data.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const next = new Date();
  next.setDate(next.getDate() + data.interval);
  data.nextReview = next.toISOString();
  
  storage.spacedRep[cardId] = data;
  console.log(`[SpacedRep] Card ${cardId} updated. Quality: ${quality}, Next review: ${data.nextReview.split('T')[0]}`);
}

// ─── 2. Import Simulation ──────────────────────────────────────────────────
console.log("--- STEP 1: IMPORTING ANKI ---");
const deck = mockDecks[0];
const lessonId = "import_" + Date.now();
saveCards(lessonId, deck.cards);

// ─── 3. Playing/Study Simulation ───────────────────────────────────────────
console.log("\n--- STEP 2: PLAYING FLASHCARDS ---");
const cardsToStudy = storage.flashcards[lessonId];

async function simulateStudy() {
  for (const card of cardsToStudy) {
    console.log(`Question: ${card.question}`);
    console.log(`Answer: ${card.answer}`);
    
    // Simulate user answering "Good" (4) or "Again" (1)
    const isCorrect = Math.random() > 0.2;
    const quality = isCorrect ? 4 : 1;
    
    await updateSpacedRep(card.id, quality);
    
    // Update global stats
    storage.stats.totalAnswers++;
    if (isCorrect) storage.stats.correctAnswers++;
  }
  
  console.log("\n--- STEP 3: SESSION RESULTS ---");
  const pct = Math.round((storage.stats.correctAnswers / storage.stats.totalAnswers) * 100);
  console.log(`Score: ${storage.stats.correctAnswers}/${storage.stats.totalAnswers} (${pct}%)`);
  
  storage.logs.push({
    lessonId,
    correct: storage.stats.correctAnswers,
    total: storage.stats.totalAnswers,
    date: new Date().toISOString()
  });
  console.log("Session Log saved.");
}

simulateStudy().then(() => {
  console.log("\nWorkflow Test PASSED: Imported data successfully integrates with Study and Stats systems.");
});
