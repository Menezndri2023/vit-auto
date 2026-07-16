import { describe, it, expect } from "vitest";
import { INCOTERMS, isIncotermCompatible } from "../constants/incoterms.js";

const MARITIME_ONLY = ["FAS", "FOB", "CFR", "CIF"];
const MULTIMODAL = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"];

describe("isIncotermCompatible", () => {
  it("expose bien 11 Incoterms 2020, répartis 7 multimodal + 4 maritime", () => {
    expect(INCOTERMS).toHaveLength(11);
    expect(INCOTERMS.filter((i) => i.group === "maritime").map((i) => i.code).sort()).toEqual([...MARITIME_ONLY].sort());
    expect(INCOTERMS.filter((i) => i.group === "multimodal").map((i) => i.code).sort()).toEqual([...MULTIMODAL].sort());
  });

  it.each(MARITIME_ONLY)("rejette %s si shippingType n'est pas maritime", (code) => {
    expect(isIncotermCompatible(code, "aerien")).toBe(false);
    expect(isIncotermCompatible(code, "terrestre")).toBe(false);
    expect(isIncotermCompatible(code, "multiple")).toBe(false);
  });

  it.each(MARITIME_ONLY)("accepte %s si shippingType est maritime ou absent", (code) => {
    expect(isIncotermCompatible(code, "maritime")).toBe(true);
    expect(isIncotermCompatible(code, null)).toBe(true);
    expect(isIncotermCompatible(code, undefined)).toBe(true);
  });

  it.each(MULTIMODAL)("accepte toujours %s, quel que soit le shippingType", (code) => {
    for (const st of ["maritime", "terrestre", "aerien", "multiple", null, undefined]) {
      expect(isIncotermCompatible(code, st)).toBe(true);
    }
  });

  it("accepte un code absent (Incoterm non précisé)", () => {
    expect(isIncotermCompatible(null, "aerien")).toBe(true);
    expect(isIncotermCompatible(undefined, "maritime")).toBe(true);
  });

  it("rejette un code inconnu", () => {
    expect(isIncotermCompatible("XXX", "maritime")).toBe(false);
  });
});
