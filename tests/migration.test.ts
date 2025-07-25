import { createProgram } from "../src/program";
import logger from "../src/utils/logger";

jest.mock("openai");
jest.mock("fast-glob");
jest.mock("fs-extra");
jest.mock("child_process");
jest.mock("../src/responseProviders/OpenAiResponseProvider");
jest.mock("../src/responseProviders/ClaudeResponseProvider");
jest.mock("../src/migrationStatus", () => ({
  loadMigrationStatus: jest.fn(),
  updateMigrationStatus: jest.fn(),
}));

import * as child_process from "child_process";
import fsExtra from "fs-extra";
import glob from "fast-glob";
import { OpenAiResponseProvider } from "../src/responseProviders/OpenAiResponseProvider";
import { ClaudeResponseProvider } from "../src/responseProviders/ClaudeResponseProvider";
import { ChatGptResponse } from "../src/responseProviders/responseFormat";
import { ResponseProvider } from "../src/responseProviders/ResponseProvider";

const mockedFilePaths = ["dummyFilepath.tsx", "dummyFilepath2.tsx"];

/**
 * This is integration test for the whole migration process.
 * It mocks only the necessary parts.
 */
describe("migration", () => {
  jest.spyOn(logger, "info");
  
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });
  
  it("migrates correctly with standard mode", async () => {
    const { mockedFs } = initMocks();
    
    // Mock migration status functions
    const { updateMigrationStatus } = require('../src/migrationStatus');

    await run();

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      "dummyFilepath.tsx",
      "newFileContents",
    );
    expect(mockedFs.writeFile).not.toHaveBeenCalledWith(
      "dummyFilepath2.tsx",
      "newFileContents",
    );
    
    // In standard mode, updateMigrationStatus should be called
    expect(updateMigrationStatus).toHaveBeenCalled();
    
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Migration completed"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Processed file: dummyFilepath2.tsx"),
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Processed file: dummyFilepath.tsx"),
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("2/2"));
  });

  it("migrates correctly with inline comments mode", async () => {
    const { mockedFs } = initMocks();
    
    // Mock migration status functions
    const { loadMigrationStatus, updateMigrationStatus } = require('../src/migrationStatus');
    loadMigrationStatus.mockResolvedValue({});
    updateMigrationStatus.mockResolvedValue(undefined);

    await runWithInlineComments();

    // In inline comments mode, files should be written
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      "dummyFilepath.tsx",
      "newFileContents",
    );
    
    // But updateMigrationStatus should NOT be called in inline comments mode
    expect(updateMigrationStatus).not.toHaveBeenCalled();
  });

  it("works with Claude provider", async () => {
    const { mockedFs } = initMocksForClaude();

    await runWithClaude();

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      "dummyFilepath.tsx",
      "newFileContents",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Migration completed"),
    );
  });
});

async function run() {
  const program = createProgram();
  await program.parseAsync([
    "npx",
    "tolgee-migrator",
    "migrate",
    "--preset",
    "react",
    "-k", 
    "dummy_api_key",
  ]);
}

async function runWithInlineComments() {
  const program = createProgram();
  await program.parseAsync([
    "npx",
    "tolgee-migrator",
    "migrate",
    "--preset",
    "react",
    "-k", 
    "dummy_api_key",
    "--inline-comments"
  ]);
}

async function runWithClaude() {
  const program = createProgram();
  await program.parseAsync([
    "npx",
    "tolgee-migrator",
    "migrate",
    "--preset",
    "react",
    "--provider",
    "claude",
    "--claude-api-key",
    "dummy_claude_key",
  ]);
}

const dummyOpenAiResponse: ChatGptResponse = {
  newFileContents: "newFileContents",
  keys: [
    {
      name: "key1",
      description: "description1",
      default: "default1",
    },
  ],
};

const emptyOpenAiResponse: ChatGptResponse = {
  newFileContents: "newFileContents",
  keys: [],
};

const resultingMigrationStatus = {
  "dummyFilepath2.tsx": {
    migrated: true,
    keys: [],
  },
  "dummyFilepath.tsx": {
    migrated: true,
    keys: [
      {
        name: "key1",
        description: "description1",
        default: "default1",
      },
    ],
  },
};

function initMocks() {
  jest.mocked(child_process).execSync.mockReturnValue("");
  jest.mocked(glob).mockResolvedValue(mockedFilePaths);

  // Mock migration status functions
  const { loadMigrationStatus, updateMigrationStatus } = require('../src/migrationStatus');
  loadMigrationStatus.mockResolvedValue({});
  updateMigrationStatus.mockResolvedValue(undefined);

  mockAiResponseProvider();

  const mockedFs = jest.mocked(fsExtra.promises);
  mockReadFile(mockedFs);

  return {
    mockedFs,
  };
}

function initMocksForClaude() {
  jest.mocked(child_process).execSync.mockReturnValue("");
  jest.mocked(glob).mockResolvedValue(mockedFilePaths);

  mockClaudeResponseProvider();

  const mockedFs = jest.mocked(fsExtra.promises);
  mockReadFile(mockedFs);

  return {
    mockedFs,
  };
}

function mockReadFile(mockedFs: jest.Mocked<typeof fsExtra.promises>) {
  mockedFs.readFile.mockImplementation(async (filePath) => {
    const isString = typeof filePath === "string";
    if (!isString) {
      throw new Error("Unexpected file read, missing mocked implementation");
    }
    if (mockedFilePaths.includes(filePath)) {
      return `${filePath} fileContent`;
    }
    if (isString && filePath.includes("migration-status.json")) {
      return "{}";
    }
    throw new Error("Unexpected file read, missing mocked implementation");
  });
}

function mockAiResponseProvider() {
  const MockedResponseProvider = jest.mocked(OpenAiResponseProvider);
  const getResponseMock: ResponseProvider["getResponse"] = jest.fn(
    async ({ fileContent, promptAppendix, inlineComments }) => {
      if (fileContent.includes("dummyFilepath.tsx")) {
        return JSON.stringify(dummyOpenAiResponse);
      }
      if (fileContent.includes("dummyFilepath2.tsx")) {
        return JSON.stringify(emptyOpenAiResponse);
      }
      throw new Error("Unexpected file content for mock");
    },
  );
  MockedResponseProvider.mockReturnValue({
    getResponse: getResponseMock,
  });
}

function mockClaudeResponseProvider() {
  const MockedClaudeProvider = jest.mocked(ClaudeResponseProvider);
  const getResponseMock: ResponseProvider["getResponse"] = jest.fn(
    async ({ fileContent, promptAppendix, inlineComments }) => {
      if (fileContent.includes("dummyFilepath.tsx")) {
        return JSON.stringify(dummyOpenAiResponse);
      }
      if (fileContent.includes("dummyFilepath2.tsx")) {
        return JSON.stringify(emptyOpenAiResponse);
      }
      throw new Error("Unexpected file content for mock");
    },
  );
  MockedClaudeProvider.mockReturnValue({
    getResponse: getResponseMock,
  });
}
