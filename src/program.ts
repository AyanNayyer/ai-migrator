import { Command, Option } from 'commander';
import { addMigrationCommand } from './commands/migrate/addMigrationCommand';
import { addUploadCommand } from './commands/upload/addUploadCommand';
import { addExtractCommentsCommand } from './commands/migrate/addExtractCommentsCommand'; // NEW

export function createProgram(): Command {
  const program = new Command();

  program.name('tolgee-migrator').usage('[command] [options]');
  program.addOption(
    new Option('-l, --log-level <level>', 'Set the log level').default('info')
  );
  // Registering ALL commands here in one place
  addMigrationCommand(program);
  addUploadCommand(program);
  addExtractCommentsCommand(program); // NEW

  return program;
}
