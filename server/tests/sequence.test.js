import { describe, it, expect } from "vitest";
import { prochainNumero, formatReference } from "../utils/sequence.js";

describe("sequence — références atomiques", () => {
  it("amorce depuis l'existant puis incrémente sans doublon sous concurrence", async () => {
    const nums = await Promise.all(Array.from({ length: 25 }, () => prochainNumero("t:2026", async () => 40)));
    expect(new Set(nums).size).toBe(25);
    expect(Math.min(...nums)).toBe(41);
    expect(Math.max(...nums)).toBe(65);
    expect(formatReference("VA-LEAD", 2026, 41)).toBe("VA-LEAD-2026-000041");
  });
});
