/**
 * The real engine: Firebase AI Logic hybrid inference.
 *
 * Written against firebase 13.3.0 and type-checked. It has NOT been run in this
 * starter: that needs a Firebase project and a Chrome with the on-device model.
 * Day-1 checks 3 to 6 in the roadmap are where you run it for the first time.
 */
import {
  AIError,
  AIErrorCode,
  getGenerativeModel,
  InferenceMode,
  type AI,
  type GenerativeModel,
  type HybridParams,
  type ModelParams,
  type OnDeviceParams,
  type Part,
} from 'firebase/ai';
import type { Mode } from '../core/policy';
import type { WebSource } from '../core/types';
import type { DeviceStatus, Engine, EngineRequest, EngineResult } from './engine';
import { NoDeviceModelError, OfflineError } from './engine';

const SDK_MODE: Record<Mode, InferenceMode> = {
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  prefer_in_cloud: InferenceMode.PREFER_IN_CLOUD,
  only_in_cloud: InferenceMode.ONLY_IN_CLOUD,
};

/** Chrome's Prompt API global. Only the one call we need. */
interface PromptApi {
  availability(options?: object): Promise<DeviceStatus>;
}

function promptApi(): PromptApi | undefined {
  return (globalThis as { LanguageModel?: PromptApi }).LanguageModel;
}

function onDeviceParams(system: string, withImage: boolean, schema?: Record<string, unknown>): OnDeviceParams {
  return {
    createOptions: {
      expectedInputs: withImage
        ? [{ type: 'text', languages: ['en'] }, { type: 'image' }]
        : [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [{ role: 'system', content: [{ type: 'text', value: system }] }],
    },
    // On the device, structured output is asked for with a JSON Schema here.
    // `generationConfig.responseSchema` is read by the cloud model only.
    promptOptions: schema ? { responseConstraint: schema } : undefined,
  };
}

function inCloudParams(request: EngineRequest): ModelParams {
  const params: ModelParams = { model: request.cloudModel, systemInstruction: request.system };
  if (request.search) {
    params.tools = [{ googleSearch: {} }];
  } else if (request.schema) {
    params.generationConfig = { responseMimeType: 'application/json', responseJsonSchema: request.schema };
  }
  return params;
}

export class FirebaseEngine implements Engine {
  readonly name = 'Firebase AI Logic';
  readonly simulated = false;
  private readonly models = new Map<string, GenerativeModel>();

  constructor(private readonly ai: AI) {}

  private model(request: EngineRequest): GenerativeModel {
    const key = JSON.stringify([
      request.mode,
      request.system,
      request.schema ?? null,
      Boolean(request.image),
      request.cloudModel,
      Boolean(request.search),
    ]);
    const cached = this.models.get(key);
    if (cached) return cached;

    const params: HybridParams = { mode: SDK_MODE[request.mode] };
    // An on-device-only model is given no cloud settings at all, and the other way round.
    if (request.mode !== 'only_in_cloud') {
      params.onDeviceParams = onDeviceParams(request.system, Boolean(request.image), request.schema);
    }
    if (request.mode !== 'only_on_device') {
      params.inCloudParams = inCloudParams(request);
    }
    const model = getGenerativeModel(this.ai, params);
    this.models.set(key, model);
    return model;
  }

  async run(request: EngineRequest): Promise<EngineResult> {
    if (request.mode === 'only_on_device' && (await this.deviceStatus()) === 'unavailable') {
      throw new NoDeviceModelError();
    }
    if (request.mode === 'only_in_cloud' && typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new OfflineError();
    }

    const parts: Array<string | Part> = [request.prompt];
    if (request.image) {
      parts.push({ type: 'inlineData', inlineData: { data: request.image.base64, mimeType: request.image.mimeType } });
    }

    try {
      const { response } = await this.model(request).generateContent(parts);
      const source =
        response.inferenceSource ??
        (request.mode === 'only_on_device' ? 'on_device' : request.mode === 'only_in_cloud' ? 'in_cloud' : undefined);
      if (!source) throw new Error('The SDK did not say where the request ran.');

      const grounding = response.candidates?.[0]?.groundingMetadata;
      const sources: WebSource[] = [];
      for (const chunk of grounding?.groundingChunks ?? []) {
        if (chunk.web?.uri) sources.push({ title: chunk.web.title ?? chunk.web.uri, uri: chunk.web.uri });
      }
      return {
        text: response.text(),
        source,
        sources,
        searchHtml: grounding?.searchEntryPoint?.renderedContent,
      };
    } catch (error) {
      if (error instanceof AIError) {
        const onDeviceOnly = request.mode === 'only_on_device';
        if (onDeviceOnly && (error.code === AIErrorCode.API_NOT_ENABLED || error.code === AIErrorCode.UNSUPPORTED)) {
          throw new NoDeviceModelError();
        }
        if (!onDeviceOnly && error.code === AIErrorCode.FETCH_ERROR) throw new OfflineError();
      }
      throw error;
    }
  }

  async deviceStatus(): Promise<DeviceStatus> {
    const api = promptApi();
    if (!api) return 'unavailable';
    try {
      return await api.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });
    } catch {
      return 'unavailable';
    }
  }

  async prepareDevice(onProgress: (progress: number) => void): Promise<void> {
    const model = getGenerativeModel(this.ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: onDeviceParams('You are a helpful assistant.', false),
    });
    await model.initializeDeviceModel(onProgress);
  }
}
