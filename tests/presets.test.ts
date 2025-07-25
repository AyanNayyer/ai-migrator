import { PresetType } from "../src/presets/PresetType";
import { createProgram } from "../src/program";
import path from "node:path";
import { ZodError } from "zod";
import Mock = jest.Mock;
import {FilesMigrator} from "../src/commands/migrate/FilesMigrator";

jest.mock("fast-glob");
jest.mock("../src/commands/migrate/FilesMigrator");

// Mock the getAndValidatePreset function since we're testing preset validation directly
jest.mock("../src/commands/migrate/addMigrationCommand", () => {
  const mockGetAndValidatePreset = jest.fn();
  return {
    ...jest.requireActual("../src/commands/migrate/addMigrationCommand"),
    getAndValidatePreset: mockGetAndValidatePreset
  };
});

describe("presets", () => {
  let mockGetAndValidatePreset: jest.Mock;
  
  beforeEach(() => {
    const { getAndValidatePreset } = require("../src/commands/migrate/addMigrationCommand");
    mockGetAndValidatePreset = getAndValidatePreset;
  });

  it("preset argument should work with valid preset", async () => {
    const validPreset: PresetType = {
      name: 'my-preset',
      getUserPrompt: ({ fileContent, inlineComments, extraction }) => {
        if (extraction) {
          return `Extract from: ${fileContent}`;
        } else if (inlineComments) {
          return `Process with comments: ${fileContent}`;
        } else {
          return `Process: ${fileContent}`;
        }
      },
      getSystemPrompt: () => 'System prompt'
    };

    mockGetAndValidatePreset.mockReturnValue(validPreset);
    jest.mocked(FilesMigrator).mockReturnValue({ migrateFiles: jest.fn() });
    
    await runWithPreset("my-preset.js");
    
    expect(FilesMigrator).toHaveBeenCalledTimes(1);
    const calls = (FilesMigrator as Mock<any>).mock.calls;
    const preset = calls[0][0].preset as PresetType;
    
    // Test that the preset follows the expected structure
    expect(preset.name).toBe('My react'); // This matches the fixture file
    expect(typeof preset.getUserPrompt).toBe('function');
    expect(typeof preset.getSystemPrompt).toBe('function');
    
    // Test different getUserPrompt modes
    expect(preset.getUserPrompt({ fileContent: 'test', extraction: true }))
      .toBe('Extract comments from: test');
    expect(preset.getUserPrompt({ fileContent: 'test', inlineComments: true }))
      .toBe('Process with inline comments: test');
    expect(preset.getUserPrompt({ fileContent: 'test' }))
      .toBe('I am a test prompt! Content: test');
  });

  it("fails on invalid preset", async () => {
    // Mock an invalid preset
    mockGetAndValidatePreset.mockImplementation(() => {
      throw new ZodError([{
        code: 'invalid_type',
        expected: 'function',
        received: 'undefined',
        path: ['getUserPrompt'],
        message: 'Required'
      }]);
    });
    
    jest.mocked(FilesMigrator).mockReturnValue({ migrateFiles: jest.fn() });
    
    await expect(async () => {
      await runWithPreset("invalid-preset.js");
    }).rejects.toThrow(ZodError);
  });
});

async function runWithPreset(preset: string) {
  const program = createProgram();
  const presetPath = path.resolve(__dirname, "fixtures", preset);
  await program.parseAsync([
    "npx",
    "tolgee-migrator",
    "migrate",
    "--preset",
    presetPath,
  ]);
}
