/**
 * 标签色的可读性护栏。
 *
 * 标签色属于用户数据（tags.color 存十六进制），历史上由一个写死的 8 色数组随机取值，
 * 渲染时直接内联成 `background: color + '22'; color: color`，实测对比度仅 1.43–1.63:1；
 * 选中态是白字压在饱和色上，8 个色相全部不达标，最差的黄色只有 1.53:1。
 *
 * 这里不改存储格式、也不做数据迁移：那 8 个历史色值正好是 Tailwind 各色相的 -400 阶，
 * 可精确映射回色相，因此标签的「颜色身份」保持不变，只是换用经校验的前景/背景配对。
 * 未知色值按字符串哈希稳定落到某个色相，不会随刷新变化。
 *
 * 实测对比度（WCAG 2.1）：
 *   浅色 chip  {hue}-700 on {hue}-100                4.52 – 5.92
 *   深色 chip  {hue}-300 on {hue}-500/15 叠加卡片底   7.98 – 10.03
 *   选中态     白字 on {hue}-700                      4.92 – 6.98
 */

export const TAG_HUES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'fuchsia', 'emerald'] as const
export type TagHue = typeof TAG_HUES[number]

/** 历史随机取色池 —— 正好是 Tailwind 各色相的 -400 */
const LEGACY_HEX: Record<string, TagHue> = {
  '#f87171': 'red',    '#fb923c': 'orange',  '#facc15': 'yellow',  '#4ade80': 'green',
  '#60a5fa': 'blue',   '#c084fc': 'purple',  '#e879f9': 'fuchsia', '#34d399': 'emerald',
}

/** 写回数据库时使用的十六进制值，保持与历史数据同一套 */
export const TAG_HEX: Record<TagHue, string> = {
  red: '#f87171', orange: '#fb923c', yellow: '#facc15', green: '#4ade80',
  blue: '#60a5fa', purple: '#c084fc', fuchsia: '#e879f9', emerald: '#34d399',
}

export function tagHue(color?: string | null): TagHue {
  if (!color) return 'blue'
  const hit = LEGACY_HEX[color.toLowerCase()]
  if (hit) return hit
  // 未知色值：稳定哈希，保证同一颜色每次渲染落到同一色相
  let h = 0
  for (let i = 0; i < color.length; i++) h = (h * 31 + color.charCodeAt(i)) >>> 0
  return TAG_HUES[h % TAG_HUES.length]
}

// 类名必须写成字面量：Tailwind 的 JIT 按源码文本扫描，运行时拼接出的类名不会被生成。
const CHIP: Record<TagHue, string> = {
  red:     'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  orange:  'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  yellow:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
  green:   'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  blue:    'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  purple:  'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}

const SELECTED: Record<TagHue, string> = {
  red:     'bg-red-700 text-white',
  orange:  'bg-orange-700 text-white',
  yellow:  'bg-yellow-700 text-white',
  green:   'bg-green-700 text-white',
  blue:    'bg-blue-700 text-white',
  purple:  'bg-purple-700 text-white',
  fuchsia: 'bg-fuchsia-700 text-white',
  emerald: 'bg-emerald-700 text-white',
}

const DOT: Record<TagHue, string> = {
  red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500', green: 'bg-green-500',
  blue: 'bg-blue-500', purple: 'bg-purple-500', fuchsia: 'bg-fuchsia-500', emerald: 'bg-emerald-500',
}

/** 标签胶囊（承载文字），明暗两态均达 AA */
export function tagChipClass(color?: string | null): string { return CHIP[tagHue(color)] }

/** 标签选中态（白字），8 个色相均达 AA */
export function tagSelectedClass(color?: string | null): string { return SELECTED[tagHue(color)] }

/** 纯色点／指示条，不承载文字，可用饱和色 */
export function tagDotClass(color?: string | null): string { return DOT[tagHue(color)] }

/**
 * 为新标签取色。仍返回十六进制以保持存储格式不变。
 * 优先挑还没被用过的色相，8 个用尽后再随机 —— 避免新标签和已有标签同色难以区分。
 */
export function pickTagColor(existingColors: readonly (string | null | undefined)[] = []): string {
  const used = new Set(existingColors.map(c => tagHue(c)))
  const free = TAG_HUES.filter(h => !used.has(h))
  const pool = free.length ? free : TAG_HUES
  return TAG_HEX[pool[Math.floor(Math.random() * pool.length)]]
}
