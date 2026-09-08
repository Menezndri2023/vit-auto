import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom ne fournit pas ces API, que plusieurs écrans appellent au montage.
// Sans elles, l'échec du test ne dirait rien du code applicatif.
beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    });
  }
  window.scrollTo = window.scrollTo || (() => {});
  globalThis.IntersectionObserver = globalThis.IntersectionObserver || class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  };
  globalThis.ResizeObserver = globalThis.ResizeObserver || class {
    observe() {} unobserve() {} disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try { localStorage.clear(); } catch { /* stockage indisponible */ }
});
