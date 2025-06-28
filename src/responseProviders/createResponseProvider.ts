import { ResponseProvider } from './ResponseProvider';
import { AzureResponseProvider } from './AzureResponseProvider';
import { OpenAiResponseProvider } from './OpenAiResponseProvider';
import { ClaudeResponseProvider } from './ClaudeResponseProvider';
import { PromptsProvider } from '../PromptsProvider';
import { PresetType } from '../presets/PresetType';
import { ExpectedError } from '../common/ExpectedError';

const apiVersion = '2024-10-01-preview';
type ApiProvider = 'AZURE_OPENAI' | 'OPENAI' | 'CLAUDE';

export type AiProviderOptions = {
  openAiApiKey?: string;
  azureApiKey?: string;
  azureEndpoint?: string;
  azureDeployment?: string;
  claudeApiKey?: string;
  provider?: 'openai' | 'azure' | 'claude';
};

export function createResponseProvider(
  preset: PresetType,
  providerOptions: AiProviderOptions
): ResponseProvider {
  const apiProviderType: ApiProvider = getApiProviderType(providerOptions);
  const promptsProvider = PromptsProvider(preset);

  const {
    openAiApiKey,
    azureApiKey,
    azureEndpoint,
    azureDeployment,
    claudeApiKey,
  } = providerOptions;

  switch (apiProviderType) {
    case 'AZURE_OPENAI':
      return AzureResponseProvider({
        config: {
          azureApiKey: azureApiKey!,
          azureEndpoint,
          deployment: azureDeployment,
          apiVersion,
        },
        promptsProvider,
      });
    case 'OPENAI':
      return OpenAiResponseProvider({
        openAiApiKey: openAiApiKey!,
        promptsProvider,
      });
    case 'CLAUDE':
      return ClaudeResponseProvider({
        claudeApiKey: claudeApiKey!,
        promptsProvider,
      });
  }
}

function getApiProviderType({
  azureApiKey,
  azureEndpoint,
  openAiApiKey,
  claudeApiKey,
  provider,
}: AiProviderOptions): ApiProvider {
  // Explicit provider flag takes precedence
  if (provider === 'claude' || claudeApiKey) {
    return 'CLAUDE';
  }
  if (provider === 'azure' || (azureApiKey && azureEndpoint)) {
    return 'AZURE_OPENAI';
  }
  if (provider === 'openai' || openAiApiKey) {
    return 'OPENAI';
  }

  throw new ExpectedError(
    'No API provider credentials specified in configuration, specify either OpenAI or Azure OpenAI credentials'
  );
}
