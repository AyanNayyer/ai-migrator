import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import { PresetType } from './PresetType';
import { ExpectedError } from '../common/ExpectedError';

export function buildNativePreset(name: string): PresetType {
  function getPromptContents(fileName: string) {
    const presetPath = path.resolve(__dirname, name, fileName);
    try {
      return fs.readFileSync(presetPath, 'utf8');
    } catch (_) {
      throw new ExpectedError(
        `Failed to open preset file on ${presetPath}.\nDoes the ${name} preset exist?`
      );
    }
  }

  const systemTemplateRaw = getPromptContents('system.handlebars');
  // const userTemplateRaw = getPromptContents('user.handlebars');

  function getSystemPrompt() {
    const systemTemplate = Handlebars.compile(systemTemplateRaw);
    return systemTemplate({});
  }

  function getUserPrompt(props: { 
    fileContent: string; 
    inlineComments?: boolean;
    extraction?: boolean;
  }) {
    // Select the correct user template based on the mode
    let templateFile: string;
    
    if (props.extraction) {
      templateFile = 'user-extraction.handlebars';
    } else if (props.inlineComments) {
      templateFile = 'user-migration-comments.handlebars';
    } else {
      templateFile = 'user-migration.handlebars';
    }

    const userTemplateRaw = getPromptContents(templateFile);
    const userTemplate = Handlebars.compile(userTemplateRaw);
    return userTemplate(props);
  }

  return {
    name,
    getUserPrompt,
    getSystemPrompt,
  };
}