/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{vue,js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      // 语义色 token —— 见 docs/DESIGN_SPEC.md §3、src/assets/tokens.css
      // 深色模式由 .dark 下的变量重映射自动生效，使用这些颜色时不需要 dark: 前缀
      colors: {
        canvas:   'rgb(var(--c-canvas) / <alpha-value>)',
        subtle:   'rgb(var(--c-subtle) / <alpha-value>)',
        muted:    'rgb(var(--c-muted) / <alpha-value>)',
        surface:  'rgb(var(--c-surface) / <alpha-value>)',
        raised:   'rgb(var(--c-raised) / <alpha-value>)',
        line:     'rgb(var(--c-border) / <alpha-value>)',
        control:  'rgb(var(--c-border-control) / <alpha-value>)',
        ink: {
          DEFAULT:   'rgb(var(--c-text) / <alpha-value>)',
          secondary: 'rgb(var(--c-text-secondary) / <alpha-value>)',
          tertiary:  'rgb(var(--c-text-tertiary) / <alpha-value>)',
          disabled:  'rgb(var(--c-text-disabled) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          fg:      'rgb(var(--c-accent-fg) / <alpha-value>)',
        },
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        danger:  'rgb(var(--c-danger) / <alpha-value>)',
        // 交互反馈：前景色半透明叠加，自动适配所处表面与明暗模式（不支持 /opacity 修饰符）
        hover:   'var(--c-hover)',
        active:  'var(--c-active)',
      },
      fontFamily: {
        // 拉丁字体必须排在 CJK 之前：字体回退逐字形进行，
        // 若 CJK 字体在前，它会同时承担拉丁字形（Windows 上英文被 YaHei 渲染）
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC',
          'Microsoft YaHei UI', 'Microsoft YaHei', 'system-ui', 'sans-serif'
        ],
        // 仅列本机可用字体：JetBrains Mono / Fira Code 未安装也未内置
        mono: ['Cascadia Code', 'Cascadia Mono', 'Consolas', 'SF Mono', 'Menlo', 'monospace']
      },
      // 字号档不内置负字距：本应用标题以中文为主，负字距会让方块字相互侵入（见 §4.3）。
      // 拉丁文为主的展示文字如需收紧，另加 .tracking-latin 工具类。
      fontSize: {
        metric:   ['40px', { lineHeight: '1.1',  fontWeight: '600' }],  // 仅统计数字，配 tabular-nums
        display:  ['32px', { lineHeight: '1.2',  fontWeight: '600' }],
        'title-1':['24px', { lineHeight: '1.3',  fontWeight: '600' }],
        'title-2':['20px', { lineHeight: '1.35', fontWeight: '600' }],
        'title-3':['16px', { lineHeight: '1.5',  fontWeight: '600' }],
        'body-lg':['15px', { lineHeight: '1.7' }],
        body:     ['14px', { lineHeight: '1.6' }],
        'body-sm':['13px', { lineHeight: '1.55' }],
        label:    ['12px', { lineHeight: '1.4',  fontWeight: '500' }],
        caption:  ['11px', { lineHeight: '1.4' }],
        mono:     ['13px', { lineHeight: '1.5' }],
      },
      letterSpacing: {
        latin: '-0.02em',   // 只用于拉丁文为主的大字，禁止用于中文
      },
      boxShadow: {
        raised:  'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',
      },
      zIndex: {
        sticky:  '10',
        dropdown:'20',
        drawer:  '30',
        scrim:   '40',
        modal:   '50',
        confirm: '60',
        toast:   '70',
        tooltip: '80',
      },
      transitionDuration: {
        instant: '120ms',
        fast:    '180ms',
        base:    '240ms',
        exit:    '160ms',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.2, 0, 0, 1)',
        'in-soft':  'cubic-bezier(0.4, 0, 1, 1)',
      },
    }
  },
  plugins: []
}
