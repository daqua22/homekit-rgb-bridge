import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AppController, UserError } from './controller.js';
import { lightStateSchema } from '../config/state-store.js';
import { GroupCommandError } from '../devices/device-manager.js';
const content: Record<string, { name: string; type: string }> = {
  '/': { name: 'index.html', type: 'text/html' },
  '/app.js': { name: 'app.js', type: 'text/javascript' },
  '/style.css': { name: 'style.css', type: 'text/css' },
};
export async function startAdmin(
  controller: AppController,
  options: {
    port?: number;
    token?: string;
    onQuit?: () => Promise<void>;
    publicDirectory?: string;
  } = {},
) {
  const token = options.token ?? randomBytes(32).toString('hex');
  const assets =
    options.publicDirectory ??
    fileURLToPath(new URL('../../public/', import.meta.url));
  let origin = '';
  let count = 0,
    window = Date.now();
  const respond = (res: ServerResponse, code: number, value: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent)
        respond(res, 500, {
          error:
            'The operation failed. Inspect diagnostics and check local permissions.',
        });
      else res.end();
    });
  });
  async function body(req: IncomingMessage): Promise<unknown> {
    if (req.headers['content-type'] !== 'application/json')
      throw new UserError('Expected application/json');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 65536) throw new UserError('Request is too large');
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (
      req.headers.host !== origin.slice(7) ||
      (req.headers.origin !== undefined && req.headers.origin !== origin) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      respond(res, 403, { error: 'Untrusted request origin or host' });
      return;
    }
    if (Date.now() - window > 60000) {
      count = 0;
      window = Date.now();
    }
    if (++count > 600) {
      respond(res, 429, { error: 'Too many requests' });
      return;
    }
    const path = req.url ?? '/';
    if (req.method === 'GET' && path === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && content[path]) {
      const asset = content[path]!;
      res.writeHead(200, { 'Content-Type': asset.type });
      res.end(readFileSync(resolve(assets, asset.name)));
      return;
    }
    const auth = req.headers.authorization ?? '';
    const expected = 'Bearer ' + token;
    if (
      Buffer.byteLength(auth) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
    ) {
      respond(res, 401, {
        error: 'Open this panel using the local application launcher.',
      });
      return;
    }
    try {
      if (req.method === 'GET' && path === '/api/status') {
        respond(res, 200, controller.status());
        return;
      }
      if (req.method === 'GET' && path === '/api/logs') {
        respond(res, 200, { events: controller.logger.events() });
        return;
      }
      if (req.method !== 'POST') {
        respond(res, 404, { error: 'Unknown route' });
        return;
      }
      const value = await body(req);
      if (path === '/api/devices') {
        respond(res, 200, { devices: await controller.discover() });
        return;
      }
      if (path === '/api/config') {
        const p = z
          .strictObject({
            config: z.unknown(),
            revision: z.string(),
            confirm: z.boolean(),
          })
          .parse(value);
        await controller.save(p.config, p.revision, p.confirm);
      } else if (path === '/api/start') await controller.start();
      else if (path === '/api/stop') await controller.stop();
      else if (path === '/api/restart') await controller.restart();
      else if (path === '/api/pairing') {
        respond(res, 200, await controller.pairing());
        return;
      } else if (path === '/api/reset') {
        const p = z.strictObject({ confirmation: z.string() }).parse(value);
        await controller.reset(p.confirmation);
      } else if (path === '/api/autostart') {
        const p = z.strictObject({ enabled: z.boolean() }).parse(value);
        controller.autostart(p.enabled);
      } else if (path === '/api/light') {
        const p = z
          .strictObject({ id: z.string(), state: lightStateSchema.partial() })
          .parse(value);
        if (!controller.manager) throw new UserError('Start the bridge first');
        await controller.manager.request(p.id, p.state);
      } else if (path === '/api/quit') {
        respond(res, 200, { ok: true });
        setImmediate(() => {
          void options
            .onQuit?.()
            .catch(() => controller.logger.log('error', 'shutdown_failed'));
        });
        return;
      } else {
        respond(res, 404, { error: 'Unknown route' });
        return;
      }
      respond(res, 200, { ok: true });
    } catch (error) {
      if (error instanceof GroupCommandError) {
        respond(res, 503, {
          error:
            'Lighting update failed. Failed targets: ' +
            error.failed.join(', ') +
            '. Accepted targets: ' +
            (error.accepted.join(', ') || 'none') +
            '. No rollback was attempted.',
          failed: error.failed,
          accepted: error.accepted,
        });
        return;
      }
      const message =
        error instanceof UserError
          ? error.message
          : error instanceof z.ZodError
            ? 'Invalid settings or overlapping whole-device/zone/group selection. Check names, ports and experimental-zone consent.'
            : error instanceof SyntaxError
              ? 'Invalid JSON request'
              : 'Operation failed. Check device availability, permissions and diagnostics.';
      respond(
        res,
        error instanceof UserError ||
          error instanceof z.ZodError ||
          error instanceof SyntaxError
          ? 400
          : 503,
        { error: message },
      );
    }
  }
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 100;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(
      options.port ?? controller.config.admin.port,
      '127.0.0.1',
      () => resolve(),
    );
  });
  const addr = server.address();
  if (!addr || typeof addr === 'string')
    throw new Error('Control panel failed to bind');
  origin = `http://127.0.0.1:${addr.port}`;
  return {
    server,
    token,
    origin,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
