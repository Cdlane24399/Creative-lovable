import { isValidScreenshotPayload } from "@/app/api/projects/[id]/screenshot/route";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function toPngDataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

describe("screenshot route payload validation", () => {
  it("accepts valid PNG data URLs", () => {
    const bytes = Buffer.alloc(128, 0);
    for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
      bytes[i] = PNG_SIGNATURE[i];
    }

    expect(isValidScreenshotPayload(toPngDataUrl(bytes))).toBe(true);
  });

  it("rejects invalid PNG signatures", () => {
    const bytes = Buffer.alloc(128, 0x41);
    expect(isValidScreenshotPayload(toPngDataUrl(bytes))).toBe(false);
  });

  it("accepts SVG placeholder data URLs", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

    expect(isValidScreenshotPayload(dataUrl)).toBe(true);
  });

  it("rejects unsupported payload formats", () => {
    expect(isValidScreenshotPayload("not-a-data-url")).toBe(false);
  });
});
