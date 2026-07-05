import "@testing-library/jest-dom/vitest";

// ── Silence jsdom's benign "Not implemented: navigation" noise ───────────────
// jsdom does not implement real page navigation. When a test clicks an <a href>
// (e.g. a nav link), the click handler runs correctly but jsdom then logs
// "Not implemented: navigation (except hash changes)" to console.error via its
// virtual console. It is a warning, not a failure. We drop only that exact
// message so genuine errors still surface.
const realConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0] as { message?: string } | string | undefined;
  const text =
    typeof first === "string"
      ? first
      : first && typeof first === "object" && typeof first.message === "string"
        ? first.message
        : "";
  if (text.includes("Not implemented: navigation")) return;
  realConsoleError(...(args as Parameters<typeof console.error>));
};
