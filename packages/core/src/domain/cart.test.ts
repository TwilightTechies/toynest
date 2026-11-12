import { describe, expect, it } from "vitest";
import { PincodeSchema, validatePersonalisation } from "./cart";

const plain = { attributes: { material: "Wood" } };
const named = { attributes: { material: "Wood", personalisation: "name" } };

describe("PincodeSchema", () => {
  it.each(["560001", " 781001 "])("accepts %s", (pin) => expect(PincodeSchema.safeParse(pin).success).toBe(true));
  it.each(["012345", "56001", "5600011", "56000a", ""])("rejects %s", (pin) =>
    expect(PincodeSchema.safeParse(pin).success).toBe(false),
  );
});

describe("validatePersonalisation", () => {
  it("requires a name for personalisable products", () => {
    expect(validatePersonalisation(named, "")).toEqual({ ok: false, error: "Enter a name" });
    expect(validatePersonalisation(named, undefined)).toMatchObject({ ok: false });
  });

  it("accepts and trims valid names, including Indian scripts", () => {
    expect(validatePersonalisation(named, "  Aarav ")).toEqual({ ok: true, name: "Aarav" });
    expect(validatePersonalisation(named, "D'Souza-Rao")).toEqual({ ok: true, name: "D'Souza-Rao" });
    expect(validatePersonalisation(named, "आरव")).toEqual({ ok: true, name: "आरव" });
  });

  it("rejects names that are too long or contain other characters", () => {
    expect(validatePersonalisation(named, "A".repeat(21))).toMatchObject({ ok: false });
    expect(validatePersonalisation(named, "<script>")).toMatchObject({ ok: false });
    expect(validatePersonalisation(named, "1st")).toMatchObject({ ok: false });
  });

  it("rejects a name for products that can't be personalised, and accepts none", () => {
    expect(validatePersonalisation(plain, "Aarav")).toMatchObject({ ok: false });
    expect(validatePersonalisation(plain, "  ")).toEqual({ ok: true, name: null });
  });
});
