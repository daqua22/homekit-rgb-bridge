// Keep the same lockfile/tool versions; retry only observed upstream HTTP failures.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const task = process.argv[2];
if (
  !['test:desktop', 'desktop:windows'].includes(task) ||
  !process.env.npm_execpath
)
  throw new Error(
    'Run through npm run ci:desktop with an allowed desktop task.',
  );
for (let attempt = 1; attempt <= 3; attempt++) {
  let output = '';
  const child = spawn(
    process.execPath,
    [process.env.npm_execpath, 'run', task],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  );
  for (const [stream, destination] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ])
    stream.on('data', (chunk) => {
      destination.write(chunk);
      output = (output + chunk.toString()).slice(-128000);
    });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (value) => resolve(value ?? 1));
  });
  if (code === 0) break;
  if (
    attempt === 3 ||
    !/Response code 50[234] \((?:Gateway Time-out|Bad Gateway|Service Unavailable)\)/.test(
      output,
    )
  ) {
    process.exitCode = code;
    break;
  }
  console.log(
    'An upstream download failed temporarily; retrying the same locked desktop tooling. Attempt ' +
      (attempt + 1) +
      ' of 3.',
  );
  await delay(5000);
}
