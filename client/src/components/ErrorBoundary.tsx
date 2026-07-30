/**
 * React Error Boundary for client-side crash protection (#30).
 *
 * Prevents unhandled render errors from collapsing the page into a blank screen.
 * Displays a luxury fallback screen with a reload button and logs errors to console.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ERROR_BOUNDARY_TRACKER] Client Render Failure:", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-obsidian p-6 text-center text-ivory">
          <div className="max-w-md rounded-2xl border border-smoke bg-charcoal p-8 shadow-2xl">
            <span className="text-4xl">⚠️</span>
            <h2 className="font-display mt-4 text-2xl font-bold text-gold">
              Something went wrong
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-ivory-dim">
              An unexpected display error occurred. Please refresh the page to return to your session.
            </p>

            {this.state.error && (
              <pre className="mt-4 max-h-24 overflow-x-auto rounded-lg bg-obsidian p-2 text-left font-mono text-[10px] text-amber-400">
                {this.state.error.message}
              </pre>
            )}

            <button
              type="button"
              onClick={this.handleReset}
              className="mt-6 w-full rounded-xl bg-gold py-3 text-xs font-bold uppercase tracking-wider text-obsidian transition hover:bg-gold-light"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
