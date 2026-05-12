import { useCallback, useEffect, useState } from 'react';

/**
 * useLocalStorage – a drop-in replacement for useState that persists
 * the value to the browser's localStorage under the given `key`.
 *
 * ────────────────────────────────────────────────────────────────
 * WHY LOCALSTORAGE (and how we avoid a backend)
 * ────────────────────────────────────────────────────────────────
 * This app is 100 % client-side. Instead of persisting data in a
 * server-side database, we use the browser's built-in synchronous
 * `localStorage` key/value store (~5 MB per origin on iPadOS). Every
 * piece of user state – pre-test results, quiz high scores, cards
 * marked "Need Review", chosen language – is written here under
 * a namespaced key (e.g. `hsk-master:review`). Because the PWA
 * service worker caches the JS bundle and the vocabulary JSON,
 * the whole experience works offline with zero network.
 *
 * Implementation notes:
 *  • JSON (de)serialization so any serialisable shape works.
 *  • We hydrate lazily inside the initial-state function so we
 *    only touch localStorage once on mount.
 *  • A `storage` event listener keeps multiple tabs in sync.
 *  • Writes are wrapped in try/catch so a full quota / Safari
 *    private-mode does not crash the app.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const readValue = useCallback((): T => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [stored, setStored] = useState<T>(readValue);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStored(prev => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch (err) {
          // Most common cause: iOS Safari Private mode.
          console.warn('[useLocalStorage] write failed', err);
        }
        return next;
      });
    },
    [key],
  );

  // Keep multiple tabs/PWA instances in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try { setStored(JSON.parse(e.newValue) as T); } catch { /* noop */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [stored, setValue] as const;
}
