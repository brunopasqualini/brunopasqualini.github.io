// jsdom lacks a few browser APIs that React Flow / Recharts expect.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? RO;
(globalThis as any).DOMMatrixReadOnly =
  (globalThis as any).DOMMatrixReadOnly ??
  class {
    m22 = 1;
    constructor(_?: string) {}
  };
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
if (!window.matchMedia) {
  (window as any).matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}
