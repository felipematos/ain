import type { Command } from 'commander';
import { runDoctorChecks, renderDoctorResults } from '../doctor/checks.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check AIN configuration and provider health')
    .option('-p, --provider <name>', 'Check specific provider only')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      try {
        const results = await runDoctorChecks(opts.provider);

        if (opts.json) {
          process.stdout.write(JSON.stringify(results, null, 2) + '\n');
        } else {
          renderDoctorResults(results);
        }

        const allOk = results.every((r) => r.ok);
        process.exit(allOk ? 0 : 1);
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }
    });
}
