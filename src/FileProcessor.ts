import fsExtra from 'fs-extra';
import { ChatGptResponse } from './responseProviders/responseFormat';
import { PresetType } from './presets/PresetType';
import {
  AiProviderOptions,
  createResponseProvider,
} from './responseProviders/createResponseProvider';
import { retryOnError, retryOnRateLimit } from './common/retryOnError';

const { promises: fs } = fsExtra;

export function FileProcessor(
  preset: PresetType,
  providerOptions: AiProviderOptions
) {
  const responseProvider = createResponseProvider(preset, providerOptions);

  async function processFile(
    filePath: string,
    promptAppendixPath?: string,
    inlineComments = false
  ) {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const promptAppendix = await loadPromptAppendix(promptAppendixPath);
    const result = await getResponseRetrying(fileContent, promptAppendix, inlineComments);

    // Write LLM's output directly, no post-processing
    if (result.keys.length > 0) {
      await fs.writeFile(filePath, result.newFileContents);
    }

    return result;
  }

  async function getResponseRetrying(
    fileContent: string,
    promptAppendix: string,
    inlineComments: boolean = false
  ) {
    return await retryOnRateLimit({
      callback: async () =>
        retryOnError({
          callback: async () => getResponse(fileContent, promptAppendix, inlineComments),
          retries: 3,
          errorMatcher: (e) => e instanceof SyntaxError,
        }),
      retryAfterProvider: (e: any) => {
        // Handle rate limiting (429) and Claude overload (529) errors
        if (e['status'] === 429) {
          const retryAfter = 60000; // 60 seconds for rate limit
          if (!retryAfter) return undefined;
          return retryAfter;
        }
        
        // Handle Claude API overload errors (529)
        if (e.message && e.message.includes('Claude API temporarily overloaded')) {
          return 30000; // 30 seconds for overload
        }
        
        // Handle Claude API rate limit errors with specific message
        if (e.message && e.message.includes('Claude API rate limit exceeded')) {
          return 60000; // 60 seconds for rate limit
        }
        
        return undefined;
      },
    });
  }

  async function loadPromptAppendix(filePath?: string): Promise<string> {
    if (!filePath) return '';
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (_) {
      throw new Error(
        `[chatGPT] Error loading prompt appendix or path ${filePath}`
      );
    }
  }

  async function getResponse(fileContent: string, promptAppendix: string, inlineComments: boolean = false) {
    const responseJson = await responseProvider.getResponse({
      fileContent,
      promptAppendix,
      inlineComments,
    });

    if (!responseJson) {
      throw new NoResponseError();
    }

    const response: ChatGptResponse = JSON.parse(responseJson);
    return response;
  }

  return {
    processFile,
  };
}

export class NoResponseError implements Error {
  message: string = 'No response from OpenAI';
  name: string = 'NoResponseError';
}
