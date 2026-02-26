import type { ClientGameModule } from "../game-renderer";

const FALSE_START = -1;

interface ReactionConfig {
  totalRounds: number;
}

interface ReactionPlayerState {
  id: string;
  name: string;
  reactionTimes: number[];
  tappedThisRound: boolean;
  avgMs: number;
}

interface ReactionState {
  round: number;
  totalRounds: number;
  signalShown: boolean;
  roundOver: boolean;
  finished: boolean;
  players: ReactionPlayerState[];
}

const FAST_MESSAGES = [
  (ms: number) =>
    `You took about the time for a hummingbird to flap its wings ${Math.round(ms / 14)} times`,
  "Faster than a zebra on a ripstick",
  "AMONG US",
  "zoowie mama ur fast!",
  "sonic is proud",
  "sped",
  "so fast you hurt my brian",
];

const MEDIUM_MESSAGES = [
  "u remind me of a among us",
  "average. mario style",
  "I'll allow it",
  "u took as long as it takes for the average sloth to blink",
  "Average time average score... Fuck you",
];

const SLOW_MESSAGES = [
  "sleeping at the wheel?",
  "hello are you there?",
  "zzzzzz",
  "Fun fact: you took as long as a sloth takes to go to the bathroom",
  "Fun fact: A fish can swim across the ocean in that long",
];

function getSpeedSubtitle(ms: number): string {
  let pool: (string | ((ms: number) => string))[];
  if (ms <= 400) {
    pool = FAST_MESSAGES;
  } else if (ms <= 500) {
    pool = MEDIUM_MESSAGES;
  } else {
    pool = SLOW_MESSAGES;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return typeof pick === "function" ? pick(ms) : pick;
}

export class ReactionSpeedClientModule
  implements ClientGameModule<ReactionState, { action: "tap" }, ReactionConfig>
{
  readonly gameId = "reaction-speed";

  private container: HTMLElement | null = null;
  private sendInput: ((input: { action: "tap" }) => void) | null = null;
  private getPlayerId: (() => string) | null = null;
  private state: ReactionState | null = null;
  private tapped = false;
  private handleClick: (() => void) | null = null;
  private currentSubtitle: string | null = null;
  private lastSubtitleTime: number | undefined = undefined;
  private goSound: HTMLAudioElement | null = null;
  private playedGoSound = false;

  mount(
    container: HTMLElement,
    _config: ReactionConfig,
    sendInput: (input: { action: "tap" }) => void,
    getPlayerId: () => string,
  ) {
    this.container = container;
    this.sendInput = sendInput;
    this.getPlayerId = getPlayerId;
    this.tapped = false;
    this.goSound = new Audio("/boing.mp3");
    this.goSound.preload = "auto";

    container.innerHTML = `
      <div class="reaction-game">
        <div class="reaction-round-info"></div>
        <div class="reaction-zone waiting">
          <span class="reaction-label">Wait...</span>
        </div>
        <div class="reaction-subtitle">
          <img class="reaction-monkey" src="/monkey.png" alt="" />
          <span class="reaction-subtitle-text"></span>
        </div>
        <div class="reaction-results"></div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .reaction-game {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
        width: 100%;
      }
      .reaction-round-info {
        font-size: 1.1rem;
        opacity: 0.7;
      }
      .reaction-zone {
        width: 100%;
        max-width: 500px;
        height: 250px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        user-select: none;
        touch-action: manipulation;
        transition: background-color 0.1s;
      }
      .reaction-zone.waiting {
        background: #c0392b;
      }
      .reaction-zone.go {
        background: #27ae60;
      }
      .reaction-zone.tapped {
        background: #2c3e50;
        cursor: default;
      }
      .reaction-zone.false-start {
        background: #e67e22;
      }
      .reaction-zone.round-over {
        background: #2c3e50;
        cursor: default;
      }
      .reaction-label {
        font-size: 2.5rem;
        font-weight: 900;
        color: #fff;
        text-transform: uppercase;
        pointer-events: none;
      }
      .reaction-subtitle {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        min-height: 2.5rem;
      }
      .reaction-monkey {
        width: 40px;
        height: 40px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .reaction-subtitle-text {
        font-size: 1rem;
        opacity: 0.8;
        font-style: italic;
        color: #e0e0e0;
      }
      .reaction-results {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .reaction-player-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: #16213e;
        border-radius: 6px;
        font-size: 0.9rem;
      }
      .reaction-player-row.me {
        border: 1px solid #e94560;
      }
      .reaction-player-row .rp-name { flex: 1; }
      .reaction-player-row .rp-time { font-weight: 600; min-width: 70px; text-align: right; }
      .reaction-player-row .rp-avg { opacity: 0.6; min-width: 80px; text-align: right; }
      .reaction-player-row .rp-false { color: #e67e22; }
    `;
    container.appendChild(style);

    const zone = container.querySelector(".reaction-zone");
    this.handleClick = () => {
      // Unlock audio on first user interaction (browser autoplay policy)
      if (this.goSound) {
        this.goSound.volume = 0;
        this.goSound.play().then(() => {
          this.goSound!.pause();
          this.goSound!.currentTime = 0;
          this.goSound!.volume = 1;
        }).catch(() => {});
      }
      if (this.tapped || !this.state || this.state.roundOver || this.state.finished) return;
      this.tapped = true;
      this.sendInput?.({ action: "tap" });
      this.renderZone();
    };
    zone?.addEventListener("click", this.handleClick);
  }

  onStateUpdate(state: ReactionState, _isDelta: boolean) {
    const myId = this.getPlayerId?.() ?? "";
    const me = state.players.find((p) => p.id === myId);

    const prevRound = this.state?.round;
    this.state = state;

    // Reset tapped flag on new round
    if (prevRound !== undefined && state.round !== prevRound) {
      this.tapped = false;
      this.playedGoSound = false;
    }

    // Sync tapped state from server (handles reconnection)
    if (me?.tappedThisRound) {
      this.tapped = true;
    }

    this.renderZone();
    this.renderRoundInfo();
    this.renderResults();
  }

  unmount() {
    const zone = this.container?.querySelector(".reaction-zone");
    if (zone && this.handleClick) {
      zone.removeEventListener("click", this.handleClick);
    }
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.container = null;
    this.sendInput = null;
    this.state = null;
  }

  private renderZone() {
    if (!this.container || !this.state) return;
    const zone = this.container.querySelector(".reaction-zone");
    const label = this.container.querySelector(".reaction-label");
    const subtitle = this.container.querySelector(".reaction-subtitle");
    if (!zone || !label) return;

    const myId = this.getPlayerId?.() ?? "";
    const me = this.state.players.find((p) => p.id === myId);
    const lastTime = me ? me.reactionTimes[me.reactionTimes.length - 1] : undefined;

    zone.className = "reaction-zone";
    let showSubtitle = false;

    if (this.state.finished) {
      zone.classList.add("round-over");
      label.textContent = "Game Over!";
    } else if (this.state.roundOver) {
      zone.classList.add("round-over");
      if (lastTime === FALSE_START) {
        label.textContent = "False start!";
      } else if (lastTime !== undefined) {
        label.textContent = `${lastTime}ms`;
        showSubtitle = true;
      } else {
        label.textContent = "Round over";
      }
    } else if (this.tapped) {
      if (lastTime === FALSE_START) {
        zone.classList.add("false-start");
        label.textContent = "Too early!";
      } else {
        zone.classList.add("tapped");
        label.textContent = lastTime !== undefined ? `${lastTime}ms` : "Tapped!";
        if (lastTime !== undefined) showSubtitle = true;
      }
    } else if (this.state.signalShown) {
      zone.classList.add("go");
      label.textContent = "TAP!";
      if (!this.playedGoSound && this.goSound) {
        this.playedGoSound = true;
        this.goSound.currentTime = 0;
        this.goSound.play().catch(() => {});
      }
    } else {
      zone.classList.add("waiting");
      label.textContent = "Wait...";
    }

    if (subtitle) {
      const subtitleText = subtitle.querySelector(".reaction-subtitle-text");
      if (showSubtitle && lastTime !== undefined && lastTime !== FALSE_START) {
        // Only pick a new subtitle if the time changed
        if (this.lastSubtitleTime !== lastTime) {
          this.lastSubtitleTime = lastTime;
          this.currentSubtitle = getSpeedSubtitle(lastTime);
        }
        if (subtitleText) subtitleText.textContent = this.currentSubtitle;
      } else {
        if (subtitleText) subtitleText.textContent = "";
        if (!showSubtitle) {
          this.lastSubtitleTime = undefined;
          this.currentSubtitle = null;
        }
      }
    }
  }

  private renderRoundInfo() {
    if (!this.container || !this.state) return;
    const info = this.container.querySelector(".reaction-round-info");
    if (!info) return;

    if (this.state.finished) {
      info.textContent = "Final Results";
    } else {
      info.textContent = `Round ${this.state.round} / ${this.state.totalRounds}`;
    }
  }

  private renderResults() {
    if (!this.container || !this.state) return;
    const results = this.container.querySelector(".reaction-results");
    if (!results) return;

    const myId = this.getPlayerId?.() ?? "";

    results.innerHTML = this.state.players
      .map((p) => {
        const lastTime = p.reactionTimes[p.reactionTimes.length - 1];
        const falseStarts = p.reactionTimes.filter((t) => t === FALSE_START).length;
        let timeStr = "-";
        if (lastTime === FALSE_START) {
          timeStr = "False start";
        } else if (lastTime !== undefined && lastTime > 0) {
          timeStr = `${lastTime}ms`;
        }

        return `
          <div class="reaction-player-row ${p.id === myId ? "me" : ""}">
            <span class="rp-name">${escapeHtml(p.name)}</span>
            <span class="rp-time ${lastTime === FALSE_START ? "rp-false" : ""}">${timeStr}</span>
            <span class="rp-avg">avg: ${p.avgMs < 9999 ? p.avgMs + "ms" : "-"}${falseStarts > 0 ? ` (${falseStarts}x early)` : ""}</span>
          </div>
        `;
      })
      .join("");
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
