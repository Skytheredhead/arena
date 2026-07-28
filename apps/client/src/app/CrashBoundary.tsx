import { Component, type ErrorInfo, type ReactNode } from 'react';

interface CrashBoundaryProps {
  children: ReactNode;
}

interface CrashBoundaryState {
  error: Error | null;
}

export class CrashBoundary extends Component<
  CrashBoundaryProps,
  CrashBoundaryState
> {
  override state: CrashBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): CrashBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Arena client crashed', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        role="alert"
        style={{
          minHeight: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          color: '#dffcff',
          background:
            'radial-gradient(circle at center,rgba(255,35,85,.12),#020711 58%)',
          fontFamily: 'monospace',
        }}
      >
        <section
          style={{
            width: 'min(620px,94vw)',
            padding: '28px',
            border: '1px solid rgba(255,62,99,.6)',
            background: 'rgba(4,12,22,.9)',
            boxShadow: '0 0 48px rgba(255,40,90,.16)',
          }}
        >
          <h1 style={{ marginTop: 0, letterSpacing: '3px' }}>
            ARENA CLIENT FAULT
          </h1>
          <p>The renderer was stopped safely. Reload to reconnect.</p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              color: '#ff7893',
            }}
          >
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 16px', cursor: 'pointer' }}
          >
            Reload Arena
          </button>
        </section>
      </main>
    );
  }
}
