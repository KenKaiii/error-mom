/**
 * Route-level loading state styled as a classic "Please wait" system
 * window: striped title bar, pixel wristwatch with a stepped sweep hand,
 * and an ellipsis that types itself. Reuses the project-dialog chrome so
 * it matches every other window in the app.
 */
export function LoadingWindow({ title, message }: { title: string; message: string }) {
  return (
    <main className="loading-screen">
      <div className="project-dialog loading-window" role="status" aria-live="polite">
        <header className="project-dialog-header">
          <h2>{title}</h2>
        </header>
        <div className="loading-body">
          <WatchIcon />
          <p>
            {message}
            <span className="loading-dots" aria-hidden="true" />
          </p>
        </div>
      </div>
    </main>
  );
}

/** Pixel wristwatch, the classic Mac wait cursor at window scale. */
function WatchIcon() {
  return (
    <svg className="watch-icon" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <rect x="10" y="1" width="12" height="5" fill="currentColor" />
      <rect x="10" y="26" width="12" height="5" fill="currentColor" />
      <rect x="6" y="6" width="20" height="20" fill="#fff" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="8" width="2" height="2" fill="currentColor" />
      <rect x="15" y="22" width="2" height="2" fill="currentColor" />
      <rect x="8" y="15" width="2" height="2" fill="currentColor" />
      <rect x="22" y="15" width="2" height="2" fill="currentColor" />
      <rect x="15" y="15" width="6" height="2" fill="currentColor" />
      <g className="watch-hand">
        <rect x="15" y="9" width="2" height="8" fill="currentColor" />
      </g>
    </svg>
  );
}
