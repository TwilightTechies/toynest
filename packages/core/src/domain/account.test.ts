import { describe, expect, it } from "vitest";
import {
  formatIndianMobile,
  PhoneCodeVerifySchema,
  planCartMerge,
  SignUpSchema,
  toIndianE164,
} from "./account";
import type { CartLine } from "./cart";

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
let n = 0;
const line = (productId: string, quantity: number, personalisationName: string | null = null): CartLine => ({
  id: `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`,
  productId,
  quantity,
  personalisationName,
});

describe("toIndianE164", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["91 9876543210", "+919876543210"],
  ])("normalises %s", (raw, expected) => {
    expect(toIndianE164(raw)).toBe(expected);
  });

  it.each(["12345", "5876543210", "+44 7700 900123", ""])("rejects %s", (raw) => {
    expect(toIndianE164(raw)).toBeNull();
  });
});

describe("formatIndianMobile", () => {
  it("formats and masks", () => {
    expect(formatIndianMobile("+919876543210")).toBe("98765 43210");
    expect(formatIndianMobile("+919876543210", { masked: true })).toBe("98xxxxxx10");
  });
});

describe("planCartMerge", () => {
  it("adds guest lines the account basket doesn't have", () => {
    expect(planCartMerge([line(P1, 2)], [])).toEqual([{ productId: P1, personalisationName: null, quantity: 2 }]);
  });

  it("caps a shared line at 10 and skips it when already full", () => {
    expect(planCartMerge([line(P1, 6)], [line(P1, 7)])).toEqual([{ productId: P1, personalisationName: null, quantity: 3 }]);
    expect(planCartMerge([line(P1, 1)], [line(P1, 10)])).toEqual([]);
  });

  it("treats a different engraved name as a different line, matching the database key exactly", () => {
    const adds = planCartMerge([line(P1, 1, "Aarav"), line(P1, 1, "aarav")], [line(P1, 10, "Meera")]);
    expect(adds).toEqual([
      { productId: P1, personalisationName: "Aarav", quantity: 1 },
      { productId: P1, personalisationName: "aarav", quantity: 1 },
    ]);
  });

  it("keeps different products apart", () => {
    expect(planCartMerge([line(P2, 4)], [line(P1, 9)])).toEqual([{ productId: P2, personalisationName: null, quantity: 4 }]);
  });
});

describe("auth form schemas", () => {
  it("normalises sign-up email and enforces password length", () => {
    expect(SignUpSchema.parse({ name: " Asha ", email: " Asha@Example.COM ", password: "longenough" })).toEqual({
      name: "Asha",
      email: "asha@example.com",
      password: "longenough",
    });
    expect(SignUpSchema.safeParse({ name: "Asha", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(SignUpSchema.safeParse({ name: "Asha", email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
  });

  it("needs a 6-digit code and an Indian mobile", () => {
    expect(PhoneCodeVerifySchema.parse({ phone: "98765 43210", code: " 123456 " })).toEqual({
      phone: "+919876543210",
      code: "123456",
    });
    expect(PhoneCodeVerifySchema.safeParse({ phone: "9876543210", code: "12345" }).success).toBe(false);
  });
});
