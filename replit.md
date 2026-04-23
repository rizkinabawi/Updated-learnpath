# LearningPath App

Aplikasi belajar mobile (Expo React Native) — cloned dari https://github.com/rizkinabawi/LearningPath-v2.

## Architecture

### Artifacts
- **`artifacts/mobile`** — Expo SDK 54 app (native build via Expo Go QR), preview path: `/`
- **`artifacts/web`** — Web build of the same Expo app (via `expo export --platform web`), preview path: `/web/`. Shares 100% of source with mobile.
- **`artifacts/api-server`** — Express API server (Anki .apkg parser), preview path: `/api`
- **`artifacts/mockup-sandbox`** — Vite design sandbox, preview path: `/__mockup`

### Mobile + Web Shared Codebase
The web artifact does NOT have its own source code. Its `package.json` simply runs `expo start --web` (dev) and `expo export --platform web` (build) from `artifacts/mobile/`. To make modules web-safe:
- Use `Component.web.tsx` shadow files for native-only modules (e.g. `AdBanner.web.tsx` returns `null` because `react-native-google-mobile-ads` is native-only).
- Always check `Platform.OS === "web"` before using native APIs.

### Stack
- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Mobile App Stack
- **Expo SDK 54** + **Expo Router v6** (file-based routing)
- **React Native StyleSheet** (styling — NO NativeWind/TailwindCSS)
- **@expo/vector-icons** Feather icons
- **lucide-react-native** (juga digunakan di beberapa komponen)
- **AsyncStorage** (semua data lokal — tidak ada backend)
- **expo-file-system**, **expo-document-picker**, **expo-sharing**, **expo-print**
- **jszip** (zip export)
- **expo-clipboard** (copy to clipboard)

## Key Features
1. **Onboarding** — wizard multi-step saat pertama kali buka
2. **Learning Path** — hierarki Path → Module → Lesson
3. **Flashcard Player** — flip card, tandai tahu/tidak tahu
4. **Quiz Player** — pilihan ganda, tracking skor
5. **Create Flashcard** — input manual flashcard per lesson
6. **Create Quiz** — input manual quiz per lesson
7. **Notes** — catatan per lesson
8. **Study Material** — materi belajar (text/html/file) per lesson
9. **Prompt Builder** — generate AI prompt untuk buat soal, dengan JSON export/zip
10. **Mistakes Review** — review ulang jawaban yang salah
11. **Progress Dashboard** — statistik, streak, akurasi, difficulty classifier
12. **Report Generator** — export laporan belajar
13. **UI Language Switching** — toggle Indonesian/English via `contexts/LanguageContext.tsx` + `utils/i18n.ts`; persisted in AsyncStorage; toggle di tab Profile
14. **Dark Mode** — via `contexts/ThemeContext.tsx` + `constants/dark-colors.ts`
15. **Pomodoro Timer** — timer belajar
16. **Daily Challenge** — tantangan harian
17. **Bookmarks** — simpan flashcard/quiz favorit
18. **Session History** — riwayat sesi belajar
19. **Pack Manager** — kelola pack flashcard
20. **Image Manager** — kelola gambar
21. **Import Roadmap** — import learning roadmap
22. **Anki Import** — `app/anki-import.tsx` parsing `.apkg`/`.colpkg` (server-side via `/api/anki/parse`) atau `.txt/.tsv/.csv` (client-side); jadi StandaloneCollection + Flashcards
23. **Material/Note Fullview** — tap kartu pada lesson buka `app/study-material/view/[matId].tsx` & `app/notes/view/[noteId].tsx` dengan navigasi prev/next antar item dalam lesson yang sama; tombol "Edit" kembali ke list dengan param `openEditId` untuk auto-open editor
24. **Canvas-style Image Attachments** — field opsional `images?: string[]` di `Note` & `StudyMaterial`; editor menyediakan ImagePicker multi-select; gambar di-copy ke `documentDirectory/notes/` & `documentDirectory/study-materials/`; ditampilkan di fullview dengan tap-to-zoom modal

## File Structure (Mobile)
```
artifacts/mobile/
  app/
    _layout.tsx                    # Root layout (fonts, providers, splash)
    onboarding.tsx                 # Multi-step wizard onboarding
    mistakes-review.tsx            # Review jawaban salah
    pomodoro.tsx                   # Pomodoro timer
    bookmarks.tsx                  # Bookmark items
    daily-challenge.tsx            # Daily challenge
    session-history.tsx            # Riwayat sesi
    edit-profile.tsx               # Edit profil
    about-developer.tsx            # Info developer
    import-roadmap.tsx             # Import roadmap
    image-manager.tsx              # Image manager
    pack-manager.tsx               # Pack manager
    (tabs)/
      _layout.tsx                  # Tab bar (Home, Belajar, Latihan, Progress, Menu)
      index.tsx                    # Dashboard (stats, tips, quick access)
      learn.tsx                    # Learning Path CRUD manager
      practice.tsx                 # Practice hub (flashcard & quiz selection)
      progress.tsx                 # Progress stats + PromptBuilder + AI prompts
      profile.tsx                  # Profil user, edit, share, export, reset
    course/[pathId].tsx            # Course detail
    flashcard/[lessonId].tsx       # Flashcard player
    quiz/[lessonId].tsx            # Quiz player
    flashcard/browse-all.tsx       # Browse semua flashcard
    quiz/browse-all.tsx            # Browse semua quiz
    create-flashcard/[lessonId].tsx # Input manual flashcard
    create-quiz/[lessonId].tsx      # Input manual quiz
    notes/[lessonId].tsx           # Catatan per lesson
    study-material/[lessonId].tsx  # Materi belajar per lesson
  components/
    AchievementPopup.tsx
    AdBanner.tsx
    Button.tsx
    Card.tsx
    CourseBundleModal.tsx
    ErrorBoundary.tsx
    ErrorFallback.tsx
    KeyboardAwareScrollViewCompat.tsx
    ProgressBar.tsx
    PromptBuilder.tsx              # AI prompt generator + JSON/ZIP export
    QuickAddFlashcardModal.tsx
    QuickAddQuizModal.tsx
    Toast.tsx                      # Global toast notifications
  constants/
    colors.ts                      # Design tokens (flat color palette)
    dark-colors.ts                 # Dark mode colors
  context/
    OnboardingContext.tsx
  contexts/
    LanguageContext.tsx            # i18n (ID/EN)
    ThemeContext.tsx               # Dark/light mode
  hooks/
    useColors.ts                   # Returns Colors object
  utils/
    storage.ts                     # AsyncStorage helpers + type definitions
    prompt-templates.ts            # AI prompt templates
    difficulty-classifier.ts       # Klasifikasi kesulitan soal
    report-generator.ts            # Generate HTML report
    json-export.ts                 # Export JSON (share/clipboard)
    zip-handler.ts                 # ZIP export
    notifications.ts               # Push notifications
    safe-share.ts                  # Safe share helper
    fs-compat.ts                   # expo-file-system compat layer (web-safe)
    bundle-assets.ts               # Bundle assets helper
    i18n.ts                        # Translation strings
  babel.config.js
  metro.config.js
  tsconfig.json
  app.json
```

## Development Notes
- **TIDAK menggunakan NativeWind/TailwindCSS** — murni React Native StyleSheet
- **TIDAK ada global.css** — tidak diperlukan
- Routing: Expo Router v6 file-based
- `@/` alias → `artifacts/mobile/`
- Onboarding redirect: jika tidak ada user di AsyncStorage → `/onboarding`
- Icons: Feather dari `@expo/vector-icons`
- Data: hanya AsyncStorage, tidak ada API/database
- `utils/fs-compat.ts`: web-safe wrapper untuk expo-file-system (Platform check)

## Monorepo Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── mobile/             # Expo React Native app
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```
