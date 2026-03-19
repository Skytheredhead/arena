import React from 'react';

interface CrashBoundaryProps {
  children: React.ReactNode;
}

interface CrashBoundaryState {
  errorMessage: string | null;
}

export class CrashBoundary extends React.Component<
  CrashBoundaryProps,
  CrashBoundaryState
> {
  override state: CrashBoundaryState = {
    errorMessage: null
  };

  static getDerivedStateFromError(error: unknown): CrashBoundaryState {
    return {
      errorMessage:
        error instanceof Error ? error.message : 'The UI crashed during startup.'
    };
  }

  override componentDidCatch(error: unknown): void {
    console.error('CrashBoundary caught an error', error);
  }

  override render(): React.ReactNode {
    if (!this.state.errorMessage) {
      return this.props.children;
    }

    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-[#08111c] p-6 text-mist">
        <div className="w-full max-w-2xl rounded-[28px] border border-signal/30 bg-slate-950/94 p-6 shadow-hud">
          <p className="font-display text-xs uppercase tracking-[0.35em] text-signal">
            Startup Error
          </p>
          <h1 className="mt-3 font-display text-4xl uppercase tracking-[0.08em] text-mist">
            UI crash intercepted
          </h1>
          <p className="mt-3 text-sm text-steel">
            The app hit an exception while rendering. The first captured message is below.
          </p>
          <pre className="mt-5 overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-orange-200">
            {this.state.errorMessage}
          </pre>
        </div>
      </div>
    );
  }
}
