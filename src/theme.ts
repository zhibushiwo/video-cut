/**
 * 主题色（DESIGN §9.1 / 决策 #16）：强调色只提供预设，运行时覆写
 * :root 的 --color-signal；signal（无损/就绪）与 warn（重编码）语义不变，
 * 预设色相避开 warn 琥珀以免混淆。
 */
import type { AccentChoice } from "./types";

export const ACCENTS: { value: AccentChoice; label: string; hex: string }[] = [
  { value: "green", label: "绿（默认）", hex: "#4cc38a" },
  { value: "blue", label: "蓝", hex: "#4da3ff" },
  { value: "violet", label: "紫", hex: "#a78bfa" },
  { value: "rose", label: "玫红", hex: "#f26d9d" },
];

/** 应用主题色到文档根（启动加载与设置变更时调用） */
export function applyAccent(choice: AccentChoice) {
  const hex = ACCENTS.find((a) => a.value === choice)?.hex ?? ACCENTS[0].hex;
  document.documentElement.style.setProperty("--color-signal", hex);
}
