/**
 * @file supabase.ts
 * @description Lightweight Supabase REST client — no npm package needed.
 *
 * Supabase exposes a standard PostgREST HTTP API. We only need INSERT and
 * SELECT, so this thin wrapper covers everything without adding ~200 KB of
 * the official SDK to the bundle.
 *
 * Setup
 * ─────
 * 1. Create a project at https://supabase.com
 * 2. Copy the "Project URL" and "anon public" key from Settings → API
 * 3. Add them to your .env file (see .env.example)
 * 4. Run the SQL in supabase/schema.sql in the Supabase SQL editor
 *
 * The app degrades gracefully when Supabase is not configured:
 * submissions are saved to localStorage instead and the widget still works.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

// ── Core HTTP helpers ─────────────────────────────────────────────────────

function headers() {
  return {
    apikey: SUPABASE_KEY!,
    Authorization: `Bearer ${SUPABASE_KEY!}`,
    'Content-Type': 'application/json',
  };
}

async function post<T>(table: string, row: T): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase insert failed (${res.status}): ${text}`);
  }
}

async function get<T>(
  table: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const qs = new URLSearchParams({ ...params, select: '*' }).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { ...headers(), Prefer: 'return=representation' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase select failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T[]>;
}

// ── Typed API surface ─────────────────────────────────────────────────────

export interface SupportTicketRow {
  category: string;
  message: string;
  page_url: string;
  browser_info: string;
  screenshot_base64?: string;
  anonymous: boolean;
  created_at?: string;
}

export interface FeedbackRow {
  quiz_mode: string;
  rating: number;
  tags: string[];
  comment: string;
  accuracy: number;
  created_at?: string;
}

// ── Feedback row types ────────────────────────────────────────────────────

export interface VoiceScoreFeedbackRow {
  session_id:   string;
  word_id:      string;
  hanzi:        string;
  pinyin:       string;
  transcript:   string;
  system_score: number;
  /** 'accurate' | 'too_high' | 'too_low' */
  verdict:      string;
}

export interface SentenceQualityReportRow {
  session_id: string;
  word_id:    string;
  hanzi:      string;
  sentence:   string;
  /** 'unnatural' | 'wrong_word' | 'confusing' | 'grammar_error' | 'other' */
  issue:      string;
}

export interface WordDifficultyReportRow {
  session_id: string;
  word_id:    string;
  hanzi:      string;
  pinyin:     string;
  level:      number;
  /** 'too_hard' | 'confusing_meaning' | 'confusing_pronunciation' | 'wrong_level' | 'other' */
  issue:      string;
}

// Admin read types
export interface AdminVoiceFeedbackRow extends VoiceScoreFeedbackRow {
  id: string; created_at: string;
}
export interface AdminSentenceReportRow extends SentenceQualityReportRow {
  id: string; created_at: string;
}
export interface AdminWordDifficultyRow extends WordDifficultyReportRow {
  id: string; created_at: string;
}
export interface AdminQuizFeedbackRow extends FeedbackRow {
  id: string; created_at: string; accuracy: number;
}

// ── Additional row types ──────────────────────────────────────────────────

export interface VocabSectionRow {
  session_id:  string;
  category_id: string;
  chunk_index: number;
  chunk_size:  number;
  seen_count:  number;
  completed:   boolean;
  completed_at?: string | null;
  updated_at?: string;
}

export interface FavoriteCategoryRow {
  session_id:  string;
  category_id: string;
  position:    number;
}

export interface PronunciationHistoryRow {
  session_id: string;
  word_id:    string;
  hanzi:      string;
  transcript: string;
  score:      number;
  grade:      string;
  is_correct: boolean;
}

// ── Upsert helper (INSERT … ON CONFLICT DO UPDATE) ────────────────────────

async function upsert<T>(table: string, row: T, onConflict: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      ...headers(),
      Prefer: `resolution=merge-duplicates,return=minimal`,
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert failed on ${table} (${res.status}): ${text}`);
  }
  void onConflict; // column hint conveyed via Prefer header
}

// ── Delete helper ─────────────────────────────────────────────────────────

async function del(table: string, params: Record<string, string>): Promise<void> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: 'DELETE',
    headers: { ...headers(), Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase delete failed on ${table} (${res.status}): ${text}`);
  }
}

export const db = {
  /** Insert a support ticket. */
  insertTicket: (row: SupportTicketRow) =>
    post('support_tickets', { ...row, created_at: new Date().toISOString() }),

  /** Insert quiz feedback — used by QuizResult and SupportWidget. */
  insertFeedback: (row: FeedbackRow) =>
    post('quiz_feedback', { ...row, created_at: new Date().toISOString() }),

  /** Fetch recent community feedback for a quiz mode. */
  getFeedback: (quizMode: string, limit = 10) =>
    get<FeedbackRow>('quiz_feedback', {
      quiz_mode: `eq.${quizMode}`,
      order: 'created_at.desc',
      limit: String(limit),
    }),

  // ── Vocab sections ──────────────────────────────────────────────

  /** Upsert a chunk progress record (create or update seen_count/completed). */
  upsertVocabSection: (row: VocabSectionRow) =>
    upsert('vocab_sections', { ...row, updated_at: new Date().toISOString() },
      'session_id,category_id,chunk_index,chunk_size'),

  /** Fetch all section rows for a session. */
  getVocabSections: (sessionId: string) =>
    get<VocabSectionRow>('vocab_sections', { session_id: `eq.${sessionId}` }),

  // ── Favorite categories ─────────────────────────────────────────

  /** Upsert a favorited category (create or update position). */
  upsertFavoriteCategory: (row: FavoriteCategoryRow) =>
    upsert('favorite_categories', { ...row }, 'session_id,category_id'),

  /** Remove a favorited category. */
  deleteFavoriteCategory: (sessionId: string, categoryId: string) =>
    del('favorite_categories', {
      session_id:  `eq.${sessionId}`,
      category_id: `eq.${categoryId}`,
    }),

  /** Fetch all favorited categories for a session (ordered by position). */
  getFavoriteCategories: (sessionId: string) =>
    get<FavoriteCategoryRow>('favorite_categories', {
      session_id: `eq.${sessionId}`,
      order:      'position.asc',
    }),

  // ── Pronunciation history ───────────────────────────────────────

  /** Record a voice quiz attempt. */
  insertPronunciation: (row: PronunciationHistoryRow) =>
    post('pronunciation_history', { ...row, created_at: new Date().toISOString() }),

  /** Fetch pronunciation history for a session (most recent first). */
  getPronunciationHistory: (sessionId: string, limit = 50) =>
    get<PronunciationHistoryRow>('pronunciation_history', {
      session_id: `eq.${sessionId}`,
      order:      'created_at.desc',
      limit:      String(limit),
    }),

  /** Fetch pronunciation attempts for a specific word. */
  getWordPronunciationHistory: (sessionId: string, wordId: string) =>
    get<PronunciationHistoryRow>('pronunciation_history', {
      session_id: `eq.${sessionId}`,
      word_id:    `eq.${wordId}`,
      order:      'created_at.desc',
    }),

  // ── Feedback: voice score accuracy ─────────────────────────────

  /** Record whether the user thought the voice score was fair. */
  insertVoiceScoreFeedback: (row: VoiceScoreFeedbackRow) =>
    post('voice_score_feedback', { ...row, created_at: new Date().toISOString() }),

  // ── Feedback: sentence quality ──────────────────────────────────

  /** Flag a fill-blank sentence as unnatural or wrong. */
  insertSentenceQualityReport: (row: SentenceQualityReportRow) =>
    post('sentence_quality_report', { ...row, created_at: new Date().toISOString() }),

  // ── Feedback: word difficulty ───────────────────────────────────

  /** Mark a word as too hard or confusing. */
  insertWordDifficultyReport: (row: WordDifficultyReportRow) =>
    post('word_difficulty_report', { ...row, created_at: new Date().toISOString() }),

  // ── Quiz session feedback → Supabase ───────────────────────────

  /** Save post-quiz star rating to Supabase (mirrors localStorage save). */
  insertQuizFeedback: (row: FeedbackRow) =>
    post('quiz_feedback', { ...row, created_at: new Date().toISOString() }),

  // ── Admin reads ─────────────────────────────────────────────────

  getAdminVoiceFeedback: (limit = 200) =>
    get<AdminVoiceFeedbackRow>('voice_score_feedback', {
      order: 'created_at.desc', limit: String(limit),
    }),

  getAdminSentenceReports: (limit = 200) =>
    get<AdminSentenceReportRow>('sentence_quality_report', {
      order: 'created_at.desc', limit: String(limit),
    }),

  getAdminWordDifficultyReports: (limit = 200) =>
    get<AdminWordDifficultyRow>('word_difficulty_report', {
      order: 'created_at.desc', limit: String(limit),
    }),

  getAdminQuizFeedback: (limit = 200) =>
    get<AdminQuizFeedbackRow>('quiz_feedback', {
      order: 'created_at.desc', limit: String(limit),
    }),
};
