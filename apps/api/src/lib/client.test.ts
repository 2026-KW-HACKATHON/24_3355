import { describe, expect, it } from "vitest";
import { addressGroup } from "./client.ts";

describe("addressGroup", () => {
  it("keeps IPv4 as is and turns IPv4-mapped IPv6 into IPv4", () => {
    // Then
    expect(addressGroup("192.0.2.1")).toBe("192.0.2.1");
    expect(addressGroup("::ffff:192.0.2.1")).toBe("192.0.2.1");
    expect(addressGroup("::FFFF:c000:0201")).toBe("192.0.2.1");
  });

  it("groups IPv6 addresses by /64", () => {
    // Then
    expect(addressGroup("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(addressGroup("2001:0db8:0001:0002:ffff:ffff:ffff:fffe")).toBe("2001:db8:1:2::/64");
    expect(addressGroup("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(addressGroup("fe80::1%en0")).toBe("fe80:0:0:0::/64");
    expect(addressGroup("::1")).toBe("0:0:0:0::/64");
  });

  it("leaves values that are not addresses alone", () => {
    // Then
    expect(addressGroup("unknown")).toBe("unknown");
  });
});
