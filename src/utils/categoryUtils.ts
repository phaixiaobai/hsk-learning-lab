/**
 * @file categoryUtils.ts
 * @description Utilities for the vocabulary category system.
 *
 * Category assignment is done by keyword-matching word.en (lowercase)
 * against each category's keyword list. The first category whose keyword
 * list has a substring match wins. The "general" catch-all fires last.
 *
 * All heavy computation is memoised: the full word→category map is built
 * once and cached in module scope.
 */

import vocab from '../data/vocabulary.json';
import { CATEGORIES } from '../data/categories';
import type { VocabItem } from '../types';

// ── Category assignment ───────────────────────────────────────────────────

/** Returns the category id for a single vocab word. */
export function assignCategory(word: VocabItem): string {
  const en = word.en.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.length === 0) continue; // skip general (catch-all)
    if (cat.keywords.some(kw => en.includes(kw))) return cat.id;
  }
  return 'general';
}

// ── Memoised full-vocab map ───────────────────────────────────────────────

let _cache: Map<string, string> | null = null;

/** Returns a stable Map<wordId → categoryId> built once on first call. */
function getCategoryCache(): Map<string, string> {
  if (_cache) return _cache;
  _cache = new Map();
  for (const w of vocab as VocabItem[]) {
    _cache.set(w.id, assignCategory(w));
  }
  return _cache;
}

/** Returns the category id for a word id. */
export function getCategoryId(wordId: string): string {
  return getCategoryCache().get(wordId) ?? 'general';
}

// ── Filtering helpers ─────────────────────────────────────────────────────

/** All vocab words belonging to a specific category. */
export function getWordsByCategory(categoryId: string): VocabItem[] {
  const cache = getCategoryCache();
  return (vocab as VocabItem[]).filter(w => cache.get(w.id) === categoryId);
}

/** Word count per category id. */
export function getCategoryCounts(): Map<string, number> {
  const cache = getCategoryCache();
  const counts = new Map<string, number>();
  for (const catId of cache.values()) {
    counts.set(catId, (counts.get(catId) ?? 0) + 1);
  }
  return counts;
}

// ── Analytics helpers ─────────────────────────────────────────────────────

const LS_KEY = 'hsk-lab:cat-scores';

interface CatScore {
  correct: number;
  total: number;
  lastSeen: string;
}

export type CategoryScoreMap = Record<string, CatScore>;

export function getCategoryScores(): CategoryScoreMap {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function recordCategoryAttempt(
  wordId: string,
  isCorrect: boolean,
): void {
  const catId = getCategoryId(wordId);
  const scores = getCategoryScores();
  const prev = scores[catId] ?? { correct: 0, total: 0, lastSeen: '' };
  scores[catId] = {
    correct: prev.correct + (isCorrect ? 1 : 0),
    total: prev.total + 1,
    lastSeen: new Date().toISOString(),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(scores));
}

/** Returns accuracy 0–100 for a category, or null if never attempted. */
export function getCategoryAccuracy(categoryId: string): number | null {
  const scores = getCategoryScores();
  const s = scores[categoryId];
  if (!s || s.total === 0) return null;
  return Math.round((s.correct / s.total) * 100);
}

/** Sorted list of [categoryId, accuracy] for categories with data. */
export function getRankedCategories(): Array<{ id: string; accuracy: number; total: number }> {
  const scores = getCategoryScores();
  return Object.entries(scores)
    .filter(([, s]) => s.total > 0)
    .map(([id, s]) => ({ id, accuracy: Math.round((s.correct / s.total) * 100), total: s.total }))
    .sort((a, b) => b.accuracy - a.accuracy);
}

/** Returns the "review" words stored in the existing localStorage key. */
export function getFavoriteWordIds(): string[] {
  try {
    const raw = localStorage.getItem('hsk-master:review');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
    return [];
  } catch {
    return [];
  }
}

export function getFavoriteWords(): VocabItem[] {
  const ids = new Set(getFavoriteWordIds());
  return (vocab as VocabItem[]).filter(w => ids.has(w.id));
}
