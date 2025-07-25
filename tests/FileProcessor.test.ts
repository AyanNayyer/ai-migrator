import { RateLimitError } from "openai";
import { FileProcessor } from "../src/FileProcessor";
import { buildNativePreset } from "../src/presets/buildNativePreset";
import { OpenAiResponseProvider } from "../src/responseProviders/OpenAiResponseProvider";
import { ClaudeResponseProvider } from "../src/responseProviders/ClaudeResponseProvider";
import { sleep } from "../src/common/sleep";

jest.mock("../src/responseProviders/OpenAiResponseProvider");
jest.mock("../src/responseProviders/ClaudeResponseProvider");
jest.mock("fs-extra", () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));
jest.mock("../src/common/sleep");

describe("File processor test", () => {
  it("retries on JSON when syntax error with OpenAI", async () => {
    const MockedResponseProvider = jest.mocked(OpenAiResponseProvider);

    const getResponseMock = jest.fn(async () => "invalid json");
    MockedResponseProvider.mockReturnValue({
      getResponse: getResponseMock,
    });

    const fileProcessor = FileProcessor(buildNativePreset("react"), {
      openAiApiKey: "dummy",
    });

    await expect(async () => {
      await fileProcessor.processFile("dummyFilepath", "");
    }).rejects.toThrow(SyntaxError);
    expect(getResponseMock).toHaveBeenCalledTimes(3);
  });

  it("retries on JSON when syntax error with Claude", async () => {
    const MockedClaudeProvider = jest.mocked(ClaudeResponseProvider);

    const getResponseMock = jest.fn(async () => "invalid json");
    MockedClaudeProvider.mockReturnValue({
      getResponse: getResponseMock,
    });

    const fileProcessor = FileProcessor(buildNativePreset("react"), {
      claudeApiKey: "dummy-claude-key",
      provider: "claude"
    });

    await expect(async () => {
      await fileProcessor.processFile("dummyFilepath", "");
    }).rejects.toThrow(SyntaxError);
    expect(getResponseMock).toHaveBeenCalledTimes(3);
  });

  it("retries on rate limit exceeded", async () => {
    const MockedResponseProvider = jest.mocked(OpenAiResponseProvider);

    const getResponseMock = jest.fn(() => {
      throw new RateLimitError(429, undefined, undefined, undefined);
    });
    MockedResponseProvider.mockReturnValue({
      getResponse: getResponseMock,
    });

    const fileProcessor = FileProcessor(buildNativePreset("react"), {
      openAiApiKey: "dummy",
    });

    const mockedSleep = jest.mocked(sleep);

    let resolve: (() => void) | null = null;

    mockedSleep.mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );

    fileProcessor.processFile("dummyFilepath", "");

    await afterEventLoopCycle();

    expect(getResponseMock).toHaveBeenCalledTimes(1);

    resolve!();

    await afterEventLoopCycle();

    expect(getResponseMock).toHaveBeenCalledTimes(2);
  });

  it("processes file with inline comments mode", async () => {
    const MockedResponseProvider = jest.mocked(OpenAiResponseProvider);
    const fs = require('fs-extra');

    const getResponseMock = jest.fn(async ({ inlineComments }) => {
      if (inlineComments) {
        return JSON.stringify({
          newFileContents: `{/* {"description": "test", "default": "Hello"} */}\n<T keyName="test" />`,
          keys: [{ name: "test", description: "test", default: "Hello" }]
        });
      }
      return JSON.stringify({
        newFileContents: `<T keyName="test" />`,
        keys: [{ name: "test", description: "test", default: "Hello" }]
      });
    });
    
    MockedResponseProvider.mockReturnValue({
      getResponse: getResponseMock,
    });

    fs.promises.readFile.mockResolvedValue('const hello = "Hello";');

    const fileProcessor = FileProcessor(buildNativePreset("react"), {
      openAiApiKey: "dummy",
    });

    const result = await fileProcessor.processFile("dummyFilepath", "", true);

    expect(getResponseMock).toHaveBeenCalledWith({
      fileContent: 'const hello = "Hello";',
      promptAppendix: "",
      inlineComments: true,
    });

    expect(result.keys).toHaveLength(1);
    expect(result.keys[0].name).toBe("test");
    
    // Should write file with inline comments
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      "dummyFilepath", 
      expect.stringContaining('{/* {"description": "test", "default": "Hello"} */}')
    );
  });

  it("skips writing when no keys are found", async () => {
    const MockedResponseProvider = jest.mocked(OpenAiResponseProvider);
    const fs = require('fs-extra');

    const getResponseMock = jest.fn(async () => {
      return JSON.stringify({
        newFileContents: 'const hello = "Hello";', // Same as original
        keys: [] // No keys
      });
    });
    
    MockedResponseProvider.mockReturnValue({
      getResponse: getResponseMock,
    });

    fs.promises.readFile.mockResolvedValue('const hello = "Hello";');
    fs.promises.writeFile.mockReset();

    const fileProcessor = FileProcessor(buildNativePreset("react"), {
      openAiApiKey: "dummy",
    });

    const result = await fileProcessor.processFile("dummyFilepath", "", false);

    expect(result.keys).toHaveLength(0);
    
    // Should NOT write file when no keys found
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });
});

function afterEventLoopCycle() {
  return new Promise((resolve) => setImmediate(resolve));
}
