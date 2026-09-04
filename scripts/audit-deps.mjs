import { spawnSync } from 'node:child_process';

const attempts = 3;
const transientPattern = /(?:audit endpoint returned an error|\b(?:429|500|502|503|504)\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up)/i;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = spawnSync('npm', ['audit', '--audit-level=high'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (result.status === 0) process.exit(0);

  const transient = transientPattern.test(output);
  if (!transient || attempt === attempts) process.exit(result.status ?? 1);

  const delayMs = attempt * 5_000;
  console.warn(`npm audit service failed transiently (attempt ${attempt}/${attempts}); retrying in ${delayMs / 1000}s.`);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
