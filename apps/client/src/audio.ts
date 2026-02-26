type Listener = () => void;

let volume = parseFloat(localStorage.getItem("bunko_volume") ?? "1");
let muted = localStorage.getItem("bunko_muted") === "true";
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn();
}

function getEffectiveVolume(): number {
  return muted ? 0 : volume;
}

export const audioManager = {
  getVolume: () => volume,
  getMuted: () => muted,
  getEffectiveVolume,

  setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v));
    localStorage.setItem("bunko_volume", String(volume));
    notify();
  },

  setMuted(m: boolean) {
    muted = m;
    localStorage.setItem("bunko_muted", String(muted));
    notify();
  },

  toggleMute() {
    audioManager.setMuted(!muted);
  },

  play(src: string): HTMLAudioElement {
    const audio = new Audio(src);
    audio.volume = getEffectiveVolume();
    audio.play().catch(() => {});
    return audio;
  },

  applyVolume(audio: HTMLAudioElement) {
    audio.volume = getEffectiveVolume();
  },

  playLoop(src: string): { audio: HTMLAudioElement; stop: () => void } {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = getEffectiveVolume();
    audio.play().catch(() => {});
    const unsub = audioManager.subscribe(() => {
      audio.volume = getEffectiveVolume();
    });
    return {
      audio,
      stop() {
        unsub();
        audio.pause();
        audio.currentTime = 0;
      },
    };
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
