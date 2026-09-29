/**
 * The chime of the work pop-up (components/team/work-alerts.tsx): two short
 * notes made with Web Audio, so there is no sound file to load.
 *
 * A browser lets a page make sound only after someone has tapped it or
 * pressed a key. So the chime wakes on the first tap or key while it is
 * armed, and until then stays quiet; the pop-up still shows. The same holds
 * after a phone puts the page to sleep.
 */

const WAKE = ['click', 'touchend', 'keydown'] as const;
// Two notes going up, like a doorbell: A5, then E6.
const NOTES = [
  { hz: 880, at: 0 },
  { hz: 1318.5, at: 0.14 },
];

// ponytail: the context stays open once woken; suspend it between chimes if
// phones' batteries ever suffer.
let ctx: AudioContext | null = null;

function wake() {
  if (!ctx) {
    if (typeof window.AudioContext !== 'function') return;
    ctx = new window.AudioContext();
  }
  ctx.resume().catch(() => undefined);
}

/** Listen for the tap or key that lets the chime sound; returns the undo. */
export function armChime(): () => void {
  for (const e of WAKE) window.addEventListener(e, wake, { passive: true });
  return () => {
    for (const e of WAKE) window.removeEventListener(e, wake);
  };
}

/** Two short notes, now, if the browser lets the page make sound yet. */
export function playChime(): void {
  if (ctx?.state !== 'running') return;
  const t0 = ctx.currentTime;
  for (const { hz, at } of NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    // A quick rise, then a fade: a soft ding, not a beep.
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.55);
  }
}
