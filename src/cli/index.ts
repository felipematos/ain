#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { registerProviderCommands } from './providers.js';
import { registerModelCommands } from './models.js';
import { registerConfigCommands } from './config-cmd.js';
import { registerAskCommand } from './ask.js';
import { registerRunCommand } from './run.js';
import { registerDoctorCommand } from './doctor.js';
import { registerRoutingCommands } from './routing.js';
import { preprocessArgs } from './preprocess.js';
import { shouldRunWizard, runWizard } from './wizard.js';

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

async function main() {
  const argv = preprocessArgs(process.argv);
  const command = argv[2];

  // Trigger onboarding wizard for prompt commands when no providers configured
  if (command === 'ask' || command === 'run') {
    if (shouldRunWizard()) {
      await runWizard();
    }
  }

  await program.parseAsync(argv);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
