/**
 * @file useFavoriteCategories.ts
 * @description Manage a user's favorite / pinned vocabulary categories.
 *
 * Storage: localStorage key "hsk-lab:fav-categories"
 * Value: string[] of category IDs in pinned order
 *
 * The list is ordered: first item = highest priority / pinned at top.
 * Users can favorite, unfavorite, and reorder categories.
 */

import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

const LS_KEY = 'hsk-lab:fav-categories';

export function useFavoriteCategories() {
  const [favorites, setFavorites] = useLocalStorage<string[]>(LS_KEY, []);

  const isFavorite = useCallback(
    (categoryId: string) => favorites.includes(categoryId),
    [favorites],
  );

  const toggle = useCallback(
    (categoryId: string) => {
      setFavorites(prev =>
        prev.includes(categoryId)
          ? prev.filter(id => id !== categoryId)
          : [...prev, categoryId],
      );
    },
    [setFavorites],
  );

  const pin = useCallback(
    (categoryId: string) => {
      setFavorites(prev => {
        const without = prev.filter(id => id !== categoryId);
        return [categoryId, ...without];
      });
    },
    [setFavorites],
  );

  const moveUp = useCallback(
    (categoryId: string) => {
      setFavorites(prev => {
        const idx = prev.indexOf(categoryId);
        if (idx <= 0) return prev;
        const next = [...prev];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        return next;
      });
    },
    [setFavorites],
  );

  return { favorites, isFavorite, toggle, pin, moveUp };
}
