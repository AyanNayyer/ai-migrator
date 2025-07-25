import { PresetType } from './presets/PresetType';

export function PromptsProvider(preset: PresetType) {
  function getPrompts({
    fileContent,
    promptAppendix,
    inlineComments,
    extraction,
  }: {
    fileContent: string;
    promptAppendix?: string;
    inlineComments?: boolean;
    extraction?: boolean;
  }) {
    const systemPrompt = preset.getSystemPrompt();

    // Append the promptAppendix if provided
    const completeSystemPrompt = promptAppendix
      ? `${systemPrompt}\n\nAdditional Instructions:\n${promptAppendix}`
      : systemPrompt;

    const userPrompt = preset.getUserPrompt({ 
      fileContent,
      inlineComments,
      extraction,
    });

    return { systemPrompt: completeSystemPrompt, userPrompt };
  }

  return {
    getPrompts,
  };
}

export type PromptsProviderType = ReturnType<typeof PromptsProvider>;
