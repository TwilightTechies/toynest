import { describe, expect, it } from "vitest";
import { resolveShippingZone, type ShippingZone } from "./shipping";

const zone = (slug: string, prefixes: string[], isDefault = false): ShippingZone => ({
  id: `00000000-0000-4000-8000-00000000000${slug.length}`,
  slug,
  name: slug,
  feeMinor: 4900,
  freeOverMinor: 49900,
  pincodePrefixes: prefixes,
  isDefault,
});

const metro = zone("metro", ["110", "400", "560", "600", "700", "500"]);
const remote = zone("remote", ["78", "79", "18", "19", "744"]);
const rest = zone("rest", [], true);
const zones = [metro, remote, rest];

describe("resolveShippingZone", () => {
  it.each([
    ["560001", "metro"],
    ["110001", "metro"],
    ["781001", "remote"],
    ["744101", "remote"],
    ["190001", "remote"],
    ["302001", "rest"],
  ])("%s -> %s", (pincode, slug) => {
    expect(resolveShippingZone(pincode, zones)?.slug).toBe(slug);
  });

  it("prefers the longest matching prefix", () => {
    const broad = zone("broad", ["7"]);
    expect(resolveShippingZone("744101", [broad, remote, rest])?.slug).toBe("remote");
    expect(resolveShippingZone("711101", [broad, remote, rest])?.slug).toBe("broad");
  });

  it("returns null when nothing matches and there is no default", () => {
    expect(resolveShippingZone("302001", [metro, remote])).toBeNull();
  });
});
