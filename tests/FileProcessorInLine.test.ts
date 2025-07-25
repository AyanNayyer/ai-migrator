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
    getUserPrompt: ({ fileContent, inlineComments, extraction }) => {
      if (extraction) {
        return `Extract comments from: ${fileContent}`;
      } else if (inlineComments) {
        return `Process with inline comments: ${fileContent}`;
      } else {
        return `Process this content: ${fileContent}`;
      }
    },
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
        newFileContents: `{/* {"description": "Greeting message", "default": "Hello"} */}
<T keyName="greeting" />`,
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

  it('should process files with inline comments mode', async () => {
    const filePath = 'src/dummy.tsx';
    const fileContent = 'const greeting = "Hello";';
    const promptAppendix = '';

    mockedFs.readFile.mockResolvedValue(fileContent);

    const result = await fileProcessor.processFile(filePath, promptAppendix, true);

    // Verify the response provider was called with inlineComments flag
    const { createResponseProvider } = require('../src/responseProviders/createResponseProvider');
    const mockResponseProvider = createResponseProvider();
    
    expect(mockResponseProvider.getResponse).toHaveBeenCalledWith({
      fileContent,
      promptAppendix,
      inlineComments: true,
    });

    // Should write the file with inline comments
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expect.stringContaining('{/* {"description": "Greeting message", "default": "Hello"} */}')
    );

    // Should return the extracted keys
    expect(result.keys).toHaveLength(1);
    expect(result.keys[0]).toEqual({
      name: 'greeting',
      description: 'Greeting message',
      default: 'Hello'
    });
  });

  it('should process files without inline comments mode', async () => {
    const filePath = 'src/dummy.tsx';
    const fileContent = 'const greeting = "Hello";';
    const promptAppendix = '';

    // Mock response for normal migration - create fresh mock for this test
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
    
    // Create new file processor with fresh mock
    const newFileProcessor = FileProcessor(dummyPreset, dummyProviderOptions);

    mockedFs.readFile.mockResolvedValue(fileContent);

    const result = await newFileProcessor.processFile(filePath, promptAppendix, false);

    // Verify the response provider was called without inlineComments flag
    expect(mockResponseProvider.getResponse).toHaveBeenCalledWith({
      fileContent,
      promptAppendix,
      inlineComments: false,
    });

    // Should write the file without inline comments
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      '<T keyName="greeting" />'
    );
  });

  it('should skip writing file if no keys are extracted', async () => {
    const filePath = 'src/dummy.tsx';
    const fileContent = 'const greeting = "Hello";';

    // Mock response with no keys - create fresh mock for this test
    const { createResponseProvider } = require('../src/responseProviders/createResponseProvider');
    const mockResponseProvider = {
      getResponse: jest.fn().mockResolvedValue(JSON.stringify({
        newFileContents: fileContent, // Same content, no changes
        keys: [], // No keys
      })),
    };
    createResponseProvider.mockReturnValue(mockResponseProvider);
    
    // Create new file processor with fresh mock
    const newFileProcessor = FileProcessor(dummyPreset, dummyProviderOptions);

    mockedFs.readFile.mockResolvedValue(fileContent);
    mockedFs.writeFile.mockClear(); // Clear any previous calls

    const result = await newFileProcessor.processFile(filePath, '', false);

    // Should not write file if no keys were extracted
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
    expect(result.keys).toHaveLength(0);
  });
});
