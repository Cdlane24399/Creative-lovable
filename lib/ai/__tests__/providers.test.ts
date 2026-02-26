const mockGatewayModel = jest.fn();
const mockCreateOpenAI = jest.fn();
const mockOpenRouterModel = jest.fn();

jest.mock("ai", () => ({
  createGateway: () => mockGatewayModel,
}));

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: (...args: unknown[]) => mockCreateOpenAI(...args),
}));

describe("providers", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    delete process.env.OPENROUTER_BASE_URL;
    mockCreateOpenAI.mockReturnValue(mockOpenRouterModel);
  });

  it("includes openrouter as backup for every model", () => {
    const { getGatewayProviderOptions } = require("../providers") as typeof import("../providers");
    const modelKeys: import("../providers").ModelKey[] = [
      "anthropic",
      "opus",
      "google",
      "googlePro",
      "openai",
      "haiku",
      "minimax",
      "moonshot",
      "glm",
    ];

    for (const key of modelKeys) {
      expect(getGatewayProviderOptions(key).gateway.order).toContain("openrouter");
    }
  });

  it("uses GPT-5.3 Codex for the OpenAI model id", () => {
    const { getOpenRouterModel } = require("../providers") as typeof import("../providers");

    getOpenRouterModel("openai");

    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "openrouter",
      }),
    );
    expect(mockOpenRouterModel).toHaveBeenCalledWith("openai/gpt-5.3-codex");
  });
});
