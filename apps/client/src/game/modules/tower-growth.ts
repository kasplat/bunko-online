import type { ClientGameModule } from "../game-renderer";

interface TowerConfig {
  targetHeight: number;
}

interface TowerPlayerState {
  id: string;
  name: string;
  height: number;
  tapCount: number;
  penaltyCount: number;
  finished: boolean;
  finishPosition: number; // 0 = not finished, 1 = 1st, etc.
}

interface TowerState {
  players: TowerPlayerState[];
  lightColor: "green" | "red";
  targetHeight: number;
  finished: boolean;
  finishOrder: string[];
}

const TOWER_COLORS = [
  "#e94560",
  "#0f3460",
  "#16c79a",
  "#f5a623",
  "#9b59b6",
  "#3498db",
  "#e67e22",
  "#1abc9c",
  "#e74c3c",
  "#2ecc71",
];

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

export class TowerGrowthClientModule
  implements ClientGameModule<TowerState, { action: "tap" }, TowerConfig>
{
  readonly gameId = "tower-growth";

  private container: HTMLElement | null = null;
  private sendInput: ((input: { action: "tap" }) => void) | null = null;
  private getPlayerId: (() => string) | null = null;
  private state: TowerState | null = null;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private handleTap: (() => void) | null = null;

  mount(
    container: HTMLElement,
    _config: TowerConfig,
    sendInput: (input: { action: "tap" }) => void,
    getPlayerId: () => string,
  ) {
    this.container = container;
    this.sendInput = sendInput;
    this.getPlayerId = getPlayerId;

    container.innerHTML = `
      <div class="tower-game">
        <div class="tower-header">
          <div class="tower-light red"></div>
          <div class="tower-instruction">Wait for GREEN, then tap!</div>
        </div>
        <div class="tower-arena">
          <div class="tower-finish-line"></div>
          <div class="tower-players"></div>
        </div>
        <div class="tower-tap-zone">TAP / SPACE</div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      .tower-game {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        width: 100%;
        user-select: none;
      }
      .tower-header {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .tower-light {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        transition: background-color 0.15s, box-shadow 0.15s;
      }
      .tower-light.green {
        background: #27ae60;
        box-shadow: 0 0 20px #27ae60, 0 0 40px #27ae6088;
      }
      .tower-light.red {
        background: #c0392b;
        box-shadow: 0 0 20px #c0392b, 0 0 40px #c0392b88;
      }
      .tower-instruction {
        font-size: 1.1rem;
        font-weight: 600;
      }
      .tower-arena {
        position: relative;
        width: 100%;
        max-width: 600px;
        height: 350px;
        background: #1a1a2e;
        border-radius: 12px;
        overflow: hidden;
      }
      .tower-finish-line {
        position: absolute;
        top: 10%;
        left: 0;
        right: 0;
        height: 3px;
        background: #9b59b6;
        box-shadow: 0 0 8px #9b59b6;
        z-index: 2;
      }
      .tower-finish-line::after {
        content: "FINISH";
        position: absolute;
        right: 8px;
        top: -18px;
        font-size: 0.7rem;
        color: #9b59b6;
        font-weight: 700;
        letter-spacing: 0.1em;
      }
      .tower-players {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        top: 0;
        display: flex;
        align-items: stretch;
        justify-content: center;
        padding: 0 1rem;
        z-index: 1;
      }
      .tower-col {
        position: relative;
        flex: 1;
        max-width: 80px;
        min-width: 30px;
      }
      .tower-bar-wrapper {
        position: absolute;
        top: 10%;
        bottom: 20px;
        left: 20%;
        right: 20%;
      }
      .tower-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        min-height: 2px;
        border-radius: 4px 4px 0 0;
        transition: height 0.1s ease-out;
      }
      .tower-bar.done {
        animation: tower-pulse 0.5s ease-in-out infinite alternate;
      }
      .tower-position {
        position: absolute;
        top: -18px;
        left: 0;
        right: 0;
        text-align: center;
        font-size: 0.65rem;
        font-weight: 800;
        color: #f5a623;
      }
      @keyframes tower-pulse {
        from { opacity: 1; }
        to { opacity: 0.6; }
      }
      .tower-name {
        position: absolute;
        bottom: 2px;
        left: 0;
        right: 0;
        font-size: 0.7rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: center;
      }
      .tower-name.me {
        color: #e94560;
        font-weight: 700;
      }
      .tower-tap-zone {
        width: 100%;
        max-width: 600px;
        padding: 1.5rem;
        text-align: center;
        background: #16213e;
        border-radius: 12px;
        font-size: 1.3rem;
        font-weight: 700;
        cursor: pointer;
        touch-action: manipulation;
        transition: background 0.1s;
      }
      .tower-tap-zone:active {
        background: #1a3a5c;
      }
    `;
    container.appendChild(style);

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        this.tap();
      }
    };
    document.addEventListener("keydown", this.handleKeyDown);

    const tapZone = container.querySelector(".tower-tap-zone");
    this.handleTap = () => this.tap();
    tapZone?.addEventListener("click", this.handleTap);
  }

  onStateUpdate(state: TowerState, _isDelta: boolean) {
    this.state = state;
    this.render();
  }

  unmount() {
    if (this.handleKeyDown) {
      document.removeEventListener("keydown", this.handleKeyDown);
      this.handleKeyDown = null;
    }
    if (this.container && this.handleTap) {
      const tapZone = this.container.querySelector(".tower-tap-zone");
      tapZone?.removeEventListener("click", this.handleTap);
      this.handleTap = null;
    }
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.container = null;
    this.sendInput = null;
    this.state = null;
  }

  private tap() {
    if (!this.state || this.state.finished) return;
    const myId = this.getPlayerId?.() ?? "";
    const me = this.state.players.find((p) => p.id === myId);
    if (me?.finished) return;
    this.sendInput?.({ action: "tap" });
  }

  private render() {
    if (!this.container || !this.state) return;

    const myId = this.getPlayerId?.() ?? "";
    const me = this.state.players.find((p) => p.id === myId);

    // Update light
    const light = this.container.querySelector(".tower-light");
    if (light) {
      light.className = `tower-light ${this.state.lightColor}`;
    }

    // Update instruction
    const instruction = this.container.querySelector(".tower-instruction");
    if (instruction) {
      if (this.state.finished) {
        const winner = this.state.finishOrder.length > 0
          ? this.state.players.find((p) => p.id === this.state!.finishOrder[0])
          : null;
        instruction.textContent = winner
          ? `${escapeHtml(winner.name)} wins!`
          : "Time's up!";
      } else if (me?.finished) {
        const pos = ORDINALS[me.finishPosition - 1] ?? `#${me.finishPosition}`;
        instruction.textContent = `You finished ${pos}! Waiting for others...`;
      } else if (this.state.lightColor === "green") {
        instruction.textContent = "TAP NOW!";
      } else {
        instruction.textContent = "Wait for GREEN...";
      }
    }

    // Update towers
    const playersContainer = this.container.querySelector(".tower-players");
    if (playersContainer) {
      const targetHeight = this.state.targetHeight;

      playersContainer.innerHTML = this.state.players
        .map((p, i) => {
          const pct = Math.min(100, (p.height / targetHeight) * 100);
          const color = TOWER_COLORS[i % TOWER_COLORS.length];
          const isMe = p.id === myId;
          const posLabel = p.finishPosition > 0
            ? ORDINALS[p.finishPosition - 1] ?? `#${p.finishPosition}`
            : "";

          return `
            <div class="tower-col">
              <div class="tower-bar-wrapper">
                <div class="tower-bar ${p.finished ? "done" : ""}"
                     style="height: ${pct}%; background: ${color};">
                  ${posLabel ? `<div class="tower-position">${posLabel}</div>` : ""}
                </div>
              </div>
              <div class="tower-name ${isMe ? "me" : ""}">${escapeHtml(p.name)}</div>
            </div>
          `;
        })
        .join("");
    }

    // Hide tap zone when current player finished or game is over
    const tapZone = this.container.querySelector(
      ".tower-tap-zone",
    ) as HTMLElement | null;
    if (tapZone) {
      tapZone.style.display = (this.state.finished || me?.finished) ? "none" : "";
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
