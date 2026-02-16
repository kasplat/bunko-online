/** Client-side game module interface — each mini-game implements this */
export interface ClientGameModule<
  TState = unknown,
  TInput = unknown,
  TConfig = unknown,
> {
  readonly gameId: string;

  /** Mount the game into the container. Sets up DOM/canvas, event listeners. */
  mount(
    container: HTMLElement,
    config: TConfig,
    sendInput: (input: TInput) => void,
    getPlayerId: () => string,
  ): void;

  /** Called when server sends a game state update. */
  onStateUpdate(state: TState, isDelta: boolean): void;

  /** Called on every animation frame. dt is seconds since last frame. */
  onFrame?(dt: number): void;

  /** Cleanup: remove event listeners, canvas, etc. */
  unmount(): void;
}
