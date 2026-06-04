/**
 * @file AudioButton.tsx
 * @description Self-contained speaker button with optional slow-mode toggle.
 *
 * When `slow` is true the button renders a 🐢 badge and plays at 0.6×
 * speed — helpful for hearing individual tones on multi-syllable words.
 *
 * Prevents overlapping playback (e.stopPropagation so it doesn't flip
 * flashcards) and shows an animated ring while audio is playing.
 */

import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis';

interface Props {
  text: string;
  lang?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** If true, plays at 0.6× speed (slow-tone mode). */
  slow?: boolean;
}

const SIZE = {
  sm: 'w-8  h-8  text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-14 h-14 text-2xl',
};
const ICON_SIZE = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-7 h-7',
};

/**
 * Renders a circular speaker button. Pass `slow` for a 0.6× speed variant.
 */
export function AudioButton({
  text,
  lang = 'zh-CN',
  size = 'md',
  className = '',
  slow = false,
}: Props) {
  const { speak, speakSlow, stop, state, isSupported } = useSpeechSynthesis();

  if (!isSupported) return null;

  const isPlaying = state === 'playing' || state === 'loading';

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isPlaying) { stop(); return; }
    if (slow) { speakSlow(text, lang); } else { speak(text, lang); }
  }

  return (
    <button
      onClick={handleClick}
      aria-label={
        isPlaying
          ? 'Stop audio'
          : slow
            ? `Play slow pronunciation of "${text}"`
            : `Play pronunciation of "${text}"`
      }
      title={isPlaying ? 'Stop' : slow ? 'Slow (0.6×)' : 'Play pronunciation'}
      className={[
        'relative inline-flex items-center justify-center rounded-full border-2',
        'transition-all select-none',
        SIZE[size],
        className,
        isPlaying
          ? 'border-brand bg-brand text-white shadow-lg'
          : 'border-ink/15 bg-white text-ink hover:border-brand hover:text-brand',
      ].join(' ')}
    >
      {/* Pulse ring while playing */}
      {isPlaying && (
        <span className="absolute inset-0 rounded-full border-2 border-brand animate-ping opacity-60" />
      )}

      {/* Slow-mode turtle badge */}
      {slow && !isPlaying && (
        <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none">
          🐢
        </span>
      )}

      {/* Speaker / stop icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={ICON_SIZE[size]}
      >
        {isPlaying ? (
          <>
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </>
        ) : (
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            {/* Slow mode: omit the outer arc to visually hint lower speed */}
            {!slow && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
          </>
        )}
      </svg>
    </button>
  );
}
