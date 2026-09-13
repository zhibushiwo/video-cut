/**
 * 应用设置：tauri-plugin-store 持久化（DESIGN §12）。
 * 存储于 app_config_dir/settings.json，单键 "settings" 持有整个 AppSettings。
 */
import { load, type Store } from "@tauri-apps/plugin-store";
import type { AppSettings, CutMode, EncoderChoice, ProxyMode, QualityPreset } from "../types";

export const DEFAULT_SETTINGS: AppSettings = {
  defaultOutputDir: "",
  defaultCutMode: "fast",
  keyframeSnap: true,
  proxyMode: "auto",
  encoder: "auto",
  quality: "balanced",
};

const STORE_FILE = "settings.json";
const STORE_KEY = "settings";

const ENCODERS: EncoderChoice[] = [
  "auto",
  "h264_nvenc",
  "h264_qsv",
  "h264_amf",
  "libx264",
  "libx265",
];

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE, { autoSave: false });
  return storePromise;
}

/** 防御旧版/损坏的 settings.json：逐字段校验，非法值回退默认 */
function sanitize(raw: unknown): AppSettings {
  const r = (raw ?? {}) as Partial<AppSettings>;
  const cutModes: CutMode[] = ["fast", "precise"];
  const proxyModes: ProxyMode[] = ["auto", "always", "off"];
  const qualities: QualityPreset[] = ["high", "balanced", "small"];
  return {
    defaultOutputDir: typeof r.defaultOutputDir === "string" ? r.defaultOutputDir : "",
    defaultCutMode: cutModes.includes(r.defaultCutMode as CutMode)
      ? (r.defaultCutMode as CutMode)
      : DEFAULT_SETTINGS.defaultCutMode,
    keyframeSnap: typeof r.keyframeSnap === "boolean" ? r.keyframeSnap : true,
    proxyMode: proxyModes.includes(r.proxyMode as ProxyMode)
      ? (r.proxyMode as ProxyMode)
      : DEFAULT_SETTINGS.proxyMode,
    encoder: ENCODERS.includes(r.encoder as EncoderChoice)
      ? (r.encoder as EncoderChoice)
      : DEFAULT_SETTINGS.encoder,
    quality: qualities.includes(r.quality as QualityPreset)
      ? (r.quality as QualityPreset)
      : DEFAULT_SETTINGS.quality,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const raw: unknown = await store.get(STORE_KEY);
    return sanitize(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set(STORE_KEY, settings);
  await store.save();
}
