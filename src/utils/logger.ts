export type LogLevel = 'error' | 'info' | 'debug';
/** Accept fixed events only: do not log exceptions, config, pairing values or paths. */
export class Logger {
  constructor(private level: LogLevel = 'info') {}
  log(level: LogLevel, event: string): void {
    if (
      ['error', 'info', 'debug'].indexOf(level) <=
      ['error', 'info', 'debug'].indexOf(this.level)
    )
      console.log(
        JSON.stringify({ time: new Date().toISOString(), level, event }),
      );
  }
}
