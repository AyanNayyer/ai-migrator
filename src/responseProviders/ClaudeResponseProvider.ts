// claudeResponseProvider.ts
import { GetResponseProps, ResponseProvider } from './ResponseProvider';
import fetch from 'node-fetch';
import { PromptsProviderType } from '../PromptsProvider';
import logger from '../utils/logger';

function extractJsonFromClaudeResponse(response: string): string {
  // Remove any markdown formatting
  const cleaned = response.replace(/``````\n?/g, '');

  // Find JSON object in the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0].trim();
  }

  return cleaned.trim();
}

export function ClaudeResponseProvider({
  claudeApiKey,
  promptsProvider,
}: {
  claudeApiKey: string;
  promptsProvider: PromptsProviderType;
}): ResponseProvider {
  return {
    async getResponse(
      props: GetResponseProps
    ): Promise<string | null | undefined> {
      // Use promptsProvider to get system and user prompts (same as OpenAI)
      const { systemPrompt, userPrompt } = promptsProvider.getPrompts(props);

      // Enhanced system prompt to ensure consistent JSON output
      const enhancedSystemPrompt = `${systemPrompt}

CRITICAL: You MUST respond with EXACTLY this JSON format:
{
  "newFileContents": "the migrated code here",
  "keys": [
    {
      "name": "key-name",
      "description": "description of the key",
      "default": "original text value"
    }
  ]
}

Return ONLY valid JSON. No explanations, no markdown, no additional text.`;

      const body = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000, // Increased for longer files
        temperature: 0.2, // Lower temperature for consistency
        system: enhancedSystemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Claude API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      const rawText = data.content?.[0]?.text || null;

      if (!rawText) return null;

      // Extract and clean the JSON
      const cleanedJson = extractJsonFromClaudeResponse(rawText);

      // Validate the JSON structure
      try {
        const parsed = JSON.parse(cleanedJson);

        // Ensure the response has the required structure
        if (!parsed.newFileContents) {
          parsed.newFileContents = '';
        }
        if (!parsed.keys || !Array.isArray(parsed.keys)) {
          parsed.keys = [];
        }

        // Return the corrected JSON string
        return JSON.stringify(parsed);
      } catch (_e) {
        logger.debug('Claude raw response:', rawText);
        logger.debug('Cleaned JSON:', cleanedJson);
        // Fallback: return a valid empty response
        return JSON.stringify({
          newFileContents: '',
          keys: [],
        });
      }
    },
  };
}
