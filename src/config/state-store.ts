import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { defaultState, type LightState } from '../devices/device-types.js';
import { readJSON, writeJSON, backupInstallation } from './config-manager.js';
export const lightStateSchema = z.strictObject({
  on: z.boolean(),
  hue: z.number().min(0).max(360),
  saturation: z.number().min(0).max(100),
  brightness: z.number().min(0).max(100),
});
const statesSchema = z.record(z.string(), lightStateSchema);
export class StateStore {
  private states: Record<string, LightState>;
  private path: string;
  private legacy = false;
  private dir: string;
  constructor(dir: string) {
    this.dir = dir;
    this.path = join(dir, 'state.json');
    if (existsSync(this.path)) {
      const raw = readJSON(this.path);
      if (raw && typeof raw === 'object' && 'version' in raw) {
        const parsed = z
          .strictObject({ version: z.literal(1), lights: statesSchema })
          .parse(raw);
        this.states = parsed.lights;
      } else {
        this.states = statesSchema.parse(raw);
        this.legacy = true;
      }
    } else this.states = {};
  }
  get(id: string): LightState {
    return { ...(this.states[id] ?? defaultState) };
  }
  set(id: string, state: LightState): void {
    const next = { ...this.states, [id]: lightStateSchema.parse(state) };
    if (this.legacy) {
      backupInstallation(this.dir);
      this.legacy = false;
    }
    writeJSON(this.path, { version: 1, lights: next });
    this.states = next;
  }
}
