/**
 * The engine is the only part of the app that talks to a model.
 * `FirebaseEngine` is the real one. `DemoEngine` stands in for it in tests.
 */
import type { Mode, TaskId } from '../core/policy';
import type { InferenceSource, WebSource } from '../core/types';

export interface EngineRequest {
  task: TaskId;
  mode: Mode;
  system: string;
  prompt: string;
  schema?: Record<string, unknown>;
  image?: { mimeType: 'image/jpeg' | 'image/png'; base64: string };
  cloudModel: string;
  search?: boolean;
}

export interface EngineResult {
  text: string;
  source: InferenceSource;
  sources?: WebSource[];
  searchHtml?: string;
}

export type DeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export interface Engine {
  /** Shown on screen, so nobody mistakes a simulated run for a real one. */
  readonly name: string;
  readonly simulated: boolean;
  run(request: EngineRequest): Promise<EngineResult>;
  deviceStatus(): Promise<DeviceStatus>;
  /** Start the model download. Must be called from a click. `progress` runs from 0 to 1. */
  prepareDevice(onProgress: (progress: number) => void): Promise<void>;
}

/** Thrown when a mode needs the on-device model and this browser has none. */
export class NoDeviceModelError extends Error {
  constructor() {
    super('This browser has no on-device model.');
    this.name = 'NoDeviceModelError';
  }
}

/** Thrown when a mode needs the cloud and it cannot be reached. Nothing left the laptop. */
export class OfflineError extends Error {
  constructor() {
    super('The cloud could not be reached.');
    this.name = 'OfflineError';
  }
}

/**
 * Thrown when the request reached the cloud and the cloud turned it down
 * (for example HTTP 429, over the free quota). The prompt did leave the laptop,
 * so the ledger must record it as sent.
 */
export class CloudRefusedError extends Error {
  constructor(
    readonly status: number,
    detail = '',
  ) {
    super(`The cloud refused the request (HTTP ${status})${detail ? `: ${detail}` : ''}`);
    this.name = 'CloudRefusedError';
  }
}
