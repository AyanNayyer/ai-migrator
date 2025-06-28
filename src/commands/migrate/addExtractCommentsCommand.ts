import { Command } from 'commander';
import { findFiles } from '../../findFiles';
import fsExtra from 'fs-extra';
import {
  extractCommentsFromContent,
  removeCommentsFromContent,
} from '../../migrationStatus';
import path from 'node:path';
import logger from '../../utils/logger';

const { promises: fs } = fsExtra;

export function addExtractCommentsCommand(program: Command) {
  program
    .command('extract-comments')
    .description(
      'Extracts inline JSON comments, removes them, and generates the migration status file.'
    )
    .option(
      '-p, --pattern <pattern>',
      'File pattern to search for (e.g., src/**/*.tsx)',
      'src/**/*'
    )
    .action(async (options) => {
      const files = await findFiles(options.pattern);
      if (!files || files.length === 0) {
        logger.info('[extract-comments] No files found for the given pattern.');
        return;
      }

      logger.info(
        `[extract-comments] Found ${files.length} files. Extracting comments...`
      );

      const status: Record<string, { migrated: boolean; keys: any[] }> = {};

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const keys = extractCommentsFromContent(content);

        if (keys.length > 0) {
          //logic to extract key names from the code
          const lines = content.split('\n');
          let keyIndex = 0;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Look for comment lines that contain JSON data
            if (line.includes('*') && line.includes('{')) {
              // Look ahead up to 5 lines to find the <T keyName="..."/> pattern
              for (let j = 1; j <= 5; j++) {
                if (i + j >= lines.length) break;

                const nextLine = lines[i + j];
                const match = nextLine.match(/<T\s+keyName=['"]([^'"]+)['"]/);

                if (match) {
                  const keyName = match[1];
                  if (keyIndex < keys.length && !keys[keyIndex].name) {
                    keys[keyIndex].name = keyName;
                    keyIndex++;
                  }
                  break;
                }
              }
            }
          }

          status[file] = {
            migrated: true,
            keys,
          };
        }

        // Remove comments and write back
        const cleaned = removeCommentsFromContent(content);
        await fs.writeFile(file, cleaned, 'utf-8');
      }

      // Write migration-status.json
      const statusPath = path.join('.tolgee', 'migration-status.json');
      await fsExtra.ensureDir(path.dirname(statusPath));
      await fs.writeFile(statusPath, JSON.stringify(status, null, 2), 'utf-8');

      logger.info(
        '[extract-comments] Extraction and status file generation completed.'
      );
    });
}
