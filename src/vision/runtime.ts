import { env, InferenceSession } from 'onnxruntime-web/wasm';
import type { ResidentWorkerAssets } from '../worker/protocol';
import { failure } from '../core/errors';
export interface VisionRuntime { detector: InferenceSession; recognition: InferenceSession; release: () => Promise<void> }
export async function initializeVision(assets: ResidentWorkerAssets): Promise<VisionRuntime> {
  if (assets.runtimeVersion !== '1.30.0' || !assets.runtime.mjs.startsWith('blob:') || !assets.runtime.wasm.startsWith('blob:') || !(assets.models.detector instanceof Uint8Array) || !(assets.models.recognition instanceof Uint8Array)) throw failure('asset-integrity-failed');
  env.wasm.numThreads = 1;
  env.wasm.proxy = false;
  env.wasm.wasmPaths = { mjs: assets.runtime.mjs, wasm: assets.runtime.wasm };
  env.logLevel = 'fatal';
  const options: InferenceSession.SessionOptions = { executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all', logSeverityLevel: 4 };
  const detector = await InferenceSession.create(assets.models.detector, options);
  let recognition: InferenceSession | null = null;
  try {
    recognition = await InferenceSession.create(assets.models.recognition, options);
    const check = (session: InferenceSession, name: string, dimensions: number[]): void => {
      const input = session.inputMetadata[0];
      if (session.inputNames.length !== 1 || session.inputNames[0] !== name || !input || !input.isTensor || JSON.stringify(input.shape) !== JSON.stringify(dimensions)) throw failure('asset-integrity-failed');
    };
    check(detector, 'input', [1,3,640,640]); check(recognition, 'data', [1,3,112,112]);
    if (detector.outputNames.length !== 12 || recognition.outputNames.length !== 1) throw failure('asset-integrity-failed');
    const recognizer = recognition;
    return { detector, recognition: recognizer, release: async () => { await detector.release(); await recognizer.release(); } };
  } catch (error) { await detector.release(); await recognition?.release(); throw error; }
}
