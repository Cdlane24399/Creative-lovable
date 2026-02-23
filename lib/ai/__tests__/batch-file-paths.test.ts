import { resolveBatchFileRelativePath } from "@/lib/ai/tools/batch-file.tools";

describe("batch file path resolution", () => {
  it("rejects traversal input", () => {
    expect(() =>
      resolveBatchFileRelativePath("../etc/passwd", "app", "app"),
    ).toThrow();
  });

  it("preserves root-level paths", () => {
    expect(
      resolveBatchFileRelativePath("components/ui/button.tsx", "app", "app"),
    ).toBe("components/ui/button.tsx");
    expect(resolveBatchFileRelativePath("README.md", "app", "app")).toBe(
      "README.md",
    );
  });

  it("resolves app-relative paths for src/app runtime", () => {
    expect(resolveBatchFileRelativePath("dashboard/page.tsx", "app", "src/app")).toBe(
      "src/app/dashboard/page.tsx",
    );
    expect(resolveBatchFileRelativePath("app/layout.tsx", "app", "src/app")).toBe(
      "src/app/layout.tsx",
    );
  });
});
