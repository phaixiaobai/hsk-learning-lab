-- ================================================================
-- HSK Lab — Feedback Schema (run AFTER schema.sql)
-- ================================================================
-- Captures 4 feedback types to improve future app versions:
--   1. voice_score_feedback    — was the pronunciation score fair?
--   2. sentence_quality_report — flag unnatural fill-blank sentences
--   3. word_difficulty_report  — mark a word as too hard / confusing
--   4. quiz_session_feedback   — post-quiz star rating (extends existing table)
--
-- Note: quiz_feedback table already exists in schema.sql.
--       Run only the new tables below.
-- ================================================================

-- ── 1. Voice Score Feedback ───────────────────────────────────────
-- User rates whether the pronunciation scoring felt accurate.
-- Helps tune voiceScoring.ts thresholds and tone detection logic.

CREATE TABLE IF NOT EXISTS voice_score_feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   TEXT NOT NULL,
  word_id      TEXT NOT NULL,
  hanzi        TEXT NOT NULL,
  pinyin       TEXT NOT NULL,
  transcript   TEXT NOT NULL DEFAULT '',
  system_score SMALLINT NOT NULL,           -- 0–100 score the algorithm gave
  verdict      TEXT NOT NULL,               -- 'accurate' | 'too_high' | 'too_low'
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE voice_score_feedback
  ADD CONSTRAINT vsf_verdict_values
  CHECK (verdict IN ('accurate', 'too_high', 'too_low'));

CREATE INDEX IF NOT EXISTS idx_vsf_word    ON voice_score_feedback (word_id);
CREATE INDEX IF NOT EXISTS idx_vsf_verdict ON voice_score_feedback (verdict);
CREATE INDEX IF NOT EXISTS idx_vsf_created ON voice_score_feedback (created_at DESC);

-- ── 2. Sentence Quality Report ────────────────────────────────────
-- User flags a fill-blank sentence as unnatural or wrong.
-- Helps filter out bad AI-generated or template sentences.

CREATE TABLE IF NOT EXISTS sentence_quality_report (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  word_id     TEXT NOT NULL,
  hanzi       TEXT NOT NULL,
  sentence    TEXT NOT NULL,               -- the sentence that was shown
  issue       TEXT NOT NULL,               -- see CHECK below
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sentence_quality_report
  ADD CONSTRAINT sqr_issue_values
  CHECK (issue IN ('unnatural', 'wrong_word', 'confusing', 'grammar_error', 'other'));

CREATE INDEX IF NOT EXISTS idx_sqr_word    ON sentence_quality_report (word_id);
CREATE INDEX IF NOT EXISTS idx_sqr_issue   ON sentence_quality_report (issue);
CREATE INDEX IF NOT EXISTS idx_sqr_created ON sentence_quality_report (created_at DESC);

-- ── 3. Word Difficulty Report ─────────────────────────────────────
-- User marks a word as too hard / confusing during a quiz.
-- Prioritises which words need better examples or level reassignment.

CREATE TABLE IF NOT EXISTS word_difficulty_report (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  word_id     TEXT NOT NULL,
  hanzi       TEXT NOT NULL,
  pinyin      TEXT NOT NULL,
  level       SMALLINT NOT NULL,           -- 2 | 3 | 4
  issue       TEXT NOT NULL,               -- see CHECK below
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE word_difficulty_report
  ADD CONSTRAINT wdr_issue_values
  CHECK (issue IN ('too_hard', 'confusing_meaning', 'confusing_pronunciation', 'wrong_level', 'other'));

CREATE INDEX IF NOT EXISTS idx_wdr_word    ON word_difficulty_report (word_id);
CREATE INDEX IF NOT EXISTS idx_wdr_issue   ON word_difficulty_report (issue);
CREATE INDEX IF NOT EXISTS idx_wdr_level   ON word_difficulty_report (level);
CREATE INDEX IF NOT EXISTS idx_wdr_created ON word_difficulty_report (created_at DESC);

-- ── Row-Level Security ────────────────────────────────────────────

ALTER TABLE voice_score_feedback   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentence_quality_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_difficulty_report  ENABLE ROW LEVEL SECURITY;

-- Anonymous users can insert feedback
CREATE POLICY "anon_insert_vsf"  ON voice_score_feedback    FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_sqr"  ON sentence_quality_report FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_insert_wdr"  ON word_difficulty_report  FOR INSERT TO anon WITH CHECK (true);

-- Anonymous users can read feedback (needed for in-app admin dashboard)
CREATE POLICY "anon_select_vsf"  ON voice_score_feedback    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_sqr"  ON sentence_quality_report FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_wdr"  ON word_difficulty_report  FOR SELECT TO anon USING (true);

-- Also open quiz_feedback for select (needed by admin dashboard)
-- Skip if policy already exists
DO $$ BEGIN
  CREATE POLICY "anon_select_quiz_feedback"
    ON quiz_feedback FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ================================================================
-- Convenience views for admin dashboard
-- ================================================================

-- Most-flagged sentences (top candidates for replacement)
CREATE OR REPLACE VIEW top_flagged_sentences AS
  SELECT word_id, hanzi, sentence, issue, COUNT(*) AS report_count
  FROM   sentence_quality_report
  GROUP  BY word_id, hanzi, sentence, issue
  ORDER  BY report_count DESC;

-- Words most often marked as difficult
CREATE OR REPLACE VIEW top_difficult_words AS
  SELECT word_id, hanzi, pinyin, level, issue, COUNT(*) AS report_count
  FROM   word_difficulty_report
  GROUP  BY word_id, hanzi, pinyin, level, issue
  ORDER  BY report_count DESC;

-- Voice scoring accuracy summary
CREATE OR REPLACE VIEW voice_score_accuracy AS
  SELECT
    word_id,
    hanzi,
    COUNT(*) FILTER (WHERE verdict = 'accurate')  AS accurate_count,
    COUNT(*) FILTER (WHERE verdict = 'too_high')  AS too_high_count,
    COUNT(*) FILTER (WHERE verdict = 'too_low')   AS too_low_count,
    COUNT(*) AS total,
    ROUND(AVG(system_score)) AS avg_system_score
  FROM   voice_score_feedback
  GROUP  BY word_id, hanzi
  ORDER  BY total DESC;
