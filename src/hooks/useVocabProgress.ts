/**
 * @file useVocabProgress.ts
 * @description Tracks vocabulary learning progress per category chunk.
 *
 * Storage layout (localStorage)
 * ─────────────────────────────
 * Key: hsk-lab:vocab-progress
 * Value: Record<chunkKey, ChunkProgress>
 *   chunkKey = "<categoryId>:<chunkIndex>"  e.g. "food:0", "travel:2"
 *
 * A chunk is "complete" when all its word IDs have been seen AND the user
 * has explicitly pressed "Done" or completed a mini-quiz for that chunk.
 * A chunk is "started" when at least one word has been seen.
 */

import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type { VocabItem } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ChunkProgress {
  seenIds: string[];     // word IDs seen/flipped at least once
  completed: boolean;    // user explicitly marked this chunk done
  lastSeen: string;      // ISO timestamp of last activity
}

export type VocabProgressMap = Record<string, ChunkProgress>;

// ── Chunk key ─────────────────────────────────────────────────────────────

export function chunkKey(categoryId: string, chunkIndex: number): string {
  return `${categoryId}:${chunkIndex}`;
}

// ── Helper: split words into equal chunks ─────────────────────────────────

export function splitIntoChunks(words: VocabItem[], size: number): VocabItem[][] {
  const chunks: VocabItem[][] = [];
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size));
  }
  return chunks;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useVocabProgress() {
  const [progress, setProgress] = useLocalStorage<VocabProgressMap>(
    'hsk-lab:vocab-progress',
    {},
  );

  /** Mark a word as seen within a chunk. */
  const markSeen = useCallback(
    (categoryId: string, chunkIndex: number, wordId: string) => {
      setProgress(prev => {
        const key  = chunkKey(categoryId, chunkIndex);
        const prev_ = prev[key] ?? { seenIds: [], completed: false, lastSeen: '' };
        if (prev_.seenIds.includes(wordId)) return prev;
        return {
          ...prev,
          [key]: {
            ...prev_,
            seenIds: [...prev_.seenIds, wordId],
            lastSeen: new Date().toISOString(),
          },
        };
      });
    },
    [setProgress],
  );

  /** Mark an entire chunk as completed. */
  const markChunkComplete = useCallback(
    (categoryId: string, chunkIndex: number) => {
      setProgress(prev => {
        const key = chunkKey(categoryId, chunkIndex);
        const prev_ = prev[key] ?? { seenIds: [], completed: false, lastSeen: '' };
        return {
          ...prev,
          [key]: { ...prev_, completed: true, lastSeen: new Date().toISOString() },
        };
      });
    },
    [setProgress],
  );

  /** Get progress for a specific chunk. */
  const getChunkProgress = useCallback(
    (categoryId: string, chunkIndex: number): ChunkProgress => {
      return progress[chunkKey(categoryId, chunkIndex)] ?? {
        seenIds: [],
        completed: false,
        lastSeen: '',
      };
    },
    [progress],
  );

  /**
   * Get completion ratio for a chunk (0.0 – 1.0).
   * Based on how many words in the chunk have been seen.
   */
  const getChunkRatio = useCallback(
    (categoryId: string, chunkIndex: number, chunkWords: VocabItem[]): number => {
      const p = getChunkProgress(categoryId, chunkIndex);
      if (p.completed) return 1;
      if (chunkWords.length === 0) return 0;
      const seen = chunkWords.filter(w => p.seenIds.includes(w.id)).length;
      return seen / chunkWords.length;
    },
    [getChunkProgress],
  );

  /** Reset all progress for a category. */
  const resetCategory = useCallback(
    (categoryId: string) => {
      setProgress(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${categoryId}:`)) delete next[key];
        }
        return next;
      });
    },
    [setProgress],
  );

  return {
    progress,
    markSeen,
    markChunkComplete,
    getChunkProgress,
    getChunkRatio,
    resetCategory,
  };
}
