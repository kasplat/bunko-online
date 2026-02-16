import type { ClientGameModule } from "../game-renderer";

interface TypeRacerConfig {
  text: string;
  durationSecs: number;
}

interface TypeRacerPlayerState {
  id: string;
  name: string;
  progress: number;
  wpm: number;
  finished: boolean;
}

interface TypeRacerState {
  text: string;
  players: TypeRacerPlayerState[];
  elapsedSecs: number;
  durationSecs: number;
}

export class TypeRacerClientModule
  implements ClientGameModule<TypeRacerState, { typed: string }, TypeRacerConfig>
{
  readonly gameId = "type-racer";

  private container: HTMLElement | null = null;
  private sendInput: ((input: { typed: string }) => void) | null = null;
  private getPlayerId: (() => string) | null = null;
  private typed = "";
  private text = "";
  private state: TypeRacerState | null = null;
  private inputEl: HTMLInputElement | null = null;
  private handleKeydown: (() => void) | null = null;

  mount(
    container: HTMLElement,
    config: TypeRacerConfig,
    sendInput: (input: { typed: string }) => void,
    getPlayerId: () => string,
  ) {
    this.container = container;
    this.sendInput = sendInput;
    this.getPlayerId = getPlayerId;
    this.text = config.text;
    this.typed = "";

    // Build DOM
    container.innerHTML = `
      <div class="type-racer">
        <div class="tr-text-display"></div>
        <div class="tr-progress-section"></div>
        <div class="tr-input-area">
          <input type="text" class="tr-input" placeholder="Start typing..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        </div>
        <div class="tr-stats"></div>
      </div>
    `;

    // Add styles
    const style = document.createElement("style");
    style.textContent = `
      .type-racer { display: flex; flex-direction: column; gap: 1.5rem; width: 100%; }
      .tr-text-display {
        font-family: 'Courier New', monospace;
        font-size: 1.2rem;
        line-height: 1.8;
        padding: 1rem;
        background: #16213e;
        border-radius: 8px;
        user-select: none;
      }
      .tr-text-display .typed { color: #2ecc71; }
      .tr-text-display .current { background: #e94560; color: #fff; padding: 0 1px; }
      .tr-text-display .remaining { color: #666; }
      .tr-text-display .error { color: #e74c3c; text-decoration: underline; }
      .tr-input {
        width: 100%;
        padding: 0.75rem 1rem;
        font-size: 1.1rem;
        font-family: 'Courier New', monospace;
        background: #0f3460;
        border: 2px solid #333;
        border-radius: 8px;
        color: #eee;
        text-align: left;
        max-width: 100%;
      }
      .tr-input:focus { outline: none; border-color: #e94560; }
      .tr-progress-section { display: flex; flex-direction: column; gap: 0.5rem; }
      .tr-player-progress {
        display: flex; align-items: center; gap: 0.75rem;
        font-size: 0.9rem;
      }
      .tr-player-progress .name { min-width: 80px; }
      .tr-player-progress .bar {
        flex: 1; height: 8px; background: #333; border-radius: 4px; overflow: hidden;
      }
      .tr-player-progress .bar-fill {
        height: 100%; background: #e94560; border-radius: 4px;
        transition: width 0.15s ease;
      }
      .tr-player-progress.me .bar-fill { background: #2ecc71; }
      .tr-player-progress .wpm { min-width: 60px; text-align: right; font-size: 0.8rem; opacity: 0.7; }
      .tr-player-progress .done { color: #2ecc71; font-weight: 600; }
      .tr-stats { display: flex; gap: 2rem; justify-content: center; font-size: 0.9rem; opacity: 0.7; }
    `;
    container.appendChild(style);

    this.inputEl = container.querySelector(".tr-input");
    this.inputEl?.focus();

    // Handle input
    this.handleKeydown = () => {
      requestAnimationFrame(() => {
        if (!this.inputEl || !this.sendInput) return;
        this.typed = this.inputEl.value;
        this.sendInput({ typed: this.typed });
        this.renderText();
      });
    };
    this.inputEl?.addEventListener("input", this.handleKeydown);

    this.renderText();
  }

  onStateUpdate(state: TypeRacerState, _isDelta: boolean) {
    this.state = state;
    this.renderProgress();
    this.renderStats();
  }

  unmount() {
    if (this.inputEl && this.handleKeydown) {
      this.inputEl.removeEventListener("input", this.handleKeydown);
    }
    if (this.container) {
      this.container.innerHTML = "";
    }
    this.container = null;
    this.sendInput = null;
    this.state = null;
  }

  private renderText() {
    if (!this.container) return;
    const display = this.container.querySelector(".tr-text-display");
    if (!display) return;

    const typedLen = this.typed.length;

    // Check if typed text matches
    const isCorrect = this.text.startsWith(this.typed);

    if (isCorrect) {
      const typed = this.text.slice(0, typedLen);
      const current = this.text[typedLen] ?? "";
      const remaining = this.text.slice(typedLen + 1);
      display.innerHTML =
        `<span class="typed">${this.escapeHtml(typed)}</span>` +
        `<span class="current">${this.escapeHtml(current)}</span>` +
        `<span class="remaining">${this.escapeHtml(remaining)}</span>`;
    } else {
      // Find where the mismatch starts
      let matchLen = 0;
      while (
        matchLen < typedLen &&
        matchLen < this.text.length &&
        this.typed[matchLen] === this.text[matchLen]
      ) {
        matchLen++;
      }
      const correct = this.text.slice(0, matchLen);
      const errorPart = this.text.slice(matchLen, typedLen);
      const remaining = this.text.slice(typedLen);
      display.innerHTML =
        `<span class="typed">${this.escapeHtml(correct)}</span>` +
        `<span class="error">${this.escapeHtml(errorPart)}</span>` +
        `<span class="remaining">${this.escapeHtml(remaining)}</span>`;
    }
  }

  private renderProgress() {
    if (!this.container || !this.state) return;
    const section = this.container.querySelector(".tr-progress-section");
    if (!section) return;

    const myId = this.getPlayerId?.() ?? "";

    section.innerHTML = this.state.players
      .map(
        (p) => `
        <div class="tr-player-progress ${p.id === myId ? "me" : ""}">
          <span class="name">${this.escapeHtml(p.name)}</span>
          <div class="bar">
            <div class="bar-fill" style="width: ${Math.round(p.progress * 100)}%"></div>
          </div>
          ${p.finished ? '<span class="done">Done!</span>' : `<span class="wpm">${p.wpm} WPM</span>`}
        </div>
      `,
      )
      .join("");
  }

  private renderStats() {
    if (!this.container || !this.state) return;
    const stats = this.container.querySelector(".tr-stats");
    if (!stats) return;

    const remaining = Math.max(
      0,
      this.state.durationSecs - this.state.elapsedSecs,
    );
    stats.innerHTML = `<span>Time: ${Math.ceil(remaining)}s</span>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}
