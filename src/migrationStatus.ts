import fsExtra from 'fs-extra';
import { getFilePaths } from './FilePaths';
import { Key } from './responseProviders/responseFormat';
import path from 'node:path';
import logger from './utils/logger';

const { promises: fs } = fsExtra;

export interface MigrationStatus {
  [filePath: string]: {
    migrated: boolean;
    keys: Key[];
  };
}

// NEW: Function to parse comments from file content
export function extractCommentsFromContent(content: string): Key[] {
  const commentRegex = /\/\*\*\s*\n\s*\*\s*({.*?})\s*\n\s*\*\//g;
  const keys: Key[] = [];

  let match;
  while ((match = commentRegex.exec(content)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      keys.push({
        name: '', // Will be filled later
        description: data.description,
        default: data.default,
      });
    } catch (_e) {
      logger.warn(`Error parsing comment: ${match[1]}`);
    }
  }

  return keys;
}

// NEW: Function to remove comments from file content
export function removeCommentsFromContent(content: string): string {
  return content.replace(/\/\*\*\s*\n\s*\*\s*({.*?})\s*\n\s*\*\//g, '');
}

export interface FileStatus {
  filePath: string;
  keys: Key[];
  success: boolean;
}

interface UpdateMigrationStatusProps {
  fileStatuses: FileStatus[];
  currentStatus: MigrationStatus;
}

const writingPromise: Promise<any> | null = Promise.resolve();

// Function to update migration status
export const updateMigrationStatus = async ({
  currentStatus,
  fileStatuses,
}: UpdateMigrationStatusProps): Promise<void> => {
  await writingPromise;
  const { storageDir, statusFilePath } = getFilePaths();
  await fsExtra.ensureDir(storageDir);

  fileStatuses.forEach(({ filePath, keys, success }) => {
    // Update the file status and relevant keys
    currentStatus[filePath] = {
      migrated: success,
      keys,
    };
  });

  // Write the updated status back to the JSON file
  await fs.writeFile(
    statusFilePath,
    JSON.stringify(currentStatus, null, 2),
    'utf8'
  );
};

// Function to load migration status
export const loadMigrationStatus = async (): Promise<MigrationStatus> => {
  const { statusFilePath } = getFilePaths();

  // Check if the file exists before trying to load it
  const exists = await fsExtra.pathExists(statusFilePath);
  if (!exists) {
    const dirname = path.dirname(statusFilePath);
    await fsExtra.ensureDir(dirname);
    await fsExtra.writeJson(statusFilePath, {});
  }

  // If the file exists, load it
  const fileContent = await fs.readFile(statusFilePath, 'utf8');
  if (!fileContent.trim()) {
    // File is empty
    return {};
  } else {
    // File is not empty
    return JSON.parse(fileContent) as MigrationStatus;
  }
};
