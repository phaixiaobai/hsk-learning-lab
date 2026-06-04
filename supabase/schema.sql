-- ================================================================
-- HSK Lab — Supabase Schema
-- ================================================================
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ================================================================

-- ── Support Tickets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category         TEXT NOT NULL,
  message          TEXT NOT NULL,
  page_url         TEXT,
  browser_info     TEXT,
  screenshot_base64 TEXT,        -- base64-encoded image (optional)
  anonymous        BOOLEAN DEFAULT true,
  status           TEXT DEFAULT 'open',   -- open | reviewing | resolved | closed
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Status check constraint
ALTER TABLE support_tickets
  ADD CONSTRAINT status_values
  CHECK (status IN ('open','reviewing','resolved','closed'));

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_tickets_status    ON support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_category  ON support_tickets (category);
CREATE INDEX IF NOT EXISTS idx_tickets_created   ON support_tickets (created_at DESC);

-- ── Quiz Feedback ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_mode   TEXT NOT NULL,     -- multiple-choice | matching | fill-blank | voice | mix
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags        TEXT[] DEFAULT '{}',
  comment     TEXT DEFAULT '',
  accuracy    SMALLINT,          -- 0–100 score from that session
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_mode     ON quiz_feedback (quiz_mode);
CREATE INDEX IF NOT EXISTS idx_feedback_created  ON quiz_feedback (created_at DESC);

-- ── Row-Level Security ────────────────────────────────────────────
-- Allow anonymous inserts (anyone can submit a ticket / feedback).
-- Reads are restricted to service-role only (admin dashboard).

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_feedback    ENABLE ROW LEVEL SECURITY;

-- Anyone can insert
CREATE POLICY "anon_insert_tickets"
  ON support_tickets FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_insert_feedback"
  ON quiz_feedback FOR INSERT TO anon WITH CHECK (true);

-- Anyone can read feedback (so community ratings are visible)
CREATE POLICY "anon_read_feedback"
  ON quiz_feedback FOR SELECT TO anon USING (true);

-- Tickets are admin-read only (no public select policy)

-- ================================================================
-- HSK Lab — Vocabulary Progression Tables
-- ================================================================

-- ── Vocab Sections ────────────────────────────────────────────────
-- Tracks chunk/section completion per anonymous session.
-- Since the app has no auth, session_id is a client-generated UUID
-- stored in localStorage under "hsk-lab:session-id".
CREATE TABLE IF NOT EXISTS vocab_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT NOT NULL,          -- client-generated UUID
  category_id  TEXT NOT NULL,          -- e.g. "food", "family"
  chunk_index  INT  NOT NULL,          -- 0-based chunk/part number
  chunk_size   SMALLINT NOT NULL,      -- 10 | 15 | 20
  seen_count   INT  NOT NULL DEFAULT 0,
  completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one row per (session, category, chunk, size)
ALTER TABLE vocab_sections
  ADD CONSTRAINT uq_vocab_section
  UNIQUE (session_id, category_id, chunk_index, chunk_size);

CREATE INDEX IF NOT EXISTS idx_vsec_session   ON vocab_sections (session_id);
CREATE INDEX IF NOT EXISTS idx_vsec_category  ON vocab_sections (category_id);
CREATE INDEX IF NOT EXISTS idx_vsec_completed ON vocab_sections (completed);

-- ── Favorite Categories ───────────────────────────────────────────
-- Stores user-pinned categories in order (position = pin order).
CREATE TABLE IF NOT EXISTS favorite_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT NOT NULL,
  category_id  TEXT NOT NULL,
  position     SMALLINT NOT NULL DEFAULT 0,  -- lower = higher priority
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE favorite_categories
  ADD CONSTRAINT uq_fav_category
  UNIQUE (session_id, category_id);

CREATE INDEX IF NOT EXISTS idx_fav_session  ON favorite_categories (session_id);
CREATE INDEX IF NOT EXISTS idx_fav_position ON favorite_categories (session_id, position);

-- ── Pronunciation History ─────────────────────────────────────────
-- Records each voice quiz attempt for analytics / spaced repetition.
CREATE TABLE IF NOT EXISTS pronunciation_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT NOT NULL,
  word_id      TEXT NOT NULL,           -- VocabItem.id
  hanzi        TEXT NOT NULL,
  transcript   TEXT NOT NULL DEFAULT '',
  score        SMALLINT NOT NULL,       -- 0–100
  grade        TEXT NOT NULL,           -- excellent|good|fair|poor|incorrect
  is_correct   BOOLEAN NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pron_session  ON pronunciation_history (session_id);
CREATE INDEX IF NOT EXISTS idx_pron_word     ON pronunciation_history (word_id);
CREATE INDEX IF NOT EXISTS idx_pron_created  ON pronunciation_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pron_correct  ON pronunciation_history (is_correct);

-- ── RLS for new tables ────────────────────────────────────────────
ALTER TABLE vocab_sections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pronunciation_history  ENABLE ROW LEVEL SECURITY;

-- Anonymous clients can insert and read their own rows (filtered by session_id in app)
CREATE POLICY "anon_insert_vocab_sections"
  ON vocab_sections FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_vocab_sections"
  ON vocab_sections FOR SELECT TO anon USING (true);

CREATE POLICY "anon_update_vocab_sections"
  ON vocab_sections FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_insert_fav_categories"
  ON favorite_categories FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_fav_categories"
  ON favorite_categories FOR SELECT TO anon USING (true);

CREATE POLICY "anon_delete_fav_categories"
  ON favorite_categories FOR DELETE TO anon USING (true);

CREATE POLICY "anon_insert_pronunciation"
  ON pronunciation_history FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_pronunciation"
  ON pronunciation_history FOR SELECT TO anon USING (true);
