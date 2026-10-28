import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  initialize,
  loadConfig,
  dataDirectory,
  ensurePrivateDirectory,
  acquireLock,
} from './config/config-manager.js';
import { loadIdentity } from './config/identity.js';
import { StateStore } from './config/state-store.js';
import { MockRGBAdapter } from './adapters/mock-adapter.js';
import { OpenRGBAdapter } from './adapters/openrgb-adapter.js';
import { DeviceManager } from './devices/device-manager.js';
import { AccessoryManager } from './homekit/accessory-manager.js';
import { Logger } from './utils/logger.js';
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (process.platform !== 'win32') process.umask(0o077);
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'data-dir': { type: 'string' },
      mock: { type: 'boolean' },
      pairing: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  const command = positionals[0] ?? 'start';
  if (values.help) {
    console.log(
      'HomeKit RGB Bridge (experimental)\nCommands: init [--mock], list, check, start [--pairing]\nOptions: --data-dir <absolute path>, --help\nPairing output contains secrets; use only in a private terminal.',
    );
    return;
  }
  if (
    positionals.length > 1 ||
    !['init', 'list', 'check', 'start'].includes(command)
  )
    throw new Error('Unknown command');
  const dir = resolve(values['data-dir'] ?? dataDirectory());
  ensurePrivateDirectory(dir);
  if (command === 'init') {
    initialize(dir, values.mock ?? false);
    console.log(
      'Configuration created in the application-data directory. See docs/configuration.md.',
    );
    return;
  }
  if (values.mock) throw new Error('--mock is only accepted by init');
  const config = loadConfig(dir);
  if (command === 'check') {
    console.log('Configuration valid.');
    return;
  }
  const unlock = acquireLock(dir);
  const adapter =
    config.adapter === 'mock'
      ? new MockRGBAdapter()
      : new OpenRGBAdapter(
          config.openrgb.host,
          config.openrgb.port,
          config.openrgb.timeoutMs,
        );
  if (command === 'list') {
    try {
      await adapter.connect();
      console.log(JSON.stringify(await adapter.discoverDevices(), null, 2));
    } finally {
      await adapter.disconnect();
      unlock();
    }
    return;
  }
  const logger = new Logger(config.logging);
  let manager: DeviceManager | undefined, homekit: AccessoryManager | undefined;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await homekit?.stop();
    } finally {
      try {
        await manager?.stop();
      } finally {
        unlock();
      }
    }
  };
  try {
    manager = new DeviceManager(adapter, config, new StateStore(dir), logger);
    homekit = new AccessoryManager(config, loadIdentity(dir), manager, dir);
    await manager.start();
    await homekit.start(values.pairing);
    logger.log('info', 'bridge_started_experimental');
    const signal = () => {
      void stop()
        .then(() => {
          process.exitCode = 0;
        })
        .catch(() => {
          logger.log('error', 'shutdown_failed');
          process.exitCode = 1;
        });
    };
    process.once('SIGINT', signal);
    process.once('SIGTERM', signal);
  } catch (error) {
    await stop();
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    console.error(
      'Bridge failed. Check configuration, data-directory lock, ports and OpenRGB. See docs/troubleshooting.md. No private configuration was logged.',
    );
    process.exitCode = 1;
  });
}
