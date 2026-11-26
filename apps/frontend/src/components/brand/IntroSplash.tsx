import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** Set once the intro has been seen on this device (v2: the 3D intro is shown once more to everybody). */
const SEEN_KEY = 'malodge.intro.v2';
/** Total length on screen, the way out included (ms). */
const DURATION = 2000;
/** The way out: through the door, into the site (s). */
const EXIT = 0.35;

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

const ARCH = 'M4.5 30V14.5C4.5 8 9.6 3.4 16 1.6 22.4 3.4 27.5 8 27.5 14.5V30ZM9.6 30V17.4c0-3.8 2.7-6.6 6.4-7.9 3.7 1.3 6.4 4.1 6.4 7.9V30Z';
const FRONT = '#C9683F';
const SIDE = ['#7E3A22', '#8A4127', '#96482B', '#A24F30', '#AE5634', '#B85C38'];
const LAYERS = 12;
const SIZE = 150;
const spring = { type: 'spring', stiffness: 70, damping: 14, mass: 0.9 } as const;
const ease = [0.22, 1, 0.36, 1] as const;

/** Golden sparkles flying out of the door, in depth. */
function useSparkles(n: number) {
  return useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
        const dist = 110 + ((i * 37) % 90);
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.75 - 20,
          z: ((i * 53) % 260) - 60,
          size: 2 + ((i * 7) % 4),
          delay: 0.45 + ((i * 13) % 40) / 100,
        };
      }),
    [n],
  );
}

/**
 * Opening animation, the first time the site is opened on a device (2 s):
 * the riad arch — a real 3D volume — comes out of the depth turning, the sun rises in
 * it with its rays, golden sparkles fly out, the letters of MALODGE turn over one by one,
 * a light sweeps the logo, then the camera goes through the door into the site.
 */
export function IntroSplash() {
  const [visible, setVisible] = useState(PLAY_ON_LOAD);
  const sparkles = useSparkles(22);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), DURATION - EXIT * 1000);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="intro"
          aria-hidden
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 50% 42%, #2B2C40 0%, #16172A 55%, #0A0B12 100%)', perspective: 1100 }}
          initial={{ opacity: 1 }}
          // Through the door: the whole scene comes at the camera and dissolves.
          exit={{ opacity: 0, scale: 1.6, filter: 'blur(8px)', transition: { duration: EXIT, ease: [0.55, 0, 0.75, 0.25] } }}
        >
          {/* Warm glow behind the door */}
          <motion.div
            className="absolute rounded-full"
            style={{ width: 520, height: 520, background: 'radial-gradient(circle, rgba(242,168,90,0.35) 0%, rgba(201,104,63,0.12) 40%, transparent 70%)' }}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.35, duration: 1.1, ease }}
          />

          <div className="relative flex flex-col items-center" style={{ transformStyle: 'preserve-3d' }}>
            {/* The arch, extruded: stacked layers give it a thickness that shows when it turns. */}
            <motion.div
              className="relative"
              style={{ width: SIZE, height: SIZE, transformStyle: 'preserve-3d' }}
              initial={{ rotateY: -80, rotateX: 22, z: -700, scale: 0.5, opacity: 0 }}
              animate={{ rotateY: [-80, 18, 0], rotateX: [22, -6, 0], z: [-700, 40, 0], scale: [0.5, 1.05, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 1.05, times: [0, 0.62, 1], ease }}
            >
              {/* Rays turning behind the sun */}
              <motion.div
                className="absolute left-1/2 rounded-full"
                style={{
                  width: SIZE * 1.9,
                  height: SIZE * 1.9,
                  top: SIZE * 0.66 - SIZE * 0.95,
                  marginLeft: -SIZE * 0.95,
                  background: 'repeating-conic-gradient(from 0deg, rgba(255,214,150,0.16) 0deg 6deg, transparent 6deg 18deg)',
                  WebkitMaskImage: 'radial-gradient(circle, black 18%, transparent 62%)',
                  maskImage: 'radial-gradient(circle, black 18%, transparent 62%)',
                  transform: 'translateZ(-30px)',
                }}
                initial={{ opacity: 0, rotate: -20 }}
                animate={{ opacity: 1, rotate: 25 }}
                transition={{ opacity: { delay: 0.55, duration: 0.5 }, rotate: { delay: 0.4, duration: 1.6, ease: 'linear' } }}
              />

              {Array.from({ length: LAYERS }).map((_, i) => {
                const back = LAYERS - 1 - i;
                return (
                  <svg
                    key={i}
                    viewBox="0 0 32 32"
                    width={SIZE}
                    height={SIZE}
                    className="absolute inset-0"
                    style={{ transform: `translateZ(${-back * 1.6}px)` }}
                  >
                    <path fillRule="evenodd" d={ARCH} fill={back === 0 ? FRONT : SIDE[Math.min(SIDE.length - 1, Math.floor((LAYERS - back) / 2))]} />
                  </svg>
                );
              })}

              {/* Light sweeping across the front of the arch */}
              <svg viewBox="0 0 32 32" width={SIZE} height={SIZE} className="absolute inset-0" style={{ transform: 'translateZ(0.5px)' }}>
                <defs>
                  <linearGradient id="intro-shine" x1="0" y1="0" x2="1" y2="0.35">
                    <stop offset="0" stopColor="#fff" stopOpacity="0" />
                    <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                  <clipPath id="intro-arch-clip">
                    <path fillRule="evenodd" d={ARCH} />
                  </clipPath>
                </defs>
                <g clipPath="url(#intro-arch-clip)">
                  <motion.rect y="-4" width="10" height="40" fill="url(#intro-shine)" initial={{ x: -14 }} animate={{ x: 36 }} transition={{ delay: 1.15, duration: 0.5, ease: 'easeInOut' }} />
                </g>
              </svg>

              {/* The sun rises over the pool, in front of the door's depth */}
              <svg viewBox="0 0 32 32" width={SIZE} height={SIZE} className="absolute inset-0" style={{ transform: 'translateZ(6px)', overflow: 'visible' }}>
                <defs>
                  <clipPath id="intro-horizon">
                    <rect x="0" y="0" width="32" height="22.6" />
                  </clipPath>
                  <radialGradient id="intro-sun" cx="0.5" cy="0.9" r="0.7">
                    <stop offset="0" stopColor="#FFE3A8" />
                    <stop offset="1" stopColor="#F2A85A" />
                  </radialGradient>
                </defs>
                <g clipPath="url(#intro-horizon)">
                  <motion.path
                    d="M12 22.6a4 4 0 0 1 8 0Z"
                    fill="url(#intro-sun)"
                    style={{ filter: 'drop-shadow(0 0 1.6px rgba(255,200,120,0.9))' }}
                    initial={{ y: 5 }}
                    animate={{ y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6, ease }}
                  />
                </g>
                <motion.rect x="9.6" y="24.3" width="12.8" height="1.7" fill="#F4E7D7" style={{ originX: '50%', transformBox: 'fill-box' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.75, duration: 0.35, ease }} />
                <motion.rect x="12" y="27.4" width="8" height="1.7" rx=".85" fill="#F4E7D7" style={{ originX: '50%', transformBox: 'fill-box' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.85, duration: 0.35, ease }} />
              </svg>
            </motion.div>

            {/* Sparkles flying out in depth */}
            {sparkles.map((s, i) => (
              <motion.span
                key={i}
                className="absolute rounded-full"
                style={{ width: s.size, height: s.size, top: SIZE * 0.55, left: '50%', background: '#FFD89A', boxShadow: '0 0 8px 2px rgba(255,200,120,0.75)' }}
                initial={{ x: 0, y: 0, z: 0, opacity: 0, scale: 0.4 }}
                animate={{ x: s.x, y: s.y, z: s.z, opacity: [0, 1, 0], scale: [0.4, 1.2, 0.6] }}
                transition={{ delay: s.delay, duration: 1.1, ease: 'easeOut' }}
              />
            ))}

            {/* MALODGE: each letter turns over, one after the other */}
            <div className="mt-7 flex" style={{ perspective: 600 }}>
              {'MALODGE'.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  className="inline-block font-brand font-extrabold text-white text-[34px] leading-none tracking-[0.16em]"
                  style={{ transformOrigin: '50% 100%', textShadow: '0 6px 24px rgba(0,0,0,0.45)' }}
                  initial={{ rotateX: -100, opacity: 0, y: 14 }}
                  animate={{ rotateX: 0, opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.78 + i * 0.055 }}
                >
                  {ch}
                </motion.span>
              ))}
            </div>
            <motion.span
              className="mt-2.5 font-brand font-bold text-[14px] pl-[0.7em]"
              style={{ color: '#F2A888' }}
              initial={{ opacity: 0, letterSpacing: '1.4em' }}
              animate={{ opacity: 1, letterSpacing: '0.7em' }}
              transition={{ delay: 1.2, duration: 0.45, ease }}
            >
              CLUB
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
