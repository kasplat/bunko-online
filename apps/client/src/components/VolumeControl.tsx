import { useSyncExternalStore } from "react";
import { audioManager } from "../audio";

function subscribe(cb: () => void) {
  return audioManager.subscribe(cb);
}

function getSnapshot() {
  return `${audioManager.getVolume()}_${audioManager.getMuted()}`;
}

export function VolumeControl() {
  useSyncExternalStore(subscribe, getSnapshot);

  const volume = audioManager.getVolume();
  const muted = audioManager.getMuted();

  return (
    <div className="volume-control">
      <button
        className="volume-mute-btn"
        onClick={() => audioManager.toggleMute()}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted || volume === 0 ? "\u{1F507}" : volume < 0.5 ? "\u{1F509}" : "\u{1F50A}"}
      </button>
      <input
        type="range"
        className="volume-slider"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (muted && v > 0) audioManager.setMuted(false);
          audioManager.setVolume(v);
        }}
      />
    </div>
  );
}
