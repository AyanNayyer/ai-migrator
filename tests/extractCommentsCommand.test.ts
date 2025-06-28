import { addExtractCommentsCommand } from '../src/commands/migrate/addExtractCommentsCommand';
import fsExtra from 'fs-extra';
import { Command } from 'commander';
import { findFiles } from '../src/findFiles';

jest.mock('fs-extra');
jest.mock('../src/findFiles'); // Mock findFiles

const mockedFs = jest.mocked(fsExtra.promises);
const mockedFindFiles = jest.mocked(findFiles); // Create mock

describe('extract-comments command', () => {
  beforeEach(() => {
    mockedFs.readFile.mockReset();
    mockedFs.writeFile.mockReset();
    // Mock findFiles to return test file
    mockedFindFiles.mockResolvedValue(['src/dummy.tsx']);
  });

  it('extracts keys from inline comments and writes status file', async () => {
    const fileContent = `
/**
 * {"description": "Greeting", "default": "Hello"}
 */
<T keyName="greeting" />
    `;
    mockedFs.readFile.mockResolvedValue(fileContent);
  
    // Simulate running the command
    const program = new Command();
    addExtractCommentsCommand(program);
  
    await program.parseAsync([
      'node',
      'tolgee-migrator',
      'extract-comments',
      '-p',
      'src/dummy.tsx',
    ]);
  
    // Find the call that writes the status file
    const statusFileCall = mockedFs.writeFile.mock.calls.find(call => 
      call[0].toString().includes('migration-status.json')
    );
    
    expect(statusFileCall).toBeDefined();
    if (statusFileCall) {
      expect(statusFileCall[1]).toContain('"name": "greeting"');
    }
  });
});
