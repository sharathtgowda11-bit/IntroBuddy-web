import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement ResizeObserver; Radix UI's Checkbox reads element
// size with it, so tests need a no-op stand-in to mount without crashing.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
