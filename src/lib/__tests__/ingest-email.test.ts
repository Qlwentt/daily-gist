import { describe, it, expect } from "vitest";
import { parseEmailDate } from "../ingest-email";

describe("parseEmailDate", () => {
  it("parses RFC 2822 date", () => {
    const result = parseEmailDate("Sun, 22 Feb 2026 13:37:56 +0000");
    expect(result).toBe("2026-02-22T13:37:56.000Z");
  });

  it("parses RFC 2822 with named timezone in parens", () => {
    // Some mailers append "(UTC)" or "(EST)" — the helper strips it
    const result = parseEmailDate("Sun, 22 Feb 2026 13:37:56 +0000 (UTC)");
    expect(result).toBe("2026-02-22T13:37:56.000Z");
  });

  it("parses RFC 2822 with offset timezone", () => {
    const result = parseEmailDate("Sat, 21 Feb 2026 08:37:56 -0500");
    expect(result).toBe("2026-02-21T13:37:56.000Z");
  });

  it("parses ISO 8601 (already valid Postmark format)", () => {
    const result = parseEmailDate("2026-02-22T13:37:56.000Z");
    expect(result).toBe("2026-02-22T13:37:56.000Z");
  });

  it("falls back to now for undefined", () => {
    const before = Date.now();
    const result = parseEmailDate(undefined);
    const after = Date.now();
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("falls back to now for garbage input", () => {
    const before = Date.now();
    const result = parseEmailDate("not a date at all");
    const after = Date.now();
    const ts = new Date(result).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("always returns a valid ISO 8601 string", () => {
    const inputs = [
      "Sun, 22 Feb 2026 13:37:56 +0000",
      "2026-02-22T13:37:56.000Z",
      undefined,
      "garbage",
    ];
    for (const input of inputs) {
      const result = parseEmailDate(input);
      expect(new Date(result).toISOString()).toBe(result);
    }
  });
});
