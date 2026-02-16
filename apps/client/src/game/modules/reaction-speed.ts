import type { ClientGameModule } from "../game-renderer";

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

    container.innerHTML = `
      <div class="reaction-game">
        <div class="reaction-round-info"></div>
        <div class="reaction-zone waiting">
          <span class="reaction-label">Wait...</span>
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
      if (this.tapped || !this.state || this.state.roundOver || this.state.finished) return;
      this.tapped = true;
      this.sendInput?.({ action: "tap" });
      this.renderZone();
    };
    zone?.addEventListener("click", this.handleClick);
  }

  onStateUpdate(state: ReactionState, _isDelta: boolean) {
    const prevRound = this.state?.round;
    this.state = state;

    // Reset tapped flag on new round
    if (prevRound !== undefined && state.round !== prevRound) {
      this.tapped = false;
    }

    // Also check server state for our tapped status
    const myId = this.getPlayerId?.() ?? "";
    const me = state.players.find((p) => p.id === myId);
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
    if (!zone || !label) return;

    const myId = this.getPlayerId?.() ?? "";
    const me = this.state.players.find((p) => p.id === myId);
    const lastTime = me ? me.reactionTimes[me.reactionTimes.length - 1] : undefined;

    zone.className = "reaction-zone";

    if (this.state.finished) {
      zone.classList.add("round-over");
      label.textContent = "Game Over!";
    } else if (this.state.roundOver) {
      zone.classList.add("round-over");
      if (lastTime === -1) {
        label.textContent = "False start!";
      } else if (lastTime !== undefined) {
        label.textContent = `${lastTime}ms`;
      } else {
        label.textContent = "Round over";
      }
    } else if (this.tapped) {
      if (lastTime === -1) {
        zone.classList.add("false-start");
        label.textContent = "Too early!";
      } else {
        zone.classList.add("tapped");
        label.textContent = lastTime !== undefined ? `${lastTime}ms` : "Tapped!";
      }
    } else if (this.state.signalShown) {
      zone.classList.add("go");
      label.textContent = "TAP!";
    } else {
      zone.classList.add("waiting");
      label.textContent = "Wait...";
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
        const falseStarts = p.reactionTimes.filter((t) => t === -1).length;
        let timeStr = "-";
        if (lastTime === -1) {
          timeStr = "False start";
        } else if (lastTime !== undefined && lastTime > 0) {
          timeStr = `${lastTime}ms`;
        }

        return `
          <div class="reaction-player-row ${p.id === myId ? "me" : ""}">
            <span class="rp-name">${escapeHtml(p.name)}</span>
            <span class="rp-time ${lastTime === -1 ? "rp-false" : ""}">${timeStr}</span>
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
