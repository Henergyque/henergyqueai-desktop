// Télécharge le modèle de transcription dans desktop/models/, une fois, avant
// l'empaquetage. Le modèle n'est pas versionné dans git.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline } from "@huggingface/transformers";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "onnx-community/whisper-base";

env.allowLocalModels = false;
env.cacheDir = path.join(root, "models");
const recognize = await pipeline("automatic-speech-recognition", MODEL, { dtype: "q8", device: "cpu" });
// Une seconde de silence suffit à vérifier que le modèle se charge et tourne.
await recognize(new Float32Array(16000), { language: "french", task: "transcribe" });
console.log(`Modèle prêt dans ${path.join(env.cacheDir, MODEL)}`);
