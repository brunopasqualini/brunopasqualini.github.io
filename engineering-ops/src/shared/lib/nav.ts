/**
 * Imperative navigation for event handlers that live outside the router tree's reach
 * (store actions, toasts, modals). The app binds the real router on start; until then
 * (and in isolated component tests) it falls back to the URL hash.
 */
type Navigator = (to: string) => void | Promise<void>;

let navigator: Navigator = (to) => {
  window.location.hash = `#${to}`;
};

export const bindNavigator = (fn: Navigator) => {
  navigator = fn;
};

export const go = (path: string) => {
  void navigator(path.replace(/^#/, ''));
};
