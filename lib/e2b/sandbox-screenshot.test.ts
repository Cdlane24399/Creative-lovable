import { hasPngSignature } from "./sandbox-screenshot";

describe("hasPngSignature", () => {
  it("returns true for valid PNG signature", () => {
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
    ]);
    expect(hasPngSignature(bytes)).toBe(true);
  });

  it("returns false for corrupted PNG signature", () => {
    const bytes = Uint8Array.from([
      0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(hasPngSignature(bytes)).toBe(false);
  });
});
