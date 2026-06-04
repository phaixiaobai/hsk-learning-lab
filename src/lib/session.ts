/**
 * @file session.ts
 * @description Stable anonymous session ID — generated once per device,
 * persisted in localStorage. Used as a correlation key across all feedback
 * and progress tables without requiring user accounts.
 */

const SESSION_KEY = 'hsk-lab:session-id';

let _cached: string | null = null;

/** Returns a stable UUID for this browser/device session. */
export function getSessionId(): string {
  if (_cached) return _cached;
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  _cached = id;
  return id;
}
