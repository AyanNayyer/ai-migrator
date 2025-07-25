import fsExtra from 'fs-extra';
import { getFilePaths } from './FilePaths';
import { Key } from './responseProviders/responseFormat';
import path from 'node:path';

const { promises: fs } = fsExtra;

export interface MigrationStatus {
  [filePath: string]: {
    migrated: boolean;
    keys: Key[];
  };
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

export const updateMigrationStatus = async ({
  currentStatus,
  fileStatuses,
}: UpdateMigrationStatusProps): Promise<void> => {
  await writingPromise;
  const { storageDir, statusFilePath } = getFilePaths();
  await fsExtra.ensureDir(storageDir);

  fileStatuses.forEach(({ filePath, keys, success }) => {
    currentStatus[filePath] = {
      migrated: success,
      keys,
    };
  });

  await fs.writeFile(
    statusFilePath,
    JSON.stringify(currentStatus, null, 2),
    'utf8'
  );
};

export const loadMigrationStatus = async (): Promise<MigrationStatus> => {
  const { statusFilePath } = getFilePaths();

  const exists = await fsExtra.pathExists(statusFilePath);
  if (!exists) {
    const dirname = path.dirname(statusFilePath);
    await fsExtra.ensureDir(dirname);
    await fsExtra.writeJson(statusFilePath, {});
  }

  const fileContent = await fs.readFile(statusFilePath, 'utf8');
  if (!fileContent.trim()) {
    return {};
  } else {
    return JSON.parse(fileContent) as MigrationStatus;
  }
};
