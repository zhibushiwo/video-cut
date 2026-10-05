#!/usr/bin/env node
/**
 * 版本号 bump —— 单一真源 = package.json。
 *
 *   · package.json                ← 唯一的版本数字来源
 *   · src-tauri/tauri.conf.json   ← 只写 "../package.json"（Tauri 据此生成安装包名与
 *                                    getVersion()）；本脚本会校验它没被写回死数字
 *   · src-tauri/Cargo.toml        ← 由本脚本同步（crate 版本，保持一致以免混淆）
 *
 * Cargo.lock 不在此改写：下次 cargo build/test 会自行跟随 Cargo.toml。
 * 规格见 AGENTS.md §2 / §3 第 22 条 / §5.1。
 *
 * 用法：node scripts/bump-version.mjs <patch|minor|major|x.y.z> [--changelog] [--dry-run]
 *       pnpm version:bump minor
 *       pnpm version:bump 0.1.1 --changelog     # 连带切 CHANGELOG 的 [Unreleased]
 *       pnpm version:bump 0.1.1 --changelog     # 版本号已改好、只想补切段时（不改版本号）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = join(ROOT, "package.json");
const CONF = join(ROOT, "src-tauri", "tauri.conf.json");
const CARGO = join(ROOT, "src-tauri", "Cargo.toml");
const CHANGELOG = join(ROOT, "docs", "CHANGELOG.md");

const CONF_VERSION = "../package.json"; // tauri.conf.json 里唯一允许的 version 写法
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const BUMPS = ["patch", "minor", "major"];
const CATEGORIES = ["新增", "变更", "修复", "移除"]; // Keep a Changelog 的四分类

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const withChangelog = args.includes("--changelog");
const force = args.includes("--force");
const spec = args.find((a) => !a.startsWith("--"));

if (!spec) usage("缺少版本参数（patch | minor | major | x.y.z）。");

function usage(msg) {
  if (msg) console.error(`✘ ${msg}\n`);
  console.log(
    [
      "用法：node scripts/bump-version.mjs <patch|minor|major|x.y.z> [--changelog] [--dry-run]",
      "",
      "  patch|minor|major   按 semver 递增（丢弃预发布段）",
      "  x.y.z               显式指定，如 1.0.0、1.0.0-beta.1",
      "  --changelog         把 docs/CHANGELOG.md 的 [Unreleased] 切成 [x.y.z] - 日期，",
      "                      并在顶部重开一个空的 [Unreleased]（版本号与当前相同时只切段）",
      "  --force             配合 --changelog：即使 [Unreleased] 只有占位（无实际条目）也切",
      "  --dry-run           只打印将要写入的内容，不落盘",
      "",
      "例：pnpm version:bump minor --changelog",
      "    pnpm version:bump 0.1.1 --changelog     # 已先改好号，只补切段",
      "",
      "单一真源：package.json；本脚本同步 src-tauri/Cargo.toml。",
      `src-tauri/tauri.conf.json 的 version 必须是 "${CONF_VERSION}"。`,
    ].join("\n"),
  );
  process.exit(1);
}

// ── 当前值 ──
const pkgText = readFileSync(PKG, "utf8");
const current = JSON.parse(pkgText).version;
if (!SEMVER.test(current)) usage(`package.json 的 version 非法：${current}`);

// ── 前置校验：tauri.conf.json 必须指向 package.json（防双真源） ──
const confVersion = JSON.parse(readFileSync(CONF, "utf8")).version;
if (confVersion !== CONF_VERSION) {
  usage(
    `src-tauri/tauri.conf.json 的 version 应为 "${CONF_VERSION}"，实际是 "${confVersion}"。\n` +
      "  请先改回路径写法（见 AGENTS.md §3 第 22 条），否则版本号会出现第二个真源。",
  );
}

// ── 计算新版本 ──
function nextVersion(spec, cur) {
  if (BUMPS.includes(spec)) {
    const [maj, min, pat] = cur.split("-")[0].split("+")[0].split(".").map(Number);
    if (spec === "major") return `${maj + 1}.0.0`;
    if (spec === "minor") return `${maj}.${min + 1}.0`;
    return `${maj}.${min}.${pat + 1}`;
  }
  if (!SEMVER.test(spec)) usage(`无法识别的版本参数：${spec}`);
  return spec;
}
const next = nextVersion(spec, current);
const sameVersion = next === current;
if (sameVersion && !withChangelog) {
  usage(`新版本与当前值相同（${current}），无变化（如只想补切 CHANGELOG，加 --changelog）。`);
}

// ── 生成新文本（只替换版本片段，保留原格式与 LF 行尾） ──
function replaceVersion(text, re, value, label) {
  if (!re.test(text)) throw new Error(`${label} 中找不到可替换的版本字段`);
  return text.replace(re, value);
}
const nextPkg = replaceVersion(pkgText, /("version"\s*:\s*")[^"]*(")/, `$1${next}$2`, "package.json");
const cargoText = readFileSync(CARGO, "utf8");
const nextCargo = replaceVersion(
  cargoText,
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]*(")/,
  `$1${next}$2`,
  "src-tauri/Cargo.toml 的 [package]",
);

// ── CHANGELOG 切段（可选，--changelog） ──
const today = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

function cutChangelog(text, version, date, force) {
  const lines = text.split("\n");
  const head = lines.findIndex((l) => /^##\s+\[Unreleased\]\s*$/.test(l));
  if (head < 0) throw new Error("docs/CHANGELOG.md 里找不到 `## [Unreleased]` 段");
  const nextHead = lines.findIndex((l, i) => i > head && /^##\s+/.test(l));
  const stop = nextHead < 0 ? lines.length : nextHead;
  const body = lines.slice(head + 1, stop);

  const hasContent = body.some((l) => /^-\s+/.test(l) && !/^-\s*（暂无）\s*$/.test(l));
  if (!hasContent && !force) {
    throw new Error(
      "`[Unreleased]` 只有占位、没有实际变更条目；如确认要发版，加 --force 强制切段。",
    );
  }

  // 去掉段首的「开发中」状态说明（连续的 > 行，及其前后空行）——它是快照，不属该版本
  let s = 0;
  const skipBlank = () => {
    while (s < body.length && body[s].trim() === "") s++;
  };
  skipBlank();
  while (s < body.length && /^>/.test(body[s])) {
    s++;
    skipBlank();
  }
  const kept = body.slice(s);

  const fresh = [
    "## [Unreleased]",
    "",
    ...CATEGORIES.flatMap((c) => [`### ${c}`, "- （暂无）", ""]),
  ];
  return [...lines.slice(0, head), ...fresh, `## [${version}] - ${date}`, "", ...kept].join("\n");
}

// ── CHANGELOG 切段（可选；先算好，任何失败都在落盘前中止） ──
let nextChangelog = null;
if (withChangelog) {
  try {
    nextChangelog = cutChangelog(readFileSync(CHANGELOG, "utf8"), next, today, force);
  } catch (e) {
    console.error(`\n✘ ${e.message}\n`);
    process.exit(1);
  }
}

// ── 输出 ──
if (sameVersion) {
  console.log(`\n版本：保持 ${current}（未改，仅切 CHANGELOG）${dryRun ? "（--dry-run，不落盘）" : ""}`);
} else {
  console.log(`\n版本：${current} → ${next}${dryRun ? "（--dry-run，不落盘）" : ""}`);
  console.log(`  ✔ package.json              version "${current}" → "${next}"`);
  console.log(`  ✔ src-tauri/Cargo.toml      version "${current}" → "${next}"`);
  console.log(`  · src-tauri/tauri.conf.json 保持 "${CONF_VERSION}"（跟随 package.json）`);
}

if (nextChangelog) {
  console.log(`  ✔ docs/CHANGELOG.md         [Unreleased] → [${next}] - ${today}（顶部重开空段）`);
}

if (dryRun) {
  console.log("\n（未写入任何文件）\n");
  process.exit(0);
}

if (!sameVersion) {
  writeFileSync(PKG, nextPkg);
  writeFileSync(CARGO, nextCargo);
}
if (nextChangelog) writeFileSync(CHANGELOG, nextChangelog);

const todo = withChangelog
  ? ["  1. 补写 docs/CHANGELOG.md 新 [Unreleased] 的「开发中」状态说明（已清空）"]
  : [`  1. 把 docs/CHANGELOG.md 的 [Unreleased] 段切成 "## [${next}] - ${today}"，顶部重开空的 [Unreleased]`];
const tail = ["", "下一步：", ...todo, `  2. pnpm tauri build → video-cut_${next}_x64-setup.exe`];
if (!sameVersion) tail.push(`  （Cargo.lock 会在下次 cargo 构建时自动跟随 ${next}）`);
tail.push("");
console.log(tail.join("\n"));
