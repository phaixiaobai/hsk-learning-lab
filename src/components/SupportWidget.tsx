/**
 * @file SupportWidget.tsx
 * @description Floating support / bug-report widget.
 *
 * UX
 * ──
 * • Fixed bottom-right button (chat bubble icon)
 * • Click → slides up a compact panel
 * • Form: category, message, optional screenshot upload
 * • Auto-captures: page URL, browser fingerprint, timestamp
 * • Submits to Supabase when configured; falls back to localStorage
 * • Draft auto-saved on every keystroke (restored on next open)
 * • Loading → success → auto-dismiss flow
 *
 * Graceful degradation
 * ────────────────────
 * When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set the widget
 * still works — tickets are stored in localStorage under hsk-lab:tickets
 * and a yellow banner tells the user submissions are local-only.
 */

import { useEffect, useRef, useState } from 'react';
import { db, isSupabaseConfigured } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type Category =
  | 'Bug'
  | 'Translation Issue'
  | 'Audio Problem'
  | 'Quiz Problem'
  | 'UI/UX Suggestion'
  | 'Feature Request'
  | 'Other';

const CATEGORIES: Category[] = [
  'Bug',
  'Translation Issue',
  'Audio Problem',
  'Quiz Problem',
  'UI/UX Suggestion',
  'Feature Request',
  'Other',
];

const CATEGORY_ICONS: Record<Category, string> = {
  'Bug': '🐛',
  'Translation Issue': '🈳',
  'Audio Problem': '🔇',
  'Quiz Problem': '❓',
  'UI/UX Suggestion': '🎨',
  'Feature Request': '💡',
  'Other': '📝',
};

type Phase = 'idle' | 'open' | 'loading' | 'success' | 'error';

const DRAFT_KEY = 'hsk-lab:support-draft';

interface Draft {
  category: Category;
  message: string;
}

// ── Browser info helper ────────────────────────────────────────────────────

function getBrowserInfo(): string {
  const ua = navigator.userAgent;
  const lang = navigator.language;
  const screen = `${window.screen.width}×${window.screen.height}`;
  const platform = navigator.platform ?? 'unknown';
  return `${ua} | ${lang} | ${screen} | ${platform}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SupportWidget() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [category, setCategory] = useState<Category>('Bug');
  const [message, setMessage] = useState('');
  const [screenshotB64, setScreenshotB64] = useState<string>('');
  const [anonymous, setAnonymous] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Restore draft on mount
  useEffect(() => {
    try {
      const draft: Draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
      if (draft.category) setCategory(draft.category);
      if (draft.message)  setMessage(draft.message);
    } catch { /* ignore */ }
  }, []);

  // Auto-save draft whenever category/message changes
  useEffect(() => {
    if (message || category !== 'Bug') {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ category, message }));
    }
  }, [category, message]);

  // Auto-focus textarea when panel opens
  useEffect(() => {
    if (phase === 'open') setTimeout(() => textRef.current?.focus(), 80);
  }, [phase]);

  // Auto-dismiss success after 3 s
  useEffect(() => {
    if (phase === 'success') {
      const t = setTimeout(() => { setPhase('idle'); }, 3000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // ── Screenshot handler ──────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setScreenshotB64((ev.target?.result as string) ?? '');
    reader.readAsDataURL(file);
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setPhase('loading');

    const ticket = {
      category,
      message: message.trim(),
      page_url: window.location.href,
      browser_info: getBrowserInfo(),
      screenshot_base64: screenshotB64 || undefined,
      anonymous,
      created_at: new Date().toISOString(),
    };

    try {
      if (isSupabaseConfigured) {
        await db.insertTicket(ticket);
      } else {
        // Fallback: save to localStorage
        const prev = JSON.parse(localStorage.getItem('hsk-lab:tickets') ?? '[]');
        prev.unshift(ticket);
        localStorage.setItem('hsk-lab:tickets', JSON.stringify(prev.slice(0, 50)));
      }

      // Clear draft + form on success
      localStorage.removeItem(DRAFT_KEY);
      setMessage('');
      setScreenshotB64('');
      setCategory('Bug');
      if (fileRef.current) fileRef.current.value = '';
      setPhase('success');
    } catch {
      setPhase('error');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const isOpen = phase === 'open' || phase === 'loading' || phase === 'error';

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10 sm:hidden"
          onClick={() => setPhase('idle')}
        />
      )}

      {/* Panel */}
      {(isOpen || phase === 'success') && (
        <div
          className={[
            'fixed bottom-20 right-4 z-50 w-[min(360px,calc(100vw-2rem))]',
            'rounded-2xl bg-white shadow-2xl border border-ink/10',
            'flex flex-col overflow-hidden',
            'animate-pop',
          ].join(' ')}
          style={{ maxHeight: '80dvh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-brand text-white rounded-t-2xl">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <span>🛟</span>
              <span>Report / Feedback</span>
            </div>
            <button
              onClick={() => setPhase('idle')}
              aria-label="Close"
              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Success state */}
          {phase === 'success' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3 text-center">
              <div className="text-5xl animate-pop">✅</div>
              <p className="font-semibold text-ink">Thank you!</p>
              <p className="text-sm text-ink-soft">
                {isSupabaseConfigured
                  ? 'Your report has been submitted.'
                  : 'Saved locally (Supabase not configured).'}
              </p>
            </div>
          )}

          {/* Form */}
          {isOpen && (
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Local-only banner */}
              {!isSupabaseConfigured && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
                  <span>⚠️</span>
                  <span>Supabase not configured — reports saved locally only.</span>
                </div>
              )}

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Category
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={[
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all',
                        category === cat
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-ink/10 bg-white text-ink hover:border-brand/30',
                      ].join(' ')}
                    >
                      <span>{CATEGORY_ICONS[cat]}</span>
                      <span className="truncate">{cat}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  ref={textRef}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe the issue or your suggestion…"
                  required
                  rows={4}
                  className="w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink placeholder-ink-soft/60 focus:outline-none focus:border-brand resize-none"
                />
                <p className="text-[10px] text-ink-soft mt-1">
                  Page URL, device info, and timestamp are included automatically.
                </p>
              </div>

              {/* Screenshot */}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Screenshot <span className="text-ink-soft font-normal">(optional)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="flex-1 rounded-xl border border-dashed border-ink/20 group-hover:border-brand/50 px-3 py-2.5 text-xs text-ink-soft text-center transition-colors">
                    {screenshotB64 ? '📎 Image attached ✓' : '📎 Tap to attach image'}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {screenshotB64 && (
                  <img
                    src={screenshotB64}
                    alt="Preview"
                    className="mt-2 rounded-lg border border-ink/10 max-h-28 object-contain w-full"
                  />
                )}
              </div>

              {/* Anonymous toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  role="checkbox"
                  aria-checked={anonymous}
                  onClick={() => setAnonymous(v => !v)}
                  className={[
                    'w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer',
                    anonymous ? 'bg-brand' : 'bg-ink/20',
                  ].join(' ')}
                >
                  <div className={[
                    'w-4 h-4 bg-white rounded-full shadow transition-transform',
                    anonymous ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')} />
                </div>
                <span className="text-xs text-ink-soft">Submit anonymously</span>
              </label>

              {/* Error */}
              {phase === 'error' && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  Submission failed. Please try again.
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={phase === 'loading' || !message.trim()}
                className={[
                  'w-full rounded-xl py-2.5 text-sm font-semibold transition-all',
                  phase === 'loading' || !message.trim()
                    ? 'bg-ink/10 text-ink-soft cursor-not-allowed'
                    : 'bg-brand text-white hover:bg-brand/90 active:scale-95',
                ].join(' ')}
              >
                {phase === 'loading' ? 'Submitting…' : 'Send Report →'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setPhase(p => p === 'idle' ? 'open' : 'idle')}
        aria-label={isOpen ? 'Close support panel' : 'Open support / bug report'}
        title="Report a bug or give feedback"
        className={[
          'fixed bottom-5 right-4 z-50 w-13 h-13 rounded-full shadow-lg',
          'flex items-center justify-center text-xl transition-all select-none',
          isOpen || phase === 'success'
            ? 'bg-ink text-white rotate-45 scale-95'
            : 'bg-brand text-white hover:scale-105 active:scale-95',
        ].join(' ')}
        style={{ width: '3.25rem', height: '3.25rem' }}
      >
        {isOpen || phase === 'success' ? '✕' : '🛟'}
      </button>
    </>
  );
}
