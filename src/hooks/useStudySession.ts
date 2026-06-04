import { useEffect, useRef } from 'react';

export interface StudySessionEntry {
  date: string;          // 'YYYY-MM-DD'
  durationSec: number;
  level: number;
}

const SESSION_KEY = 'hsk-lab:sessions';
const STREAK_KEY  = 'hsk-lab:streak';
const TODAY_KEY   = 'hsk-lab:last-active';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadSessions(): StudySessionEntry[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: StudySessionEntry[]) {
  try {
    // Keep only last 90 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const trimmed = sessions.filter(s => s.date >= cutoffStr).slice(-500);
    localStorage.setItem(SESSION_KEY, JSON.stringify(trimmed));
  } catch { /* quota */ }
}

/** Called on app mount/unmount to record a study session and update streak. */
export function useStudySession(level: number) {
  const startRef = useRef(Date.now());

  // Update streak whenever user visits
  useEffect(() => {
    const today = todayStr();
    const last  = localStorage.getItem(TODAY_KEY);

    if (last !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);

      const streak = parseInt(localStorage.getItem(STREAK_KEY) ?? '0', 10);
      const newStreak = last === yStr ? streak + 1 : 1;
      localStorage.setItem(STREAK_KEY,  String(newStreak));
      localStorage.setItem(TODAY_KEY,   today);
    }
  }, []);

  // On unmount, save session duration
  useEffect(() => {
    startRef.current = Date.now();
    return () => {
      const sec = Math.round((Date.now() - startRef.current) / 1000);
      if (sec < 5) return;                // ignore accidental flickers
      const sessions = loadSessions();
      sessions.push({ date: todayStr(), durationSec: sec, level });
      saveSessions(sessions);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);
}

/* ── Utility readers (used by Analytics page) ─────────────────── */

export function getStreak(): number {
  const today  = todayStr();
  const last   = localStorage.getItem(TODAY_KEY);
  const streak = parseInt(localStorage.getItem(STREAK_KEY) ?? '0', 10);
  // If user hasn't studied today or yesterday, streak is broken
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);
  if (last === today || last === yStr) return streak;
  return 0;
}

export function getTotalStudyMinutes(): number {
  return Math.round(
    loadSessions().reduce((s, e) => s + e.durationSec, 0) / 60,
  );
}

export function getRecentSessions(days = 14): StudySessionEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return loadSessions().filter(s => s.date >= cutoffStr);
}

export function getDailyMinutes(days = 14): { date: string; minutes: number }[] {
  const sessions = getRecentSessions(days);
  const map: Record<string, number> = {};
  sessions.forEach(s => {
    map[s.date] = (map[s.date] ?? 0) + s.durationSec;
  });
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, minutes: Math.round((map[key] ?? 0) / 60) });
  }
  return result;
}
