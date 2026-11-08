import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL_ID = "onnx-community/LFM2.5-350M-ONNX";
env.useBrowserCache = true;
env.useWasmCache = true;
env.cacheKey = "koglesh-local-ai-v1";

let generatorPromise = null;
let selectedBackend = "CPU/WASM";

async function loadGenerator(onProgress) {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      const options = {
        dtype: "q4",
        progress_callback: (event) => {
          try { onProgress?.(event); } catch {}
        },
      };

      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        try {
          selectedBackend = "WebGPU";
          return await pipeline("text-generation", MODEL_ID, { ...options, device: "webgpu" });
        } catch (gpuError) {
          console.warn("Local AI WebGPU unavailable; falling back to CPU/WASM.", gpuError);
          selectedBackend = "CPU/WASM";
        }
      }

      selectedBackend = "CPU/WASM";
      return await pipeline("text-generation", MODEL_ID, options);
    })().catch((error) => {
      generatorPromise = null;
      throw error;
    });
  }

  return generatorPromise;
}

window.localAI = {
  async generate(messages, onProgress, maxNewTokens = 300) {
    const generator = await loadGenerator(onProgress);
    const output = await generator(messages, {
      max_new_tokens: maxNewTokens,
      do_sample: false,
      repetition_penalty: 1.08,
    });

    const generated = output?.[0]?.generated_text;
    let text = "";

    if (typeof generated === "string") {
      text = generated;
    } else if (Array.isArray(generated)) {
      const last = generated[generated.length - 1];
      text = typeof last?.content === "string" ? last.content : "";
    } else if (generated && typeof generated.content === "string") {
      text = generated.content;
    }

    if (!text.trim()) throw new Error("The local model returned an empty response.");
    return text.trim();
  },

  backend() {
    return selectedBackend;
  },
};

window.dispatchEvent(new CustomEvent("local-ai-ready"));
