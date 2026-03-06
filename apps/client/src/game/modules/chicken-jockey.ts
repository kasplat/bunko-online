import type { ClientGameModule } from "../game-renderer";

interface ChickenConfig {
  pairings: Array<[string, string]>;
  playerNames: Record<string, string>;
  halfLane: number;
}

interface BroadcastPlayer {
  id: string;
  name: string;
  distance: number;
  speed: number;
  braking: boolean;
  stopped: boolean;
  crashed: boolean;
  score: number;
}

interface ChickenBroadcast {
  lanes: Array<{
    laneIndex: number;
    playerA: BroadcastPlayer;
    playerB: BroadcastPlayer;
    resolved: boolean;
  }>;
  finished: boolean;
}

interface ChickenInput {
  action: "brake_start" | "brake_stop";
}

export class ChickenJockeyClientModule
  implements ClientGameModule<ChickenBroadcast, ChickenInput, ChickenConfig>
{
  readonly gameId = "chicken-jockey";

  private container: HTMLElement | null = null;
  private sendInput: ((input: ChickenInput) => void) | null = null;
  private getPlayerId: (() => string) | null = null;
  private state: ChickenBroadcast | null = null;
  private config: ChickenConfig | null = null;
  private braking = false;

  private handlePointerDown: (() => void) | null = null;
  private handlePointerUp: (() => void) | null = null;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private handleKeyUp: ((e: KeyboardEvent) => void) | null = null;

  mount(
    container: HTMLElement,
    config: ChickenConfig,
    sendInput: (input: ChickenInput) => void,
    getPlayerId: () => string,
  ) {
    this.container = container;
    this.sendInput = sendInput;
    this.getPlayerId = getPlayerId;
    this.config = config;

    container.innerHTML = `
      <div class="chicken-game">
        <div class="chicken-header">
          <div class="chicken-title">Chicken Jockey</div>
          <div class="chicken-instruction">Hold to brake — stop as close to the center as you can!</div>
        </div>
        <div class="chicken-my-lane">
          <div class="chicken-lane">
            <div class="chicken-center-line"></div>
            <div class="chicken-player chicken-left"></div>
            <div class="chicken-player chicken-right"></div>
            <div class="chicken-label chicken-label-left"></div>
            <div class="chicken-label chicken-label-right"></div>
          </div>
        </div>
        <div class="chicken-brake-zone">HOLD TO BRAKE</div>
        <div class="chicken-other-lanes"></div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = CHICKEN_CSS;
    container.appendChild(style);

    const brakeZone = container.querySelector(".chicken-brake-zone") as HTMLElement;

    this.handlePointerDown = () => {
      this.startBrake();
    };
    this.handlePointerUp = () => {
      this.stopBrake();
    };

    brakeZone.addEventListener("pointerdown", this.handlePointerDown);
    brakeZone.addEventListener("pointerup", this.handlePointerUp);
    brakeZone.addEventListener("pointercancel", this.handlePointerUp);
    brakeZone.addEventListener("pointerleave", this.handlePointerUp);

    this.handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === "Space" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        this.startBrake();
      }
    };
    this.handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        this.stopBrake();
      }
    };

    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
  }

  onStateUpdate(state: ChickenBroadcast, _isDelta: boolean) {
    this.state = state;
    this.render();
  }

  unmount() {
    if (this.container) {
      const brakeZone = this.container.querySelector(".chicken-brake-zone");
      if (brakeZone && this.handlePointerDown) {
        brakeZone.removeEventListener("pointerdown", this.handlePointerDown);
      }
      if (brakeZone && this.handlePointerUp) {
        brakeZone.removeEventListener("pointerup", this.handlePointerUp);
        brakeZone.removeEventListener("pointercancel", this.handlePointerUp);
        brakeZone.removeEventListener("pointerleave", this.handlePointerUp);
      }
      this.container.innerHTML = "";
    }
    if (this.handleKeyDown) {
      document.removeEventListener("keydown", this.handleKeyDown);
    }
    if (this.handleKeyUp) {
      document.removeEventListener("keyup", this.handleKeyUp);
    }
    this.container = null;
    this.sendInput = null;
    this.getPlayerId = null;
    this.state = null;
    this.config = null;
    this.handlePointerDown = null;
    this.handlePointerUp = null;
    this.handleKeyDown = null;
    this.handleKeyUp = null;
  }

  private startBrake() {
    if (this.braking) return;
    if (!this.state || this.state.finished) return;
    const me = this.getMyPlayer();
    if (!me || me.stopped || me.crashed) return;
    this.braking = true;
    this.sendInput?.({ action: "brake_start" });
    this.container
      ?.querySelector(".chicken-brake-zone")
      ?.classList.add("braking");
  }

  private stopBrake() {
    if (!this.braking) return;
    this.braking = false;
    this.sendInput?.({ action: "brake_stop" });
    this.container
      ?.querySelector(".chicken-brake-zone")
      ?.classList.remove("braking");
  }

  private getMyPlayer(): BroadcastPlayer | null {
    if (!this.state || !this.config) return null;
    const myId = this.getPlayerId?.() ?? "";
    for (const lane of this.state.lanes) {
      if (lane.playerA.id === myId) return lane.playerA;
      if (lane.playerB.id === myId) return lane.playerB;
    }
    return null;
  }

  private getMyLane() {
    if (!this.state) return null;
    const myId = this.getPlayerId?.() ?? "";
    for (const lane of this.state.lanes) {
      if (lane.playerA.id === myId || lane.playerB.id === myId)
        return lane;
    }
    return null;
  }

  private render() {
    if (!this.container || !this.state || !this.config) return;

    const myId = this.getPlayerId?.() ?? "";
    const myLane = this.getMyLane();
    const halfLane = this.config.halfLane;

    // Update instruction
    const instruction = this.container.querySelector(".chicken-instruction");
    if (instruction) {
      const me = this.getMyPlayer();
      if (this.state.finished) {
        instruction.textContent = "Game over!";
      } else if (me?.crashed) {
        instruction.textContent = "You crashed!";
      } else if (me?.stopped) {
        instruction.textContent = "You stopped! Waiting for opponent...";
      } else if (myLane?.resolved) {
        instruction.textContent = "Lane resolved!";
      } else {
        instruction.textContent =
          "Hold to brake \u2014 stop as close to the center as you can!";
      }
    }

    // Render my lane
    if (myLane) {
      const isPlayerA = myLane.playerA.id === myId;
      const me = isPlayerA ? myLane.playerA : myLane.playerB;
      const opp = isPlayerA ? myLane.playerB : myLane.playerA;

      // Left player = me, right player = opponent
      const leftEl = this.container.querySelector(
        ".chicken-left",
      ) as HTMLElement;
      const rightEl = this.container.querySelector(
        ".chicken-right",
      ) as HTMLElement;
      const labelLeft = this.container.querySelector(
        ".chicken-label-left",
      ) as HTMLElement;
      const labelRight = this.container.querySelector(
        ".chicken-label-right",
      ) as HTMLElement;

      if (leftEl) {
        const pct = Math.min(50, (me.distance / halfLane) * 50);
        // Offset by box width (36px) so front edge = position
        leftEl.style.left = `calc(${pct}% - ${(pct / 50) * 36}px)`;
        leftEl.className = `chicken-player chicken-left${me.braking ? " braking" : ""}${me.stopped ? " stopped" : ""}${me.crashed ? " crashed" : ""}`;
      }
      if (rightEl) {
        const pct = Math.min(50, (opp.distance / halfLane) * 50);
        rightEl.style.right = `calc(${pct}% - ${(pct / 50) * 36}px)`;
        rightEl.className = `chicken-player chicken-right${opp.braking ? " braking" : ""}${opp.stopped ? " stopped" : ""}${opp.crashed ? " crashed" : ""}`;
      }

      if (labelLeft) {
        const progress = Math.round((me.distance / halfLane) * 100);
        labelLeft.textContent = me.stopped
          ? `${escapeHtml(me.name)} \u2014 ${me.score}pts`
          : `${escapeHtml(me.name)} (${progress}%)`;
        labelLeft.className = "chicken-label chicken-label-left me";
      }
      if (labelRight) {
        const progress = Math.round((opp.distance / halfLane) * 100);
        labelRight.textContent = opp.stopped
          ? `${escapeHtml(opp.name)} \u2014 ${opp.score}pts`
          : `${escapeHtml(opp.name)} (${progress}%)`;
        labelRight.className = "chicken-label chicken-label-right";
      }
    }

    // Brake zone visibility
    const brakeZone = this.container.querySelector(
      ".chicken-brake-zone",
    ) as HTMLElement;
    if (brakeZone) {
      const me = this.getMyPlayer();
      const shouldHide =
        this.state.finished ||
        me?.stopped ||
        me?.crashed ||
        myLane?.resolved;
      brakeZone.style.display = shouldHide ? "none" : "";
    }

    // Render other lanes
    const otherLanesEl = this.container.querySelector(".chicken-other-lanes");
    if (otherLanesEl && this.state.lanes.length > 1) {
      const others = this.state.lanes.filter(
        (l) => l.playerA.id !== myId && l.playerB.id !== myId,
      );

      if (others.length > 0) {
        otherLanesEl.innerHTML = `
          <div class="chicken-other-title">Other Lanes</div>
          ${others
            .map((lane) => {
              const aProgress = Math.round(
                (lane.playerA.distance / halfLane) * 100,
              );
              const bProgress = Math.round(
                (lane.playerB.distance / halfLane) * 100,
              );
              const status = lane.resolved ? "resolved" : "playing";
              const aStatus = lane.playerA.crashed
                ? "crashed"
                : lane.playerA.stopped
                  ? `stopped (${lane.playerA.score}pts)`
                  : `${aProgress}%`;
              const bStatus = lane.playerB.crashed
                ? "crashed"
                : lane.playerB.stopped
                  ? `stopped (${lane.playerB.score}pts)`
                  : `${bProgress}%`;

              return `<div class="chicken-other-lane ${status}">
              <span>${escapeHtml(lane.playerA.name)} [${aStatus}]</span>
              <span class="chicken-vs">vs</span>
              <span>${escapeHtml(lane.playerB.name)} [${bStatus}]</span>
            </div>`;
            })
            .join("")}
        `;
      } else {
        otherLanesEl.innerHTML = "";
      }
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CHICKEN_CSS = `
  .chicken-game {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
    user-select: none;
  }
  .chicken-header {
    text-align: center;
  }
  .chicken-title {
    font-size: 1.5rem;
    font-weight: 800;
    margin-bottom: 0.25rem;
  }
  .chicken-instruction {
    font-size: 1rem;
    color: #aaa;
  }
  .chicken-my-lane {
    width: 100%;
    max-width: 600px;
  }
  .chicken-lane {
    position: relative;
    width: 100%;
    height: 120px;
    background: #1a1a2e;
    border-radius: 12px;
    overflow: hidden;
  }
  .chicken-center-line {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #e94560;
    opacity: 0.6;
    transform: translateX(-50%);
  }
  .chicken-center-line::after {
    content: "CENTER";
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.6rem;
    color: #e94560;
    font-weight: 700;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }
  .chicken-player {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 36px;
    height: 36px;
    border-radius: 8px;
    transition: left 0.08s linear, right 0.08s linear;
  }
  .chicken-player.chicken-left {
    background: #3498db;
    left: 4%;
  }
  .chicken-player.chicken-right {
    background: #e67e22;
    right: 4%;
  }
  .chicken-player.braking {
    box-shadow: 0 0 16px #c0392b, 0 0 32px #c0392b88;
  }
  .chicken-player.stopped {
    border: 3px solid #27ae60;
    box-shadow: 0 0 12px #27ae6088;
  }
  .chicken-player.crashed {
    background: #c0392b;
    animation: chicken-shake 0.3s ease-in-out;
    box-shadow: 0 0 20px #c0392b;
  }
  @keyframes chicken-shake {
    0%, 100% { transform: translateY(-50%) translateX(0); }
    25% { transform: translateY(-50%) translateX(-6px); }
    75% { transform: translateY(-50%) translateX(6px); }
  }
  .chicken-label {
    position: absolute;
    bottom: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .chicken-label-left {
    left: 8px;
    color: #3498db;
  }
  .chicken-label-left.me {
    color: #5dade2;
    font-weight: 800;
  }
  .chicken-label-right {
    right: 8px;
    color: #e67e22;
    text-align: right;
  }
  .chicken-brake-zone {
    width: 100%;
    max-width: 600px;
    padding: 2rem;
    text-align: center;
    background: #16213e;
    border-radius: 12px;
    font-size: 1.3rem;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition: background 0.1s, box-shadow 0.1s;
  }
  .chicken-brake-zone:active,
  .chicken-brake-zone.braking {
    background: #c0392b;
    box-shadow: 0 0 20px #c0392b88;
  }
  .chicken-other-lanes {
    width: 100%;
    max-width: 600px;
  }
  .chicken-other-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: #888;
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .chicken-other-lane {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.4rem 0.8rem;
    background: #16213e;
    border-radius: 8px;
    font-size: 0.8rem;
    margin-bottom: 0.3rem;
  }
  .chicken-other-lane.resolved {
    opacity: 0.7;
  }
  .chicken-vs {
    color: #e94560;
    font-weight: 700;
    font-size: 0.7rem;
  }
`;
