import {
  existsSync,
  readFileSync,
  renameSync,
  appendFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
export type LogLevel = 'error' | 'info' | 'debug';
export class Logger {
  constructor(
    private level: LogLevel = 'info',
    private dir?: string,
  ) {}
  log(level: LogLevel, event: string): void {
    if (!/^[a-z_]+$/.test(event))
      throw new Error('Only fixed diagnostic event names may be logged');
    if (
      ['error', 'info', 'debug'].indexOf(level) >
      ['error', 'info', 'debug'].indexOf(this.level)
    )
      return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      event,
    });
    if (this.dir) {
      const file = join(this.dir, 'events.log');
      try {
        if (existsSync(file) && statSync(file).size > 256 * 1024)
          renameSync(file, join(this.dir, 'events.previous.log'));
        appendFileSync(file, line + '\n', { mode: 0o600 });
      } catch {
        console.error('Diagnostic file could not be written.');
      }
    }
    console.log(line);
  }
  events(): unknown[] {
    if (!this.dir || !existsSync(join(this.dir, 'events.log'))) return [];
    try {
      return readFileSync(join(this.dir, 'events.log'), 'utf8')
        .trim()
        .split('\n')
        .slice(-100)
        .map((s) => JSON.parse(s) as unknown);
    } catch {
      return [];
    }
  }
}
