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
22. **Anki Import** — `app/anki-import.tsx` parsing `.apkg`/`.colpkg` (100% client-side via `utils/anki-parser.ts`) atau `.txt/.tsv/.csv`; jadi StandaloneCollection + Flashcards. **Media preservation**: setiap kartu menyimpan SEMUA gambar & audio dari deck Anki, dipisah front/back. Field `Flashcard`: `image` (gambar utama depan), `audio` (audio utama depan), `images?[]` (gambar tambahan depan), `imagesBack?[]` (gambar belakang), `audios?[]` (audio tambahan depan), `audiosBack?[]` (audio belakang). Player menampilkan strip gambar horizontal + tombol "Audio 1/2/3" multi sesuai sisi yang aktif. Parser regex menangkap `<img src=...>` (quoted/unquoted), `<source>`, `<audio>`, dan `[sound:...]`.
22b. **Audio Import (Flashcard)** — `app/create-flashcard/[lessonId].tsx` punya picker audio (mp3/m4a/wav, dll) via `DocumentPicker`; file di-copy ke `documentDirectory/flashcard-audio/`; preview play via `expo-audio`; tersimpan di field `Flashcard.audio` dan diputar di flashcard player (`app/flashcard/[lessonId].tsx`) lewat tombol "Putar audio". Field `audio`/`audioUrl` juga dikenali saat JSON import.
22c. **View Card as Table (Mode Belajar)** — `app/flashcard/[lessonId].tsx` punya toggle viewMode `card`/`table`; mode tabel menampilkan semua kartu (#, Pertanyaan, Jawaban) lengkap dengan thumbnail gambar dan indikator audio.
22d. **Audio Import (Quiz)** — `app/create-quiz/[lessonId].tsx` punya picker audio via `DocumentPicker` (form baru + edit modal); file di-copy ke `documentDirectory/quiz-audio/`; preview play via `expo-audio`; tersimpan di `Quiz.audio` dan diputar di quiz player (`app/quiz/[lessonId].tsx`) lewat tombol "Putar Audio" di kartu pertanyaan. Field `audio`/`audioUrl`/`audio_url` juga dikenali saat JSON import.
22e. **Global Theme Tokens** — `constants/colors.ts` jadi single source: `Colors` (mutable, di-swap oleh `applyTheme(palette,isDark)`), `Spacing`, `Radius`, `FontSize`, plus `shadow`/`shadowSm` reactive. 4 kombinasi: light/dark × default/minimal. `ThemeContext` panggil `applyTheme` + `applyGradientsForTheme` saat user ganti mode/palet di `app/theme-settings.tsx` (Profile → Tema). Stack di-remount via `themeKey` di `_layout.tsx` supaya semua screen yang `import Colors from "@/constants/colors"` re-evaluate `StyleSheet` dengan warna baru — tanpa perlu rewrite tiap layar. Layar baru sebaiknya pakai `useColors()` + `makeStyles(c)` pattern (lihat `theme-settings.tsx`).
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
- **PWA web build**: `@expo-google-fonts/inter@0.4.2` ships without `react`/`expo-font` peer deps, so under pnpm it pulled in a duplicate `react@18.3.1` (from `activation-web-app`). That caused `Cannot read properties of null (reading 'useState')` at runtime because the React 18 dispatcher was null while the app rendered with React 19. Fixed via `pnpm.packageExtensions` in root `package.json` declaring `react` + `expo-font` as peer deps of `@expo-google-fonts/inter`, which forces it to share the app's `react@19.1.0`.
- **Onboarding skip loop**: `app/(tabs)/index.tsx` redirects to `/onboarding` whenever `getUser()` returns null (via `useFocusEffect`). The original `handleSkip` in `app/onboarding.tsx` only called `router.replace("/(tabs)")` without saving a user, so on web (where there is no native back-stack to break the cycle) Skip → home → no user → guide → Skip → … looped indefinitely. `handleSkip` now persists a default `Learner` user before navigating, satisfying the home gate and ending the loop. The guide is also shown again only when there is genuinely no user — re-entering it after onboarding triggers `getUser() != null` → `router.replace("/(tabs)")` immediately.
- **Vercel deployment** (`vercel.json` at repo root): Vercel's default install command is `npm install`, which fails on this monorepo with `EUNSUPPORTEDPROTOCOL: "workspace:*"` because npm doesn't understand the pnpm workspace protocol. The root `vercel.json` overrides install to `pnpm install --frozen-lockfile`, build to `pnpm --filter @workspace/web run build`, and points `outputDirectory` at `artifacts/web/dist`. SPA rewrites send all paths to `/index.html` so Expo Router client-side routes work; service-worker (`/sw.js`) is served with `no-cache` headers and the hashed `_expo/static/*` assets get a 1-year immutable cache.
- **Course bundle ZIP export** (`utils/zip-handler.ts` + `components/CourseBundleModal.tsx`): The original "Bagikan Bundle Kursus" flow exports a single `.json` file with all images/files inlined as base64 inside `assetData`. For courses with many media assets that file balloons (~33% bigger than the raw bytes). The modal now offers a JSON ↔ ZIP toggle. ZIP mode (`exportCoursePackAsZip`) writes binary assets to `assets/<index>_<name>` inside the zip and rewrites `assetData[uri]` to `"@zip:assets/<file>"` placeholders inside `data.json`. The importer in `(tabs)/profile.tsx` detects `.zip` files via `looksLikeZipDocument()` and calls `extractCoursePackFromZipUri()` which reverses the placeholder swap (reads each zip entry back to base64) before handing the resulting CoursePack to the existing `extractAssetsFromPack()` → `importCourse()` pipeline — so the round-trip is lossless and existing signed-bundle verification still works.

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
