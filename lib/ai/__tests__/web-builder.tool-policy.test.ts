jest.mock(
  "@tavily/ai-sdk",
  () => ({
    tavilySearch: () => ({ execute: jest.fn() }),
  }),
  { virtual: true },
);

import {
  selectActiveToolsForStep,
  WEB_BUILDER_TOKEN_CAPS,
  WEB_BUILDER_TOOLSETS,
} from "@/lib/ai/agents/web-builder";

describe("web-builder tool policy", () => {
  it("keeps markStepComplete in planning tools", () => {
    expect(WEB_BUILDER_TOOLSETS.planning).toContain("markStepComplete");
  });

  it("forces research on step zero for new projects", () => {
    const selection = selectActiveToolsForStep({
      stepNumber: 0,
      maxSteps: 24,
      cumulativeTokens: 0,
      hasBuildErrors: false,
      serverRunning: false,
      hasTaskGraph: false,
      isNewProject: true,
    });

    expect(selection.reason).toBe("forced_research_new_project");
    expect(selection.forceToolName).toBe("research");
    expect(selection.activeTools).toContain("markStepComplete");
  });

  it("retains planning controls when token constrained", () => {
    const selection = selectActiveToolsForStep({
      stepNumber: 4,
      maxSteps: 24,
      cumulativeTokens: WEB_BUILDER_TOKEN_CAPS.soft + 1,
      hasBuildErrors: false,
      serverRunning: true,
      hasTaskGraph: true,
      isNewProject: false,
    });

    expect(selection.reason).toBe("token_constrained");
    expect(selection.activeTools).toContain("markStepComplete");
    expect(selection.activeTools).toContain("syncProject");
  });

  it("disables tools at hard cap", () => {
    const selection = selectActiveToolsForStep({
      stepNumber: 6,
      maxSteps: 24,
      cumulativeTokens: WEB_BUILDER_TOKEN_CAPS.hard + 1,
      hasBuildErrors: false,
      serverRunning: false,
      hasTaskGraph: false,
      isNewProject: false,
    });

    expect(selection.reason).toBe("token_hard_cap");
    expect(selection.activeTools).toHaveLength(0);
  });
});
