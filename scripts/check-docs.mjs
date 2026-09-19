#!/usr/bin/env node
/**
 * video-cut 文档一致性检查
 *
 * 四项：
 *   1. markdown 链接可达   所有 ](path) 目标文件必须存在
 *   2. § 引用归属          每个 §N 必须能归属到某文档且该章节真实存在
 *   3. ID 交叉定义         FR/NFR/AC→DESIGN · TC→TESTING · CAND→CANDIDATES
 *                          · ADR→DECISIONS · BUG→BUGS · 引用必须有定义
 *   4. skip 区间合规       每个 `<!-- check-docs:skip -->` 区间必须
 *                          ① 紧邻一行写明豁免原因 ② 该文件登记在 INDEX.md §7.1
 *
 * 扫描根：`AGENTS.md` · `README.md` · `docs/**\/*.md`
 *
 * § 归属的判定顺序（依次）：
 *   a. 本行 § 之前**紧邻**的文档名（`DESIGN.md` 或 `DESIGN` 这类已知简称）→ 该文档必须真有此章节
 *   b. 找不到归属 → 退回「全库同名章节存在性」检查（宽松档，输出里单列计数）
 *   c. 历史写法（"原 §N"、"迁出前编号"、"章节号沿用"…）整体跳过，不参与统计
 *
 * 用法：node scripts/check-docs.mjs            # 全量
 *       node scripts/check-docs.mjs --strict   # 宽松档也算失败（收紧文档时用）
 *       node scripts/check-docs.mjs --list     # 额外列出扫描到的全部文件
 * 退出码：0 = 通过；1 = 有失败项
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');

// ────────────────────────────── 收集文件 ──────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const DOC_FILES = [
  join(ROOT, 'AGENTS.md'),
  join(ROOT, 'README.md'),
  ...walk(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')),
].filter(existsSync);

const SRC = new Map();
for (const f of DOC_FILES) SRC.set(f, readFileSync(f, 'utf8'));
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

const BY_NAME = new Map();   // basename  → 绝对路径   （`DESIGN.md §3`）
const BY_STEM = new Map();   // 大写词干  → 绝对路径   （`DESIGN §3` / `INDEX §6`）
for (const f of DOC_FILES) {
  BY_NAME.set(basename(f), f);
  BY_STEM.set(basename(f, '.md').toUpperCase(), f);
}

// ────────────────────────────── 工具 ──────────────────────────────
const results = [];
const report = (name, total, failures, notes = []) => results.push({ name, total, failures, notes });

/** 文档内所有章节号（取标题行的数字前缀），如 3 / 3.2 / 17.9 */
function sectionNumbers(text) {
  const nums = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^#{1,6}\s+(\d+(?:\.\d+)*)\.?(?=\s|$)/);
    if (m) nums.add(m[1]);
  }
  return nums;
}
const SECTIONS = new Map();
for (const f of DOC_FILES) SECTIONS.set(f, sectionNumbers(SRC.get(f)));
const ALL_SECTIONS = new Set();
for (const s of SECTIONS.values()) for (const n of s) ALL_SECTIONS.add(n);
/** 编号 → 拥有该章节的文档（用于「无法归属」时的提示） */
const OWNERS = new Map();
for (const [f, s] of SECTIONS) for (const n of s) OWNERS.set(n, [...(OWNERS.get(n) || []), rel(f)]);

const hasSection = (sections, want) =>
  [...sections].some((h) => h === want || h.startsWith(want + '.') || want.startsWith(h + '.'));

/** 历史编号语境（不参与校验，也不计入总数） */
const HIST = /(原\s*(?:[A-Za-z0-9_\-./]*\.md\s*|[A-Za-z][A-Za-z0-9_\-.]*)?\s*§|迁出前编号|章节号|旧编号|拆分前|已迁出|编号不连续|故意不重排)/;
const HIST_LINE = /(章节号沿用|编号不连续|已迁出主规格)/;
/** markdown 链接 → 保留可见文字，让 `[AGENTS.md](../AGENTS.md) §6` 能被「紧邻」匹配到 */
const flatten = (line) => line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

/**
 * 逐文件产出「(行号, 行文本, 是否跳过引用检查)」。
 * 跳过区间由 `<!-- check-docs:skip -->` … `<!-- check-docs:endskip -->` 标记，
 * 用于**历史引文**（如归档里照录的旧提交信息）：其中的编号是当时的写法，
 * 不应按现行文档校验，但也不该被改写。仅豁免 § 归属与 ID 交叉，链接仍校验。
 */
function scan(text) {
  let skip = false;
  return text.split('\n').map((line, i) => {
    if (line.includes('check-docs:endskip')) { skip = false; return { n: i + 1, line, skip: true }; }
    if (line.includes('check-docs:skip')) { skip = true; return { n: i + 1, line, skip: true }; }
    return { n: i + 1, line, skip };
  });
}
const SCANNED = new Map();
for (const [f, t] of SRC) SCANNED.set(f, scan(t));

/** 清点所有 skip 区间：文件 / 行号 / 是否写了豁免原因 */
const SKIP_BLOCKS = [];
for (const [file, rows] of SCANNED) {
  let open = null;
  for (let k = 0; k < rows.length; k++) {
    const { n, line } = rows[k];
    if (line.includes('check-docs:skip') && !line.includes('endskip')) {
      const before = rows.slice(Math.max(0, k - 3), k).map((r) => r.line).join('\n');
      const after = rows.slice(k + 1).find((r) => r.line.trim() !== '')?.line ?? '';
      open = { file, start: n, reason: /历史引文|豁免原因/.test(before + '\n' + after) };
      continue;
    }
    if (line.includes('check-docs:endskip') && open) {
      open.end = n;
      SKIP_BLOCKS.push(open);
      open = null;
    }
  }
  if (open) {
    open.end = rows.length;
    open.unclosed = true;
    SKIP_BLOCKS.push(open);
  }
}

// ─────────────────────── ① markdown 链接可达 ───────────────────────
{
  let total = 0;
  const failures = [];
  for (const [file, text] of SRC) {
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\]\(\s*([^)\s]+)\s*\)/g)) {
        const href = m[1];
        if (/^(https?:|mailto:|#)/.test(href)) continue;
        total++;
        if (!existsSync(resolve(dirname(file), decodeURI(href.split('#')[0])))) {
          failures.push(`${rel(file)}:${i + 1}  →  ${href}`);
        }
      }
    });
  }
  report('1. markdown 链接可达', total, failures);
}

// ───────────────────────── ② § 引用归属 ─────────────────────────
{
  let total = 0;
  let loose = 0;              // 无法归属、退到"全库存在性"的引用数
  const failures = [];
  const looseSamples = [];
  for (const [file, rows] of SCANNED) {
    for (const { n, line: rawLine, skip } of rows) {
      if (skip || HIST_LINE.test(rawLine)) continue;
      const line = flatten(rawLine);
      for (const m of line.matchAll(/§(\d+(?:\.\d+)*)/g)) {
        // 语境窗口含 § 本身，否则 "原 DESIGN.md §14" 这类写法匹配不到
        const ctx = line.slice(Math.max(0, m.index - 40), m.index + 1);
        if (HIST.test(ctx)) continue;
        total++;
        const want = m[1];

        // a. 紧邻的文档名（只允许空白与括号相隔）
        const near = [...line.slice(0, m.index).matchAll(
          /([A-Za-z0-9_\-.]+\.md|[A-Z][A-Z0-9_]{2,})[）)\s]*$/g,
        )];
        let target = null;
        if (near.length) {
          const tok = near[near.length - 1][1];
          target = tok.includes('.') ? BY_NAME.get(tok) : BY_STEM.get(tok.toUpperCase());
        }

        if (target) {
          if (!hasSection(SECTIONS.get(target) || new Set(), want)) {
            failures.push(`${rel(file)}:${n}  →  §${want} 在 ${rel(target)} 中不存在`);
          }
          continue;
        }
        // b. 无法归属 → 全库存在性
        loose++;
        if (!ALL_SECTIONS.has(want) && ![...ALL_SECTIONS].some((h) => h.startsWith(want + '.'))) {
          failures.push(`${rel(file)}:${n}  →  §${want} 无法归属文档，且全库无此章节`);
        } else if (looseSamples.length < 5) {
          looseSamples.push(`${rel(file)}:${n} §${want} → 见 ${(OWNERS.get(want) || []).slice(0, 2).join('、')}`);
        }
      }
    }
  }
  if (STRICT && loose) failures.push(`(--strict) 有 ${loose} 处 § 未指明归属文档`);
  report('2. § 引用归属', total, failures, [
    `其中 ${total - loose} 处有明确归属文档、${loose} 处未指明文档（仅校验编号存在性）`,
    ...(looseSamples.length ? [`未指明示例：${looseSamples.join(' ｜ ')}`] : []),
  ]);
}

// ─────────────────────── ③ ID 交叉定义 ───────────────────────
{
  const NS = {
    FR: { src: 'docs/DESIGN.md', re: /(?<![A-Za-z])FR-\d{3}\b/g, placeholders: ['FR-9xx', 'FR-17xx'] },
    NFR: { src: 'docs/DESIGN.md', re: /(?<![A-Za-z])NFR-\d{3}\b/g },
    AC: { src: 'docs/DESIGN.md', re: /(?<![A-Za-z])AC-\d{3}-\d+\b/g },
    TC: { src: 'docs/TESTING.md', re: /(?<![A-Za-z])TC-\d{3}\b/g },
    CAND: { src: 'docs/CANDIDATES.md', re: /(?<![A-Za-z])CAND-\d{3}\b/g },
    ADR: { src: 'docs/DECISIONS.md', re: /(?<![A-Za-z])ADR-\d{3}\b/g },
    BUG: { src: 'docs/BUGS.md', re: /(?<![A-Za-z])BUG-\d{3}\b/g },
  };
  const defined = {};
  for (const [ns, cfg] of Object.entries(NS)) {
    const p = join(ROOT, cfg.src);
    defined[ns] = existsSync(p) ? new Set(readFileSync(p, 'utf8').match(cfg.re) || []) : new Set();
  }

  let total = 0;
  const failures = [];
  for (const [file, rows] of SCANNED) {
    for (const { n, line, skip } of rows) {
      if (skip) continue;
      for (const [ns, cfg] of Object.entries(NS)) {
        for (const m of line.matchAll(cfg.re)) {
          if ((cfg.placeholders || []).includes(m[0])) continue;
          total++;
          if (!defined[ns].has(m[0])) {
            failures.push(`${rel(file)}:${n}  →  ${m[0]} 未在 ${cfg.src} 中定义`);
          }
        }
      }
    }
  }
  report('3. ID 交叉定义', total, failures, [
    `已定义：${Object.entries(defined).map(([k, v]) => `${k} ${v.size}`).join(' · ')}`,
  ]);
}

// ─────────────────── ④ skip 区间合规 ───────────────────
{
  const failures = [];
  const registry = new Set();
  const idxPath = join(ROOT, 'docs/INDEX.md');
  if (existsSync(idxPath)) {
    const txt = readFileSync(idxPath, 'utf8');
    const at = txt.indexOf('### 7.1');
    const sec = at >= 0 ? txt.slice(at) : '';
    for (const m of sec.matchAll(/^\|\s*`([^`]+\.md)`\s*\|/gm)) registry.add(m[1]);
  }
  for (const b of SKIP_BLOCKS) {
    const f = rel(b.file);
    if (b.unclosed) {
      failures.push(`${f}:${b.start}  →  skip 区间未闭合（缺 endskip 标记）`);
    }
    if (!b.reason) {
      failures.push(
        `${f}:${b.start}  →  skip 区间缺「豁免原因」：标记前 3 行内、或其后首个非空行须含「豁免原因」/「历史引文」`,
      );
    }
    if (!registry.has(f)) {
      failures.push(`${f}:${b.start}  →  ${f} 未登记在 INDEX.md §7.1「check-docs skip 登记表」`);
    }
  }
  report('4. skip 区间合规', SKIP_BLOCKS.length, failures, [
    SKIP_BLOCKS.length
      ? `区间：${SKIP_BLOCKS.map((b) => `${rel(b.file)}:${b.start}-${b.end}`).join(' · ')}`
      : '当前无 skip 区间',
    `登记表：${[...registry].join(' · ') || '（空）'}`,
  ]);
}

// ────────────────────────────── 输出 ──────────────────────────────
const roots = ['AGENTS.md', 'README.md', 'docs/**/*.md'];
console.log(`\n文档一致性检查 · video-cut${STRICT ? '  [--strict]' : ''}\n`);
console.log(`扫描根：${roots.join(' · ')}   →  命中 ${DOC_FILES.length} 个文件`);
if (process.argv.includes('--list')) {
  for (const f of [...DOC_FILES].map(rel).sort()) console.log(`  · ${f}`);
}
console.log();
let bad = 0;
for (const r of results) {
  const ok = r.failures.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? '✔' : '✘'} ${r.name.padEnd(24)} ${String(r.total - r.failures.length).padStart(4)} / ${r.total}`);
  for (const n of r.notes) console.log(`    · ${n}`);
  if (!ok) {
    for (const f of r.failures.slice(0, 30)) console.log(`      ✘ ${f}`);
    if (r.failures.length > 30) console.log(`      … 另有 ${r.failures.length - 30} 处`);
  }
}
console.log();
if (bad === 0) {
  console.log('全部通过。\n');
  process.exit(0);
}
console.log(`${bad} 项失败，请修复后重跑。\n`);
process.exit(1);
