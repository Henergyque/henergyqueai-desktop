// Transcription vocale locale, dans un processus à part pour que la fenêtre
// reste fluide. Le modèle est embarqué avec l'application : la voix ne quitte
// jamais l'ordinateur et rien n'est téléchargé à l'exécution.
const path = require("node:path");

const MODEL = "onnx-community/whisper-base";
let ready = null;

function load() {
  ready ??= import("@huggingface/transformers").then(async ({ env, pipeline }) => {
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = path.resolve(process.env.HENERGYQUE_MODELS || path.join(__dirname, "..", "models")) + path.sep;
    env.useFSCache = false;
    return pipeline("automatic-speech-recognition", MODEL, { dtype: "q8", device: "cpu" });
  });
  return ready;
}

async function transcribe(samples, language) {
  const recognize = await load();
  const result = await recognize(samples, { language, task: "transcribe" });
  return String(result?.text || "").trim();
}

module.exports = { transcribe, MODEL };

if (process.parentPort) {
  process.parentPort.on("message", async ({ data }) => {
    const { id, samples, language } = data || {};
    try {
      process.parentPort.postMessage({ id, text: await transcribe(samples, language) });
    } catch (error) {
      process.parentPort.postMessage({ id, error: String(error?.message || error) });
    }
  });
}
