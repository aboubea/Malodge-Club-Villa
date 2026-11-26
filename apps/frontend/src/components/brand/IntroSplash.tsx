import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** Set once the intro has been seen on this device. */
const SEEN_KEY = 'malodge.intro.v1';
/** Total length on screen, fade-out included (ms). */
const DURATION = 1500;
const FADE = 0.3;

/** Decided once per page load (not in a render, which React may run twice). */
const PLAY_ON_LOAD = (() => {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (localStorage.getItem(SEEN_KEY)) return false;
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    return true;
  } catch {
    // No storage (private window…): no intro rather than one on every visit.
    return false;
  }
})();

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Opening animation, the first time the site is opened on a device: the riad arch
 * rises, the sun comes up over the pool, the ripples spread, the name appears,
 * then everything fades out — 1.5 s in all.
 */
export function IntroSplash() {
  const [visible, setVisible] = useState(PLAY_ON_LOAD);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), DURATION - FADE * 1000);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-canvas"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: FADE, ease: 'easeOut' } }}
          aria-hidden
        >
          <div className="flex flex-col items-center gap-5">
            <motion.svg
              viewBox="0 0 32 32"
              width={96}
              height={96}
              className="text-ink"
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.1, ease }}
            >
              <defs>
                {/* The arch rises from the ground. */}
                <clipPath id="intro-arch">
                  <motion.rect x="0" width="32" initial={{ y: 32, height: 0 }} animate={{ y: 0, height: 32 }} transition={{ duration: 0.55, ease }} />
                </clipPath>
                {/* The sun only shows above the water line. */}
                <clipPath id="intro-horizon">
                  <rect x="0" y="0" width="32" height="22.6" />
                </clipPath>
              </defs>
              <path
                clipPath="url(#intro-arch)"
                style={{ fill: 'rgb(var(--c-accent))' }}
                fillRule="evenodd"
                d="M4.5 30V14.5C4.5 8 9.6 3.4 16 1.6 22.4 3.4 27.5 8 27.5 14.5V30ZM9.6 30V17.4c0-3.8 2.7-6.6 6.4-7.9 3.7 1.3 6.4 4.1 6.4 7.9V30Z"
              />
              <g clipPath="url(#intro-horizon)">
                <motion.path fill="currentColor" d="M12 22.6a4 4 0 0 1 8 0Z" initial={{ y: 4.5 }} animate={{ y: 0 }} transition={{ delay: 0.35, duration: 0.5, ease }} />
              </g>
              <motion.rect
                x="9.6"
                y="24.3"
                width="12.8"
                height="1.7"
                fill="currentColor"
                style={{ originX: '50%', transformBox: 'fill-box' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.6, duration: 0.35, ease }}
              />
              <motion.rect
                x="12"
                y="27.4"
                width="8"
                height="1.7"
                rx=".85"
                fill="currentColor"
                style={{ originX: '50%', transformBox: 'fill-box' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.72, duration: 0.35, ease }}
              />
            </motion.svg>

            <div className="flex flex-col items-center leading-none">
              <motion.span
                className="font-extrabold text-ink text-[26px]"
                initial={{ opacity: 0, letterSpacing: '0.42em', y: 6 }}
                animate={{ opacity: 1, letterSpacing: '0.16em', y: 0 }}
                transition={{ delay: 0.55, duration: 0.55, ease }}
              >
                MALODGE
              </motion.span>
              <motion.span
                className="mt-2 font-bold text-accent text-[13px] tracking-[0.6em] pl-[0.6em]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.35 }}
              >
                CLUB
              </motion.span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
