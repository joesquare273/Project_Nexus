// If drawing the board fails, show a way out instead of a blank page. In an
// online game the game itself is safe on the server: "Try again" redraws the
// board from the latest state, and "Back to the menu" leaves it (a table or
// draft event can be rejoined).

import { Component, type ReactNode } from 'react';
import { connectionLog } from '../game/online.ts';

interface Props {
  children: ReactNode;
  onQuit: () => void;
}

export class GameErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    console.error('The board could not be drawn:', error);
    connectionLog('board-error', { error: error.message, stack: error.stack?.split('\n').slice(0, 6).join('\n') });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="board-error" role="alert">
        <h2>Something went wrong drawing the game.</h2>
        <p>{this.state.error.message}</p>
        <div className="board-error-buttons">
          <button className="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button onClick={this.props.onQuit}>Back to the menu</button>
        </div>
      </div>
    );
  }
}
