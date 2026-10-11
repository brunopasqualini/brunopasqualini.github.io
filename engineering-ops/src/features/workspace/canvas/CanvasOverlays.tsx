/** The colour key for connector types. */
export function CanvasLegend() {
  return (
    <div className="canvas-legend" aria-hidden="true">
      <span>
        <i className="lg lg-req" /> request
      </span>
      <span>
        <i className="lg lg-async" /> async / events
      </span>
      <span>
        <i className="lg lg-mon" /> monitoring
      </span>
      <span>
        <i className="lg lg-store" /> storage
      </span>
      <span>
        <i className="lg lg-crit" /> failing
      </span>
    </div>
  );
}

/** Shown while the canvas has no components to work with. */
export function CanvasEmptyHint() {
  return (
    <div className="canvas-empty">
      <strong>Your canvas is empty.</strong>
      <p>
        Drag components from the library, or click one to add it. Drag from a node’s right handle to another node’s left handle to connect
        them.
      </p>
    </div>
  );
}
