import { Sandbox } from '@vercel/sandbox';
import { spawnSync } from 'child_process';

function runCommand(command: string, args: string[]) {
  console.log(`Running: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status}: ${command} ${args.join(' ')}`);
  }
}

async function main() {
  try {
    // Auth Setup
    console.log('--- Setting up Vercel Auth ---');
    
    // 1. Vercel Login
    try {
      // Check if already logged in to avoid interactive prompt if possible, 
      // but 'login' usually handles it gracefully. 
      // We'll just run it as requested.
      runCommand('pnpm', ['exec', 'vercel', 'login']);
    } catch (error) {
      console.error('Failed to log in to Vercel.');
      throw error;
    }

    // 2. Vercel Link
    try {
      // 'link' ensures the project is linked. 
      // Adding --yes to avoid confirmation prompts if possible, 
      // though for initial link it might still need input if ambiguous.
      // However, usually 'link' implies interactive selection if not present.
      // We will run it without --yes to allow user interaction if needed, 
      // as 'stdio: inherit' is used.
      runCommand('pnpm', ['exec', 'vercel', 'link']);
    } catch (error) {
      console.error('Failed to link Vercel project.');
      throw error;
    }

    console.log('\n--- creating Sandbox ---');

    // Sandbox Code
    const sandbox = await Sandbox.create();

    const { exitCode } = await sandbox.runCommand({
      cmd: 'node',
      args: ['-e', 'process.exit(0)'],
    });

    console.log(exitCode === 0 ? 'ok' : 'failed');

    await sandbox.stop();
    
  } catch (error) {
    console.error('\nExecution failed:', error);
    process.exit(1);
  }
}

main();
