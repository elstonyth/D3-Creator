/** @jest-environment jsdom */
/**
 * The pop-up's chime. A browser lets a page make sound only after a tap or
 * a key, so nothing is made before one; after it, each chime is two short
 * notes. Where there is no Web Audio at all, it stays quiet.
 */

type Chime = typeof import('./chime');

const made: { type: string; start: number; stop: number }[] = [];

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  state = 'running';
  currentTime = 10;
  destination = {};
  resume = jest.fn(async () => undefined);
  constructor() {
    FakeAudioContext.last = this;
  }
  createOscillator() {
    const o = {
      type: '',
      frequency: { value: 0 },
      start: jest.fn(),
      stop: jest.fn(),
      connect: (to: unknown) => to,
    };
    o.start.mockImplementation((t: number) =>
      made.push({ type: o.type, start: t, stop: NaN }),
    );
    o.stop.mockImplementation((t: number) => {
      made[made.length - 1].stop = t;
    });
    return o;
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: jest.fn(),
        exponentialRampToValueAtTime: jest.fn(),
      },
      connect: (to: unknown) => to,
    };
  }
}

/** A fresh copy of the module: the context it keeps starts empty. */
function load(): Chime {
  let mod!: Chime;
  jest.isolateModules(() => {
    mod = jest.requireActual<Chime>('./chime');
  });
  return mod;
}

beforeEach(() => {
  made.length = 0;
  FakeAudioContext.last = null;
  Object.assign(window, { AudioContext: FakeAudioContext });
});
afterEach(() => {
  delete (window as { AudioContext?: unknown }).AudioContext;
});

it('makes no sound, and no audio at all, before a tap or a key', () => {
  const { armChime, playChime } = load();
  const disarm = armChime();
  playChime();
  expect(FakeAudioContext.last).toBeNull();
  expect(made).toHaveLength(0);
  disarm();
});

it('chimes two short notes once a tap has woken it', () => {
  const { armChime, playChime } = load();
  const disarm = armChime();
  window.dispatchEvent(new Event('touchend'));
  expect(FakeAudioContext.last?.resume).toHaveBeenCalled();
  playChime();
  expect(made).toHaveLength(2);
  expect(made.every((n) => n.type === 'sine')).toBe(true);
  // One after the other, from now, each well under a second.
  expect(made[0].start).toBe(10);
  expect(made[1].start).toBeGreaterThan(made[0].start);
  expect(made.every((n) => n.stop - n.start < 1)).toBe(true);
  disarm();
});

it('stays quiet while the browser holds the sound back', () => {
  const { armChime, playChime } = load();
  const disarm = armChime();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
  FakeAudioContext.last!.state = 'suspended';
  playChime();
  expect(made).toHaveLength(0);
  disarm();
});

it('listens for taps only while armed', () => {
  const { armChime } = load();
  armChime()();
  window.dispatchEvent(new MouseEvent('click'));
  expect(FakeAudioContext.last).toBeNull();
});

it('does nothing where there is no Web Audio', () => {
  delete (window as { AudioContext?: unknown }).AudioContext;
  const { armChime, playChime } = load();
  const disarm = armChime();
  expect(() => {
    window.dispatchEvent(new MouseEvent('click'));
    playChime();
  }).not.toThrow();
  disarm();
});
