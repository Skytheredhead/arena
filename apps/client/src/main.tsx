import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CrashBoundary } from './app/CrashBoundary';
import './index.css';

const installFatalOverlay = (): void => {
  const overlayId = 'fatal-startup-overlay';

  const showFatal = (label: string, detail: string): void => {
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '2147483647';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.padding = '24px';
      overlay.style.background = 'rgba(8, 17, 28, 0.96)';
      overlay.style.color = '#d6e5f4';
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <div style="width:min(840px, 100%); border:1px solid rgba(255,125,87,0.35); border-radius:28px; background:rgba(2,6,23,0.96); padding:24px; box-shadow:0 0 0 1px rgba(114,247,255,0.18), 0 12px 42px rgba(4,10,18,0.44);">
        <p style="margin:0; font:600 12px/1.2 Rajdhani, sans-serif; letter-spacing:0.35em; text-transform:uppercase; color:#ff7d57;">${label}</p>
        <h1 style="margin:14px 0 0; font:700 40px/1 Rajdhani, sans-serif; letter-spacing:0.08em; text-transform:uppercase;">UI failed visibly</h1>
        <p style="margin:14px 0 0; color:#9ab0c9; font:400 14px/1.5 'IBM Plex Sans', sans-serif;">A runtime exception was captured before the page could stay mounted.</p>
        <pre style="margin:18px 0 0; padding:16px; white-space:pre-wrap; border-radius:18px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.28); color:#fed7aa; font:13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;">${detail.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character] ?? character))}</pre>
      </div>
    `;
  };

  window.addEventListener('error', event => {
    const errorValue: unknown = event.error;
    const detail =
      errorValue instanceof Error
        ? errorValue.stack ?? errorValue.message
        : event.message;
    showFatal('Window Error', detail);
  });

  window.addEventListener('unhandledrejection', event => {
    const reason =
      event.reason instanceof Error
        ? event.reason.stack ?? event.reason.message
        : String(event.reason);

    // Keep the page usable for recoverable async failures (e.g. connection/schema mismatch).
    // We surface these through app state instead of replacing the entire UI.
    console.error('Unhandled promise rejection:', reason);
  });
};

installFatalOverlay();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <CrashBoundary>
    <App />
  </CrashBoundary>
);
