#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerProviderCommands } from './providers.js';
import { registerModelCommands } from './models.js';
import { registerConfigCommands } from './config-cmd.js';
import { registerAskCommand } from './ask.js';
import { registerRunCommand } from './run.js';
import { registerDoctorCommand } from './doctor.js';
import { registerRoutingCommands } from './routing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkgPath = join(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('ain')
  .description('AI Node — scriptable CLI and library for LLM tasks')
  .version(getVersion());

registerAskCommand(program);
registerRunCommand(program);
registerProviderCommands(program);
registerModelCommands(program);
registerConfigCommands(program);
registerDoctorCommand(program);
registerRoutingCommands(program);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
