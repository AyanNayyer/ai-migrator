import { addExtractCommentsCommand } from '../src/commands/migrate/addExtractCommentsCommand';
import fsExtra from 'fs-extra';
import { Command } from 'commander';
import { findFiles } from '../src/findFiles';
import { createResponseProvider } from '../src/responseProviders/createResponseProvider';

jest.mock('fs-extra');
jest.mock('../src/findFiles');
jest.mock('../src/responseProviders/createResponseProvider');
jest.mock('../src/presets/buildNativePreset');

const mockedFs = jest.mocked(fsExtra.promises);
const mockedFindFiles = jest.mocked(findFiles);
const mockedCreateResponseProvider = jest.mocked(createResponseProvider);

describe('extract-comments command', () => {
  beforeEach(() => {
    mockedFs.readFile.mockReset();
    mockedFs.writeFile.mockReset();
    mockedFindFiles.mockReset();
    mockedCreateResponseProvider.mockReset();
    
    // Mock findFiles to return test file
    mockedFindFiles.mockResolvedValue(['src/dummy.tsx']);
    
    // Mock ensureDir
    (fsExtra.ensureDir as jest.Mock).mockResolvedValue(undefined);
  });

  it('extracts keys from LLM response and writes status file', async () => {
    const fileContent = `
{/* {"description": "Greeting", "default": "Hello"} */}
<T keyName="greeting" />
    `;
    
    const cleanedFileContent = `
<T keyName="greeting" />
    `;
    
    mockedFs.readFile.mockResolvedValue(fileContent);
    
    // Mock the response provider
    const mockResponseProvider = {
      getResponse: jest.fn().mockResolvedValue(JSON.stringify({
        cleanedFileContents: cleanedFileContent,
        keys: [
          { name: 'greeting', description: 'Greeting', default: 'Hello' }
        ]
      }))
    };
    mockedCreateResponseProvider.mockReturnValue(mockResponseProvider);

    // Mock buildNativePreset
    const { buildNativePreset } = require('../src/presets/buildNativePreset');
    buildNativePreset.mockReturnValue({
      name: 'react',
      getUserPrompt: jest.fn(),
      getSystemPrompt: jest.fn()
    });
  
    // Simulate running the command
    const program = new Command();
    addExtractCommentsCommand(program);
  
    await program.parseAsync([
      'node',
      'tolgee-migrator',
      'extract-comments',
      '-p',
      'src/dummy.tsx',
      '--provider',
      'openai',
      '-k',
      'dummy-key'
    ]);
  
    // Verify LLM was called with extraction mode
    expect(mockResponseProvider.getResponse).toHaveBeenCalledWith({
      fileContent,
      extraction: true
    });
    
    // Verify file was cleaned
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      'src/dummy.tsx',
      cleanedFileContent,
      'utf-8'
    );
    
    // Find the call that writes the status file
    const statusFileCall = mockedFs.writeFile.mock.calls.find(call => 
      call[0].toString().includes('migration-status.json')
    );
    
    expect(statusFileCall).toBeDefined();
    if (statusFileCall) {
      expect(statusFileCall[1]).toContain('"name": "greeting"');
      expect(statusFileCall[1]).toContain('"description": "Greeting"');
      expect(statusFileCall[1]).toContain('"default": "Hello"');
    }
  });

  it('handles LLM response parsing errors gracefully', async () => {
    const fileContent = `
{/* {"description": "Greeting", "default": "Hello"} */}
<T keyName="greeting" />
    `;
    
    mockedFs.readFile.mockResolvedValue(fileContent);
    
    // Mock the response provider to return malformed JSON
    const mockResponseProvider = {
      getResponse: jest.fn().mockResolvedValue('invalid json')
    };
    mockedCreateResponseProvider.mockReturnValue(mockResponseProvider);

    // Mock buildNativePreset
    const { buildNativePreset } = require('../src/presets/buildNativePreset');
    buildNativePreset.mockReturnValue({
      name: 'react',
      getUserPrompt: jest.fn(),
      getSystemPrompt: jest.fn()
    });
  
    // Simulate running the command
    const program = new Command();
    addExtractCommentsCommand(program);
  
    await program.parseAsync([
      'node',
      'tolgee-migrator',
      'extract-comments',
      '-p',
      'src/dummy.tsx',
      '--provider',
      'openai',
      '-k',
      'dummy-key'
    ]);
    
    // Should still write status file with empty keys
    const statusFileCall = mockedFs.writeFile.mock.calls.find(call => 
      call[0].toString().includes('migration-status.json')
    );
    
    expect(statusFileCall).toBeDefined();
    if (statusFileCall) {
      expect(statusFileCall[1]).toContain('"keys": []');
    }
  });

  it('works with Claude provider', async () => {
    const fileContent = `
{/* {"description": "Greeting", "default": "Hello"} */}
<T keyName="greeting" />
    `;
    
    mockedFs.readFile.mockResolvedValue(fileContent);
    
    const mockResponseProvider = {
      getResponse: jest.fn().mockResolvedValue(JSON.stringify({
        cleanedFileContents: '<T keyName="greeting" />',
        keys: [
          { name: 'greeting', description: 'Greeting', default: 'Hello' }
        ]
      }))
    };
    mockedCreateResponseProvider.mockReturnValue(mockResponseProvider);

    // Mock buildNativePreset
    const { buildNativePreset } = require('../src/presets/buildNativePreset');
    buildNativePreset.mockReturnValue({
      name: 'react',
      getUserPrompt: jest.fn(),
      getSystemPrompt: jest.fn()
    });
  
    const program = new Command();
    addExtractCommentsCommand(program);
  
    await program.parseAsync([
      'node',
      'tolgee-migrator',
      'extract-comments',
      '-p',
      'src/dummy.tsx',
      '--provider',
      'claude',
      '--claude-api-key',
      'dummy-claude-key'
    ]);
  
    expect(mockResponseProvider.getResponse).toHaveBeenCalledWith({
      fileContent,
      extraction: true
    });
  });
});
