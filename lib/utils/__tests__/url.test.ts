import { normalizeSandboxPreviewUrl } from "@/lib/utils/url"

describe("normalizeSandboxPreviewUrl", () => {
  it("normalizes host-only E2B domains to https", () => {
    expect(normalizeSandboxPreviewUrl("3000-sbx123.e2b.app")).toBe(
      "https://3000-sbx123.e2b.app"
    )
  })

  it("uses http for localhost hosts", () => {
    expect(normalizeSandboxPreviewUrl("localhost:3000")).toBe(
      "http://localhost:3000"
    )
  })

  it("keeps existing http/https URLs", () => {
    expect(normalizeSandboxPreviewUrl("https://3000-sbx123.e2b.app")).toBe(
      "https://3000-sbx123.e2b.app"
    )
    expect(normalizeSandboxPreviewUrl("http://localhost:3001")).toBe(
      "http://localhost:3001"
    )
  })

  it("rejects unsupported schemes and invalid values", () => {
    expect(normalizeSandboxPreviewUrl("ftp://example.com")).toBeNull()
    expect(normalizeSandboxPreviewUrl("")).toBeNull()
    expect(normalizeSandboxPreviewUrl("not a url with spaces")).toBeNull()
    expect(normalizeSandboxPreviewUrl("https://hello-world-test.lovable.app")).toBeNull()
  })
})
