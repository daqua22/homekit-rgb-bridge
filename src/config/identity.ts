import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readJSON, writeJSON } from './config-manager.js';
const schema = z.strictObject({
  username: z.string().regex(/^[A-F0-9]{2}(:[A-F0-9]{2}){5}$/),
  pincode: z.string().regex(/^\d{3}-\d{2}-\d{3}$/),
  setupID: z.string().regex(/^[A-Z0-9]{4}$/),
});
export type Identity = z.infer<typeof schema>;
export function loadIdentity(dir: string): Identity {
  const path = join(dir, 'identity.json');
  if (existsSync(path)) return schema.parse(readJSON(path));
  if (
    existsSync(join(dir, 'hap-storage')) &&
    readdirSync(join(dir, 'hap-storage')).length
  )
    throw new Error(
      'Existing HAP storage requires restoring its original identity from backup',
    );
  let pin: string;
  do {
    pin = String(randomInt(100000000)).padStart(8, '0');
  } while (/^(\d)\1{7}$/.test(pin) || ['12345678', '87654321'].includes(pin));
  const mac = randomBytes(6);
  mac[0] = (mac[0]! | 2) & 0xfe;
  const identity = {
    username: [...mac]
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(':'),
    pincode: `${pin.slice(0, 3)}-${pin.slice(3, 5)}-${pin.slice(5)}`,
    setupID: Array.from(
      { length: 4 },
      () => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[randomInt(36)],
    ).join(''),
  };
  writeJSON(path, identity);
  return identity;
}
