import { ClaudeResponseProvider } from '../src/responseProviders/ClaudeResponseProvider';
import { ResponseProvider } from '../src/responseProviders/ResponseProvider';
import fetch from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = jest.mocked(fetch);

describe('ClaudeResponseProvider', () => {
  const dummyApiKey = 'dummy_key';
  const dummyPromptsProvider = {
    getPrompts: jest.fn().mockReturnValue({
      systemPrompt: 'system prompt',
      userPrompt: 'user prompt',
    }),
  };

  let claudeProvider: ResponseProvider;

  beforeEach(() => {
    mockedFetch.mockReset();
    claudeProvider = ClaudeResponseProvider({
      claudeApiKey: dummyApiKey,
      promptsProvider: dummyPromptsProvider,
    });
  });

  it('should call fetch with correct parameters and return cleaned response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ content: [{ text: '``````' }] }),
    };
    mockedFetch.mockResolvedValue(mockResponse as any);

    const response = await claudeProvider.getResponse({ fileContent: 'file content', promptAppendix: '' });

    expect(mockedFetch).toHaveBeenCalled();
    expect(response).toContain('newFileContents');
  });

  it('should throw error on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Error',
    };
    mockedFetch.mockResolvedValue(mockResponse as any);

    await expect(claudeProvider.getResponse({ fileContent: 'file content', promptAppendix: '' })).rejects.toThrow('Claude API error');
  });
});
