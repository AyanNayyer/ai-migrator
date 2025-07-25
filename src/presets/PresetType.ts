import { z } from 'zod';

export const presetShape = z.object({
  name: z.string(),
  getUserPrompt: z
    .function()
    .args(z.object({ 
      fileContent: z.string(),
      inlineComments: z.boolean().optional(),
      extraction: z.boolean().optional(),
    }))
    .returns(z.string()),
  getSystemPrompt: z.function().returns(z.string()),
});

export type PresetType = z.infer<typeof presetShape>;
