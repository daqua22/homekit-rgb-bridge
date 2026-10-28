import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { defaultState, type LightState } from '../devices/device-types.js';
import { readJSON, writeJSON } from './config-manager.js';
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
  constructor(dir: string) {
    this.path = join(dir, 'state.json');
    this.states = existsSync(this.path)
      ? statesSchema.parse(readJSON(this.path))
      : {};
  }
  get(id: string): LightState {
    return { ...(this.states[id] ?? defaultState) };
  }
  set(id: string, state: LightState): void {
    const next = { ...this.states, [id]: lightStateSchema.parse(state) };
    writeJSON(this.path, next);
    this.states = next;
  }
}
