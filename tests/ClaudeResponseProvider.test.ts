import { ClaudeResponseProvider } from '../src/responseProviders/ClaudeResponseProvider';
import { PromptsProvider } from '../src/PromptsProvider';
import { buildNativePreset } from '../src/presets/buildNativePreset';
import fetch from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = jest.mocked(fetch);

describe('ClaudeResponseProvider', () => {
  const mockPromptsProvider = PromptsProvider(buildNativePreset('react'));
  
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it('extracts valid JSON from clean response', async () => {
    const validResponse = {
      content: [{
        text: JSON.stringify({
          newFileContents: '<T keyName="test" />',
          keys: [{ name: 'test', description: 'Test key', default: 'Hello' }]
        })
      }]
    };

    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validResponse)
    } as any);

    const provider = ClaudeResponseProvider({
      claudeApiKey: 'test-key',
      promptsProvider: mockPromptsProvider
    });

    const result = await provider.getResponse({
      fileContent: 'const test = "Hello";',
      extraction: false
    });

    expect(result).toBeTruthy();
    const parsed = JSON.parse(result!);
    expect(parsed.newFileContents).toBe('<T keyName="test" />');
    expect(parsed.keys).toHaveLength(1);
  });

  it('extracts JSON from markdown-wrapped response', async () => {
    const markdownResponse = {
      content: [{
        text: '```json\n' + JSON.stringify({
          newFileContents: '<T keyName="test" />',
          keys: [{ name: 'test', description: 'Test key', default: 'Hello' }]
        }) + '\n```'
      }]
    };

    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(markdownResponse)
    } as any);

    const provider = ClaudeResponseProvider({
      claudeApiKey: 'test-key',
      promptsProvider: mockPromptsProvider
    });

    const result = await provider.getResponse({
      fileContent: 'const test = "Hello";',
      extraction: false
    });

    expect(result).toBeTruthy();
    const parsed = JSON.parse(result!);
    expect(parsed.newFileContents).toBe('<T keyName="test" />');
  });

  it('handles malformed JSON gracefully', async () => {
    const malformedResponse = {
      content: [{
        text: '{"newFileContents": "incomplete string'
      }]
    };

    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(malformedResponse)
    } as any);

    const provider = ClaudeResponseProvider({
      claudeApiKey: 'test-key',
      promptsProvider: mockPromptsProvider
    });

    const result = await provider.getResponse({
      fileContent: 'const test = "Hello";',
      extraction: false
    });

    expect(result).toBeTruthy();
    const parsed = JSON.parse(result!);
    
    // The salvage logic may recover some content or return empty
    // Check that we get a valid structure back either way
    expect(parsed).toHaveProperty('newFileContents');
    expect(parsed).toHaveProperty('keys');
    expect(Array.isArray(parsed.keys)).toBe(true);
  });

  it('attempts to salvage truncated JSON', async () => {
    const truncatedResponse = {
      content: [{
        text: '{"newFileContents": "<T keyName=\\"test\\" />", "keys": [{"name": "test", "description": "Test", "default": "Hello"}]'
      }]
    };

    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(truncatedResponse)
    } as any);

    const provider = ClaudeResponseProvider({
      claudeApiKey: 'test-key',
      promptsProvider: mockPromptsProvider
    });

    const result = await provider.getResponse({
      fileContent: 'const test = "Hello";',
      extraction: false
    });

    expect(result).toBeTruthy();
    const parsed = JSON.parse(result!);
    // Should attempt to salvage and return valid structure
    expect(parsed).toHaveProperty('newFileContents');
    expect(parsed).toHaveProperty('keys');
  });

  it('handles extraction mode correctly', async () => {
    const extractionResponse = {
      content: [{
        text: JSON.stringify({
          cleanedFileContents: '<T keyName="test" />',
          keys: [{ name: 'test', description: 'Test key', default: 'Hello' }]
        })
      }]
    };

    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(extractionResponse)
    } as any);

    const provider = ClaudeResponseProvider({
      claudeApiKey: 'test-key',
      promptsProvider: mockPromptsProvider
    });

    const result = await provider.getResponse({
      fileContent: '{/* {"description": "Test", "default": "Hello"} */}\nconst test = "Hello";',
      extraction: true
    });

    expect(result).toBeTruthy();
    const parsed = JSON.parse(result!);
    expect(parsed.newFileContents).toBe('<T keyName="test" />'); // Should normalize to newFileContents
    expect(parsed.keys).toHaveLength(1);
  });

  it('handles API errors gracefully', async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('Rate limit exceeded')
    } as any);

    const provider = ClaudeResponseProvider({
      claudeApiKey: 'test-key',
      promptsProvider: mockPromptsProvider
    });

    await expect(provider.getResponse({
      fileContent: 'const test = "Hello";',
      extraction: false
    })).rejects.toThrow('Claude API error: 429 Too Many Requests');
  });

  it('includes inline comments instructions when requested', async () => {
    const response = {
      content: [{
        text: JSON.stringify({
          newFileContents: '{/* {"description": "Test", "default": "Hello"} */}\n<T keyName="test" />',
          keys: [{ name: 'test', description: 'Test key', default: 'Hello' }]
        })
      }]
    };

    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response)
    } as any);

    const provider = ClaudeResponseProvider({
      claudeApiKey: 'test-key',
      promptsProvider: mockPromptsProvider
    });

    await provider.getResponse({
      fileContent: 'const test = "Hello";',
      inlineComments: true
    });

    // Verify the request included inline comments instructions
    const requestBody = JSON.parse(mockedFetch.mock.calls[0][1]!.body as string);
    expect(requestBody.messages[0].content).toContain('INLINE-COMMENTS MODE');
  });
}); 