import { describe, it, expect } from "vitest";
import { fieldRef, parseFieldRef } from "./fieldRef";

describe("fieldRef", () => {
  it("combines packId and fieldId", () => {
    expect(fieldRef("sports", "miles")).toBe("sports:miles");
  });

  it("round-trips via parseFieldRef", () => {
    const ref = fieldRef("pack-1", "field-2");
    expect(parseFieldRef(ref)).toEqual({ packId: "pack-1", fieldId: "field-2" });
  });

  it("throws on invalid ref", () => {
    expect(() => parseFieldRef("nocolon")).toThrow(/Invalid fieldRef/);
    expect(() => parseFieldRef(":field")).toThrow(/Invalid fieldRef/);
  });
});
