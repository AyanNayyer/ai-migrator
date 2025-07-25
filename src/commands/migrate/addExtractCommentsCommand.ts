import { Command } from 'commander';
import { findFiles } from '../../findFiles';
import fsExtra from 'fs-extra';
import path from 'node:path';
import logger from '../../utils/logger';
import { createResponseProvider } from '../../responseProviders/createResponseProvider';
import { buildNativePreset } from '../../presets/buildNativePreset';
import { presetShape } from '../../presets/PresetType';
import type { PresetType } from '../../presets/PresetType';

const { promises: fs } = fsExtra;

/** One-liner JSX review-comment */
const REVIEW_RX =
  /{\/\*\s*{\s*"description"\s*:\s*"[^"]*"\s*,\s*"default"\s*:\s*"[^"]*"\s*}\s*\*\/}\s*\n?/g;

export function addExtractCommentsCommand(program: Command) {
  program
    .command('extract-comments')
    .description('Remove JSX review comments and update .tolgee/migration-status.json')
    .option('-p, --pattern <pattern>', 'File glob', 'src/**/*')
    .option('--provider <provider>', 'openai | claude', 'openai')
    .option('-k, --api-key <key>', 'Provider API key')
    .option('--claude-api-key <key>', 'Claude API key')
    .option('-r, --preset <preset>', 'Preset name', 'react')
    .action(async opts => {
      const files = await findFiles(opts.pattern);
      if (!files.length) {
        logger.info('[extract-comments] No matching files');
        return;
      }

      const preset = getAndValidatePreset(opts.preset);
      const provider = createResponseProvider(preset, {
        provider     : opts.provider,
        openAiApiKey : opts.apiKey,
        claudeApiKey : opts.claudeApiKey,
      });

      /** consolidated status object */
      const status: Record<string, { migrated: boolean; keys: any[] }> = {};

      for (const file of files) {
        const original = await fs.readFile(file, 'utf-8');

        // Warn about very large files that might cause issues
        if (original.length > 50000) { // 50KB threshold
          logger.warn(`[extract-comments] Large file detected: ${file} (${original.length} chars). This may cause JSON parsing issues.`);
        }

        /* ── call LLM ─────────────────────────────────────────────────── */
        const raw = await provider.getResponse({
          fileContent : original,
          extraction  : true
        });
        if (!raw) {
          logger.warn(`[extract-comments] No response from provider for ${file}`);
          continue;
        }

        let cleaned      = original;
        let llmKeyList: any[] = [];

        try {
          const parsed = JSON.parse(raw);
          cleaned      = typeof parsed.cleanedFileContents === 'string'
                         ? parsed.cleanedFileContents
                         : original;
          llmKeyList   = Array.isArray(parsed.keys) ? parsed.keys : [];
        } catch (err) {
          logger.error(`[extract-comments] JSON parse failed for ${file}:`, err);
          logger.error(`[extract-comments] Raw response was:`, raw);
          logger.info(`[extract-comments] Continuing with comment removal but no key extraction for ${file}`);
        }

        /* ── local clean-up: remove any leftover comment blocks only ──── */
        cleaned = cleaned.replace(REVIEW_RX, '');

        /* write back if the file changed */
        if (cleaned !== original) await fs.writeFile(file, cleaned, 'utf-8');

        /* de-duplicate keys coming from LLM */
        const uniq = new Map<string, any>();
        llmKeyList.forEach(k => uniq.set(`${k.name}|${k.description}`, k));

        status[file] = { migrated: true, keys: [...uniq.values()] };
      }

      /* ── write migration-status.json ───────────────────────────────── */
      const statusPath = path.join('.tolgee', 'migration-status.json');
      await fsExtra.ensureDir(path.dirname(statusPath));
      await fs.writeFile(statusPath, JSON.stringify(status, null, 2), 'utf-8');

      logger.info('[extract-comments] completed');
    });
}

/* ───────────────── helper ───────────────── */
function getAndValidatePreset(label: string): PresetType {
  const obj = label.endsWith('.js')
    ? require(label)
    : buildNativePreset(label);

  presetShape.parse(obj);                 // throws on invalid preset
  return obj;
}
