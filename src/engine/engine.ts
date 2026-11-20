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
  /**
   * Set when the cloud was asked first, turned the request down, and the work then ran
   * on the device (PREFER_IN_CLOUD falling back). The prompt did leave the laptop.
   */
  refusedBeforeFallback?: { status: number };
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
  /**
   * Load the on-device model into memory before the first task needs it. The first session
   * after Chrome starts took 15.5 s; the next ones took under 1 s. No prompt is sent and no
   * learner data is involved. Runs once, does nothing without a ready model, and never throws.
   */
  warmDevice(): Promise<void>;
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

/** How long Staffroom waits for the cloud before it stops waiting. The SDK's own default is 180 s. */
export const CLOUD_TIMEOUT_MS = 30_000;

/**
 * Thrown when the request was sent to the cloud and no answer came back in time.
 * The prompt did leave the laptop, so the ledger must record it as sent.
 */
export class CloudTimeoutError extends Error {
  constructor(readonly ms = CLOUD_TIMEOUT_MS) {
    super(`The cloud did not answer within ${Math.round(ms / 1000)} seconds.`);
    this.name = 'CloudTimeoutError';
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
