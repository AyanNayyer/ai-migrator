import { FileProcessor } from '../src/FileProcessor';
import fsExtra from 'fs-extra';
import { PresetType } from '../src/presets/PresetType';
import { AiProviderOptions } from '../src/responseProviders/createResponseProvider';

jest.mock('fs-extra');
const mockedFs = jest.mocked(fsExtra.promises);

// Mock the response provider
jest.mock('../src/responseProviders/createResponseProvider', () => ({
  createResponseProvider: jest.fn(),
}));

// Mock the retry functions
jest.mock('../src/common/retryOnError', () => ({
  retryOnError: jest.fn(({ callback }) => callback()),
  retryOnRateLimit: jest.fn(({ callback }) => callback()),
}));

describe('FileProcessor with inline comments', () => {
  const dummyPreset: PresetType = {
    name: 'test-preset',
    getUserPrompt: ({ fileContent }) => `Process this content: ${fileContent}`,
    getSystemPrompt: () => 'You are a helpful assistant',
  };
  
  const dummyProviderOptions: AiProviderOptions = {
    openAiApiKey: 'dummy-key',
  };
  
  let fileProcessor: ReturnType<typeof FileProcessor>;

  beforeEach(() => {
    // Set up the mock before creating FileProcessor
    const { createResponseProvider } = require('../src/responseProviders/createResponseProvider');
    const mockResponseProvider = {
      getResponse: jest.fn().mockResolvedValue(JSON.stringify({
        newFileContents: '<T keyName="greeting" />',
        keys: [
          { name: 'greeting', description: 'Greeting message', default: 'Hello' },
        ],
      })),
    };
    createResponseProvider.mockReturnValue(mockResponseProvider);

    fileProcessor = FileProcessor(dummyPreset, dummyProviderOptions);
    mockedFs.readFile.mockReset();
    mockedFs.writeFile.mockReset();
  });

  it('should insert inline comments above Tolgee SDK calls', async () => {
    const filePath = 'src/dummy.tsx';
    const fileContent = 'const a = "Hello";';
    const promptAppendix = '';

    mockedFs.readFile.mockResolvedValue(fileContent);

    await fileProcessor.processFile(filePath, promptAppendix, true);

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expect.stringContaining('/**')
    );
  });
});
