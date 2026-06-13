#!/usr/bin/env node
// gen-themes.js
// Faithful port of all 13 ACKS Reader themes to DeepSeek Notes CSS.
// Run: node scripts/gen-themes.js > src/assets/markdown-themes/index.css

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@400;500;600;700&family=Ma+Shan+Zheng&family=Archivo:wght@500;700;900&family=Anton&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&display=swap');`

// struct() maps ACKS struct(c) to standard HTML selectors scoped under prefix p
function struct(p, c) {
  return `
${p} a{color:${c.accent};text-decoration:none;border-bottom:1px solid ${c.accent}55;}
${p} a:hover{border-bottom-color:${c.accent};}
${p} hr{border:none;height:1px;background:${c.rule};margin:2em 0;}
${p} img{display:block;margin:1.4em 0;max-width:100%;}
${p} ul,${p} ol{padding-left:1.4em;margin:.9em 0;}
${p} li{margin:.38em 0;}
${p} :not(pre)>code{font-family:'JetBrains Mono',monospace;font-size:.86em;background:${c.inlineBg};color:${c.inlineFg};padding:.12em .4em;border-radius:4px;border:1px solid ${c.border}66;}
${p} pre{background:${c.codeBg};color:${c.codeFg};border:1px solid ${c.codeBorder};border-radius:8px;margin:1.3em 0;overflow:hidden;}
${p} pre::before{content:'● ● ●';display:block;padding:8px 14px;background:${c.codeBar};color:${c.muted}66;border-bottom:1px solid ${c.codeBorder};font-size:10px;letter-spacing:4px;font-family:'JetBrains Mono',monospace;}
${p} pre code{display:block;padding:16px;overflow-x:auto;font-size:.84em;line-height:1.65;white-space:pre;background:transparent!important;border:none!important;}
${p} table{border-collapse:collapse;width:100%;font-size:.9em;margin:1.3em 0;border:1px solid ${c.border};}
${p} th{background:${c.headBg};color:${c.headFg};font-weight:600;text-align:left;padding:.7em 1em;border-bottom:1px solid ${c.border};white-space:nowrap;}
${p} td{padding:.62em 1em;border-bottom:1px solid ${c.rule};}
${p} tr:last-child td{border-bottom:none;}
${p} tbody tr:nth-child(even){background:${c.zebra};}`.trim()
}

// ── Theme definitions ─────────────────────────────────────────────
const THEMES = [
  // ─── 1. clean ────────────────────────────────────────────────────
  {
    id: 'clean', name: '清隽阅读',
    light: {
      base: `font-size:18px;background:#FBFAF8;color:#2a2722;font-family:'Lora',Georgia,serif;line-height:1.78;`,
      h: `font-family:'Source Serif 4','Lora',serif;color:#23211d;line-height:1.25;letter-spacing:-.01em;`,
      h1: `font-size:2.05em;font-weight:600;margin:0 0 .6em;`,
      h2: `font-size:1.5em;font-weight:600;margin:1.7em 0 .5em;`,
      h3: `font-size:1.2em;font-weight:600;margin:1.4em 0 .4em;`,
      h4: `font-size:1em;font-weight:600;margin:1.2em 0 .35em;`,
      p: `margin:1.05em 0;`,
      quote: `font-family:'Lora',serif;font-style:italic;color:#9b9483;border-left:2px solid #C2613A;padding-left:1.1em;margin:1.4em 0;`,
      sc: {accent:'#C2613A',rule:'#ece7dc',border:'#e0dacd',muted:'#9b9483',headBg:'#f3efe5',headFg:'#23211d',zebra:'#f6f2ea',inlineBg:'#f0ebe0',inlineFg:'#9a4d27',codeBg:'#f5f1e8',codeFg:'#3a372f',codeBorder:'#e6e0d3',codeBar:'#efe9dc'},
    },
    dark: {
      base: `background:#16140f;color:#d9d4c8;`,
      h: `color:#f1ede3;`,
      quote: `color:#8a8475;border-left-color:#E08A4E;`,
      sc: {accent:'#E08A4E',rule:'#2a2720',border:'#33302a',muted:'#8a8475',headBg:'#1d1a14',headFg:'#f1ede3',zebra:'#1a1812',inlineBg:'#221f18',inlineFg:'#e0b48a',codeBg:'#100f0b',codeFg:'#cfc9bb',codeBorder:'#2a2720',codeBar:'#16140f'},
    },
  },

  // ─── 2. business ─────────────────────────────────────────────────
  {
    id: 'business', name: '商务报告',
    light: {
      base: `font-size:16px;background:#FFFFFF;color:#27313f;font-family:'Inter','Noto Sans SC',sans-serif;line-height:1.62;`,
      h: `font-family:'Inter',sans-serif;color:#0f1c2e;letter-spacing:-.015em;`,
      h1: `font-size:1.9em;font-weight:700;margin:0 0 .3em;padding-bottom:.4em;border-bottom:2px solid #1F5FA8;`,
      h2: `font-size:1.32em;font-weight:700;margin:1.7em 0 .5em;padding-left:.5em;border-left:4px solid #1F5FA8;`,
      h3: `font-size:1.08em;font-weight:600;margin:1.3em 0 .4em;color:#1F5FA8;`,
      h4: `font-size:1em;font-weight:600;margin:1.1em 0 .35em;color:#3A5270;`,
      p: `margin:.85em 0;`,
      quote: `background:#f4f7fb;border-left:3px solid #1F5FA8;padding:.8em 1.1em;margin:1.2em 0;color:#6b7480;font-size:.96em;border-radius:0 6px 6px 0;`,
      sc: {accent:'#1F5FA8',rule:'#eef1f5',border:'#dfe5ec',muted:'#6b7480',headBg:'#f1f5fa',headFg:'#0f1c2e',zebra:'#f8fafc',inlineBg:'#eef3f9',inlineFg:'#1c4f87',codeBg:'#0a0e13',codeFg:'#c4cdd9',codeBorder:'#222c38',codeBar:'#0d141c'},
    },
    dark: {
      base: `background:#0d1117;color:#c4cdd9;`,
      h: `color:#eef2f7;`,
      h1extra: `border-bottom-color:#4d8fd6;`,
      h2extra: `border-left-color:#4d8fd6;`,
      h3extra: `color:#4d8fd6;`,
      h4extra: `color:#7AAED5;`,
      quote: `background:#141c27;border-left-color:#4d8fd6;color:#7d8694;`,
      sc: {accent:'#4d8fd6',rule:'#222c38',border:'#283442',muted:'#7d8694',headBg:'#16202c',headFg:'#eef2f7',zebra:'#11181f',inlineBg:'#1a2330',inlineFg:'#7fb0e0',codeBg:'#0a0e13',codeFg:'#c4cdd9',codeBorder:'#222c38',codeBar:'#0d141c'},
    },
  },

  // ─── 3. technical ────────────────────────────────────────────────
  {
    id: 'technical', name: '技术文档',
    light: {
      base: `font-size:15.5px;background:#FFFFFF;color:#2b3640;font-family:'Inter','Noto Sans SC',sans-serif;line-height:1.65;`,
      h: `font-family:'Space Grotesk',sans-serif;color:#16202b;letter-spacing:-.01em;`,
      h1: `font-size:1.85em;font-weight:700;margin:0 0 .5em;`,
      h2: `font-size:1.3em;font-weight:600;margin:1.8em 0 .5em;padding-bottom:.3em;border-bottom:1px solid #e8ecf1;`,
      h2before: `content:'#';color:#0E9F6E;margin-right:.4em;font-weight:500;`,
      h3: `font-size:1.06em;font-weight:600;margin:1.3em 0 .4em;`,
      h4: `font-size:.95em;font-weight:600;margin:1.1em 0 .35em;color:#4B5563;`,
      p: `margin:.8em 0;`,
      quote: `border-left:3px solid #0E9F6E;padding:.2em 0 .2em 1em;margin:1.1em 0;color:#737d87;`,
      sc: {accent:'#0E9F6E',rule:'#eef1f4',border:'#e1e6eb',muted:'#737d87',headBg:'#f4f6f8',headFg:'#16202b',zebra:'#f9fafb',inlineBg:'#eafaf3',inlineFg:'#0a7a54',codeBg:'#0a0d12',codeFg:'#cdd6e0',codeBorder:'#1f262e',codeBar:'#0d1117'},
    },
    dark: {
      base: `background:#0e1116;color:#bcc6d1;`,
      h: `color:#eef3f8;`,
      h2extra: `border-bottom-color:#21262D;`,
      h2beforeextra: `color:#3DD68C;`,
      h4extra: `color:#8B949E;`,
      quote: `border-left-color:#3DD68C;color:#79838f;`,
      sc: {accent:'#2BD4A0',rule:'#1d242c',border:'#262f38',muted:'#79838f',headBg:'#151a21',headFg:'#eef3f8',zebra:'#11151a',inlineBg:'#16201c',inlineFg:'#3ddaa6',codeBg:'#0a0d12',codeFg:'#cdd6e0',codeBorder:'#1f262e',codeBar:'#0d1117'},
    },
  },

  // ─── 4. darkcode ─────────────────────────────────────────────────
  {
    id: 'darkcode', name: '暗夜代码',
    darkOnly: true,
    light: {
      base: `font-size:15px;background:#0b0d12;color:#c2cdda;font-family:'Inter','Noto Sans SC',sans-serif;line-height:1.7;`,
      h: `font-family:'JetBrains Mono',monospace;color:#eef2f7;letter-spacing:-.01em;`,
      h1: `font-size:1.7em;font-weight:700;margin:0 0 .5em;`,
      h1before: `content:'> ';color:#F97316;`,
      h2: `font-size:1.25em;font-weight:600;margin:1.7em 0 .5em;color:#9bd4ff;`,
      h3: `font-size:1.05em;font-weight:600;margin:1.3em 0 .4em;color:#c792ea;`,
      h4: `font-size:.95em;font-weight:600;margin:1.1em 0 .35em;color:#a6d0f5;`,
      p: `margin:.85em 0;`,
      quote: `border-left:3px solid #F97316;background:#11141b;padding:.7em 1em;margin:1.2em 0;color:#9aa6b4;border-radius:0 6px 6px 0;`,
      sc: {accent:'#F97316',rule:'#1a1f29',border:'#222936',muted:'#6b7686',headBg:'#13171f',headFg:'#dde6f0',zebra:'#0f131a',inlineBg:'#1a1410',inlineFg:'#ffb27a',codeBg:'#070910',codeFg:'#d6e1f0',codeBorder:'#1c2330',codeBar:'#0d1018'},
    },
  },

  // ─── 5. social ───────────────────────────────────────────────────
  {
    id: 'social', name: '社交长图',
    light: {
      base: `font-size:18px;background:#FFF7F0;color:#3a2c1f;font-family:'Noto Sans SC','DM Sans',sans-serif;line-height:1.85;`,
      h: `font-family:'Noto Sans SC','Space Grotesk',sans-serif;color:#2a1a0f;`,
      h1: `font-size:2.2em;font-weight:700;margin:0 0 .5em;line-height:1.2;background:linear-gradient(100deg,#F26419,#FFB23D);-webkit-background-clip:text;background-clip:text;color:transparent;`,
      h2: `font-size:1.45em;font-weight:700;margin:1.6em 0 .5em;display:inline-block;`,
      h2after: `content:'';display:block;width:2.2em;height:5px;border-radius:3px;background:#F26419;margin-top:.3em;`,
      h3: `font-size:1.15em;font-weight:600;margin:1.3em 0 .4em;color:#F26419;`,
      h4: `font-size:1em;font-weight:600;margin:1.1em 0 .35em;`,
      p: `margin:1em 0;`,
      quote: `background:#fff0e2;border:none;border-radius:14px;padding:1.1em 1.3em;margin:1.4em 0;color:#2a1a0f;font-weight:500;`,
      sc: {accent:'#F26419',rule:'#f3e3d2',border:'#f0ddc8',muted:'#8a7560',headBg:'#ffeada',headFg:'#2a1a0f',zebra:'#fffaf4',inlineBg:'#ffe6d2',inlineFg:'#c44e12',codeBg:'#fff3e9',codeFg:'#4a3826',codeBorder:'#f2e0cd',codeBar:'#ffeee0'},
    },
    dark: {
      base: `background:#1a1208;color:#e7d9c8;`,
      h: `color:#fff3e6;`,
      h1extra: `background:linear-gradient(100deg,#FF8A3D,#FFD07A);-webkit-background-clip:text;background-clip:text;color:transparent;`,
      h2afterextra: `background:#FF8A3D;`,
      h3extra: `color:#FF8A3D;`,
      quote: `background:#221708;color:#fff3e6;`,
      sc: {accent:'#FF8A3D',rule:'#2c2010',border:'#352713',muted:'#a8967f',headBg:'#241809',headFg:'#fff3e6',zebra:'#1e1509',inlineBg:'#2a1c0c',inlineFg:'#ffac6e',codeBg:'#120c05',codeFg:'#e7d9c8',codeBorder:'#2c2010',codeBar:'#1a1208'},
    },
  },

  // ─── 6. academic ─────────────────────────────────────────────────
  {
    id: 'academic', name: '学术论文',
    lightOnly: true,
    light: {
      base: `font-size:17px;background:#FCFCFA;color:#222;font-family:'EB Garamond',Georgia,serif;line-height:1.7;`,
      h: `font-family:'EB Garamond',serif;color:#1a1a1a;`,
      h1: `font-size:1.95em;font-weight:600;text-align:center;margin:0 0 .8em;line-height:1.3;`,
      h2: `font-size:1.3em;font-weight:600;margin:1.7em 0 .4em;`,
      h3: `font-size:1.1em;font-weight:600;font-style:italic;margin:1.3em 0 .3em;`,
      h4: `font-size:1em;font-weight:600;margin:1.1em 0 .3em;`,
      p: `margin:.6em 0;text-align:justify;text-indent:1.6em;`,
      pFirstAfterH: true,
      quote: `font-size:.95em;color:#555;margin:1.2em 2em;border-left:2px solid #ccc;padding-left:1em;font-style:italic;`,
      sc: {accent:'#7A1F2B',rule:'#ececec',border:'#dcdcd6',muted:'#777',headBg:'#f4f3ef',headFg:'#1a1a1a',zebra:'#f9f9f6',inlineBg:'#f2f0eb',inlineFg:'#6a1a24',codeBg:'#f7f6f2',codeFg:'#333',codeBorder:'#e6e4dd',codeBar:'#f0eee8'},
    },
  },

  // ─── 7. wechat ───────────────────────────────────────────────────
  {
    id: 'wechat', name: '公众号文章',
    light: {
      base: `font-size:16.5px;background:#FFFFFF;color:#3f3f3f;font-family:'Noto Sans SC',sans-serif;line-height:1.9;letter-spacing:.01em;`,
      h: `font-family:'Noto Sans SC',sans-serif;color:#2c2c2c;text-align:center;`,
      h1: `font-size:1.55em;font-weight:700;margin:0 0 1em;`,
      h2: `font-size:1.22em;font-weight:600;margin:1.8em 0 .7em;display:flex;align-items:center;gap:.5em;text-align:left;`,
      h2before: `content:'';display:inline-block;flex-shrink:0;width:.5em;height:1em;background:#07A35A;border-radius:2px;vertical-align:-.12em;`,
      h3: `font-size:1.05em;font-weight:600;margin:1.3em 0 .4em;text-align:left;color:#07A35A;`,
      h4: `font-size:1em;font-weight:600;margin:1.1em 0 .35em;text-align:left;`,
      p: `margin:1.1em 0;`,
      quote: `background:#f7f7f7;border-left:3px solid #07A35A;padding:.8em 1em;margin:1.3em 0;color:#999;font-size:.94em;border-radius:0 6px 6px 0;`,
      sc: {accent:'#07A35A',rule:'#f0f0f0',border:'#e6e6e6',muted:'#999',headBg:'#f5f5f5',headFg:'#2c2c2c',zebra:'#fafafa',inlineBg:'#eafaf1',inlineFg:'#06864a',codeBg:'#f8f8f8',codeFg:'#3a3a3a',codeBorder:'#ededed',codeBar:'#f2f2f2'},
    },
    dark: {
      base: `background:#1a1a1a;color:#c9c9c9;`,
      h: `color:#f0f0f0;`,
      h2beforeextra: `background:#2BCB7E;`,
      h3extra: `color:#2BCB7E;`,
      quote: `background:#141414;border-left-color:#2BCB7E;color:#888;`,
      sc: {accent:'#2BCB7E',rule:'#262626',border:'#2e2e2e',muted:'#888',headBg:'#202020',headFg:'#f0f0f0',zebra:'#1d1d1d',inlineBg:'#172017',inlineFg:'#4cd494',codeBg:'#121212',codeFg:'#c9c9c9',codeBorder:'#262626',codeBar:'#1a1a1a'},
    },
  },

  // ─── 8. magazine ─────────────────────────────────────────────────
  {
    id: 'magazine', name: '杂志随笔',
    light: {
      base: `font-size:18px;background:#F7F4EF;color:#2c2823;font-family:'Lora',Georgia,serif;line-height:1.72;`,
      h: `font-family:'Playfair Display',serif;color:#1c1a17;`,
      h1: `font-size:2.6em;font-weight:900;line-height:1.08;margin:0 0 .5em;letter-spacing:-.01em;`,
      h2: `font-size:1.55em;font-weight:700;margin:1.7em 0 .4em;`,
      h3: `font-size:1.18em;font-weight:600;font-style:italic;margin:1.3em 0 .3em;`,
      h4: `font-size:.95em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:1.2em 0 .35em;`,
      p: `margin:1em 0;`,
      dropCap: true,
      quote: `font-family:'Playfair Display',serif;font-style:italic;font-size:1.45em;line-height:1.4;color:#1c1a17;border:none;border-top:2px solid #B33A2B;border-bottom:2px solid #B33A2B;padding:.7em 0;margin:1.6em 0;text-align:center;background:transparent;`,
      sc: {accent:'#B33A2B',rule:'#e9e3d6',border:'#e2dccc',muted:'#8a8475',headBg:'#efe9da',headFg:'#1c1a17',zebra:'#f3efe6',inlineBg:'#efe7d6',inlineFg:'#9c3023',codeBg:'#f2eee4',codeFg:'#3a352c',codeBorder:'#e6e0d0',codeBar:'#ece6da'},
    },
    dark: {
      base: `background:#17150f;color:#d8d2c4;`,
      h: `color:#f3eee2;`,
      quote: `border-top-color:#D9604E;border-bottom-color:#D9604E;color:#e6e0d4;`,
      sc: {accent:'#D9604E',rule:'#2a2619',border:'#322d1f',muted:'#9a9384',headBg:'#211d13',headFg:'#f3eee2',zebra:'#1c1810',inlineBg:'#251f12',inlineFg:'#e0826f',codeBg:'#100e09',codeFg:'#d8d2c4',codeBorder:'#2a2619',codeBar:'#17150f'},
    },
  },

  // ─── 9. aireport ─────────────────────────────────────────────────
  {
    id: 'aireport', name: 'AI 报告',
    light: {
      base: `font-size:16px;background:#FAFAFF;color:#2a2d42;font-family:'Space Grotesk','Noto Sans SC',sans-serif;line-height:1.68;`,
      h: `font-family:'Space Grotesk',sans-serif;color:#16182a;letter-spacing:-.02em;`,
      h1: `font-size:2em;font-weight:700;margin:0 0 .5em;background:linear-gradient(100deg,#6D4DFF,#2BA8C4);-webkit-background-clip:text;background-clip:text;color:transparent;`,
      h2: `font-size:1.32em;font-weight:600;margin:1.7em 0 .5em;display:flex;align-items:center;gap:.55em;`,
      h2before: `content:'';display:inline-block;flex-shrink:0;width:.65em;height:.65em;border-radius:3px;background:linear-gradient(135deg,#6D4DFF,#2BA8C4);vertical-align:.02em;`,
      h3: `font-size:1.08em;font-weight:600;margin:1.3em 0 .4em;color:#5B3FCC;`,
      h4: `font-size:.95em;font-weight:600;margin:1.1em 0 .35em;color:#4A5090;`,
      p: `margin:.85em 0;`,
      quote: `background:#f1f0ff;border:1px solid #e2e0ff;border-left:3px solid #6D4DFF;padding:.8em 1.1em;margin:1.2em 0;border-radius:0 8px 8px 0;color:#6e7390;`,
      sc: {accent:'#6D4DFF',rule:'#ecebf7',border:'#e0def2',muted:'#6e7390',headBg:'#f2f1fb',headFg:'#16182a',zebra:'#f8f8fe',inlineBg:'#efedff',inlineFg:'#5a3ee0',codeBg:'#f6f5fc',codeFg:'#2c2f44',codeBorder:'#e6e4f4',codeBar:'#efeefa'},
    },
    dark: {
      base: `background:#0c0e1a;color:#c2c8de;`,
      h: `color:#f0f1fa;`,
      h1extra: `background:linear-gradient(100deg,#7C5CFF,#4DD0E1);-webkit-background-clip:text;background-clip:text;color:transparent;`,
      h2beforeextra: `background:linear-gradient(135deg,#7C5CFF,#4DD0E1);`,
      h3extra: `color:#9D6FFF;`,
      h4extra: `color:#6878C0;`,
      quote: `background:linear-gradient(135deg,#13152a,#10131f);border-color:#23264a;border-left-color:#7C5CFF;color:#7a809a;`,
      sc: {accent:'#7C5CFF',rule:'#1c1f38',border:'#262a48',muted:'#7a809a',headBg:'#14172c',headFg:'#f0f1fa',zebra:'#0f1124',inlineBg:'#1a1c38',inlineFg:'#a896ff',codeBg:'#080a14',codeFg:'#c2c8de',codeBorder:'#1e2240',codeBar:'#0d0f1d'},
    },
  },

  // ─── 10. euro ────────────────────────────────────────────────────
  {
    id: 'euro', name: '欧式古典',
    light: {
      base: `font-size:18px;background:#F6F1E7;color:#2f2a1d;font-family:'Cormorant Garamond','EB Garamond',serif;line-height:1.74;`,
      h: `font-family:'Playfair Display',serif;color:#2b2417;text-align:center;`,
      h1: `font-size:2.5em;font-weight:700;margin:.2em 0 .1em;letter-spacing:.01em;`,
      h1after: `content:'❧';display:block;color:#9C7A3C;font-size:.5em;margin:.3em 0 .6em;font-weight:400;`,
      h2: `font-size:1.6em;font-weight:600;margin:1.6em 0 .4em;font-variant:small-caps;letter-spacing:.04em;`,
      h3: `font-size:1.25em;font-weight:600;font-style:italic;margin:1.3em 0 .3em;`,
      h4: `font-size:1.05em;font-weight:600;margin:1.1em 0 .3em;`,
      p: `margin:.85em 0;`,
      quote: `font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.3em;text-align:center;color:#9C7A3C;border:none;margin:1.5em 2em;line-height:1.5;`,
      quoteBefore: `content:'"';font-size:1.4em;vertical-align:-.3em;`,
      quoteAfter: `content:'"';font-size:1.4em;vertical-align:-.5em;`,
      sc: {accent:'#9C7A3C',rule:'#e6dcc4',border:'#ddd0b2',muted:'#867b60',headBg:'#ede3cc',headFg:'#2b2417',zebra:'#f1ebdc',inlineBg:'#ece1c8',inlineFg:'#876225',codeBg:'#f0ead9',codeFg:'#3a342a',codeBorder:'#e2d8c0',codeBar:'#e9e1cf'},
    },
    dark: {
      base: `background:#171309;color:#ddd3bd;`,
      h: `color:#f2ead6;`,
      h1afterextra: `color:#C9A85E;`,
      h2extra: ``,
      quote: `color:#C9A85E;`,
      sc: {accent:'#C9A85E',rule:'#2c2614',border:'#352d18',muted:'#9b9077',headBg:'#221c0e',headFg:'#f2ead6',zebra:'#1c1709',inlineBg:'#26200f',inlineFg:'#d3b06a',codeBg:'#100d06',codeFg:'#ddd3bd',codeBorder:'#2c2614',codeBar:'#171309'},
    },
  },

  // ─── 11. cnclassic ───────────────────────────────────────────────
  {
    id: 'cnclassic', name: '中式古典',
    light: {
      base: `font-size:18px;background:#F3ECE0;color:#3a3026;font-family:'Noto Serif SC','Songti SC',serif;line-height:1.95;`,
      h: `font-family:'Ma Shan Zheng','Noto Serif SC',serif;color:#2a211a;letter-spacing:.05em;`,
      h1: `font-size:2.3em;font-weight:400;text-align:center;margin:.3em 0 .6em;letter-spacing:.08em;`,
      h1after: `content:'';display:block;width:3em;height:3px;background:#9E2B25;margin:.4em auto 0;`,
      h2: `font-size:1.5em;font-weight:600;font-family:'Noto Serif SC',serif;margin:1.7em 0 .5em;padding-left:.6em;border-left:5px double #9E2B25;letter-spacing:.05em;`,
      h3: `font-size:1.18em;font-weight:600;margin:1.3em 0 .4em;color:#9E2B25;letter-spacing:.04em;`,
      h4: `font-size:1em;font-weight:600;margin:1.1em 0 .35em;`,
      p: `margin:1em 0;text-indent:2em;letter-spacing:.03em;`,
      pNoIndent: `h1+p,h2+p,h3+p`,
      quote: `font-family:'Noto Serif SC',serif;color:#6A4030;border:none;border-left:3px solid #9E2B25;padding:.4em 1.2em;margin:1.4em 0;background:#E6DECA;border-radius:0 4px 4px 0;font-style:italic;`,
      sc: {accent:'#9E2B25',rule:'#e4d8c5',border:'#dccfb9',muted:'#857a66',headBg:'#ebe0cd',headFg:'#2a211a',zebra:'#efe6d7',inlineBg:'#ecdfca',inlineFg:'#8a201b',codeBg:'#eee3d1',codeFg:'#3a322a',codeBorder:'#e0d4bf',codeBar:'#e7dcc9'},
    },
    dark: {
      base: `background:#16110d;color:#d8cdb9;`,
      h: `color:#efe4d2;`,
      h1afterextra: `background:#C8463F;`,
      h2extra: `border-left-color:#C8463F;`,
      h3extra: `color:#C8463F;`,
      quote: `background:#1c1610;border-left-color:#C8463F;color:#988c78;`,
      sc: {accent:'#C8463F',rule:'#28201a',border:'#312820',muted:'#988c78',headBg:'#1f1812',headFg:'#efe4d2',zebra:'#1a140f',inlineBg:'#241a14',inlineFg:'#d96058',codeBg:'#100c08',codeFg:'#d8cdb9',codeBorder:'#28201a',codeBar:'#16110d'},
    },
  },

  // ─── 12. cnvertical ──────────────────────────────────────────────
  {
    id: 'cnvertical', name: '中式竖排',
    vertical: true,
    light: {
      base: `font-size:19px;background:#EFE7D6;color:#2c241a;font-family:'Noto Serif SC',serif;`,
      vertical: true,
      h: `font-family:'Ma Shan Zheng','Noto Serif SC',serif;color:#241c12;`,
      h1: `font-size:2em;font-weight:400;margin:0 0 0 .4em;letter-spacing:.18em;border-right:3px solid #8C2820;padding-right:.3em;`,
      h2: `font-size:1.4em;font-weight:600;margin:0 0 0 .3em;color:#8C2820;letter-spacing:.1em;`,
      h3: `font-size:1.15em;font-weight:600;margin:0 0 0 .2em;`,
      h4: `font-size:1em;font-weight:600;margin:0 0 0 .15em;`,
      p: `margin:0 0 0 .2em;text-orientation:upright;`,
      quote: `border:none;border-right:3px solid #8C2820;padding:0 .4em 0 0;margin:0 .3em 0 0;color:#7d7159;`,
      sc: {accent:'#8C2820',rule:'#e0d3bc',border:'#d6c8af',muted:'#7d7159',headBg:'#e7dbc6',headFg:'#241c12',zebra:'#ebe1cf',inlineBg:'#e8dac3',inlineFg:'#7d201a',codeBg:'#eadfca',codeFg:'#352c22',codeBorder:'#dccfb6',codeBar:'#e3d8c2'},
    },
    dark: {
      base: `background:#15110b;color:#ddd1b9;`,
      h: `color:#efe3cd;`,
      h1extra: `border-right-color:#C2453B;`,
      h2extra: `color:#C2453B;`,
      quote: `border-right-color:#C2453B;color:#988b74;`,
      sc: {accent:'#C2453B',rule:'#271f15',border:'#302619',muted:'#988b74',headBg:'#1e1710',headFg:'#efe3cd',zebra:'#191309',inlineBg:'#231910',inlineFg:'#d35a50',codeBg:'#100b07',codeFg:'#ddd1b9',codeBorder:'#271f15',codeBar:'#15110b'},
    },
  },

  // ─── 13. poster ──────────────────────────────────────────────────
  {
    id: 'poster', name: '前卫海报',
    light: {
      base: `font-size:16px;background:#F2F000;color:#0a0a0a;font-family:'Archivo','Noto Sans SC',sans-serif;line-height:1.55;`,
      h: `font-family:'Anton','Archivo',sans-serif;color:#0a0a0a;text-transform:uppercase;line-height:1.0;`,
      h1: `font-size:3.4em;font-weight:400;margin:0 0 .5em;padding-bottom:.08em;letter-spacing:-.01em;`,
      h2: `font-size:1.9em;font-weight:400;margin:1.3em 0 .3em;background:#FF2D00;color:#F2F000;display:inline-block;padding:.05em .3em;transform:rotate(-1deg);`,
      h3: `font-size:1.25em;font-weight:900;font-family:'Archivo',sans-serif;margin:1.2em 0 .3em;text-decoration:underline;text-decoration-color:#FF2D00;text-decoration-thickness:3px;`,
      h4: `font-size:1em;font-weight:900;margin:1em 0 .3em;`,
      p: `margin:.8em 0;font-weight:500;`,
      quote: `font-family:'Anton',sans-serif;text-transform:uppercase;font-size:1.7em;line-height:1.05;border:none;border-top:4px solid #FF2D00;border-bottom:4px solid #FF2D00;padding:.4em 0;margin:1.4em 0;color:#FF2D00;background:transparent;`,
      sc: {accent:'#FF2D00',rule:'#0a0a0a44',border:'#0a0a0a',muted:'#444',headBg:'#0a0a0a',headFg:'#F2F000',zebra:'#f2f00022',inlineBg:'#0a0a0a',inlineFg:'#F2F000',codeBg:'#0a0a0a',codeFg:'#F2F000',codeBorder:'#0a0a0a',codeBar:'#0a0a0a'},
    },
    dark: {
      base: `background:#0a0a0a;color:#f0f0f0;`,
      h: `color:#ffffff;`,
      h2extra: `background:#FF4D00;color:#0a0a0a;`,
      h3extra: `text-decoration-color:#FF4D00;`,
      quote: `border-top-color:#FF4D00;border-bottom-color:#FF4D00;color:#FF4D00;`,
      sc: {accent:'#FF4D00',rule:'#222',border:'#2a2a2a',muted:'#888',headBg:'#161616',headFg:'#fff',zebra:'#111',inlineBg:'#1a1a1a',inlineFg:'#FF6A33',codeBg:'#050505',codeFg:'#f0f0f0',codeBorder:'#2a2a2a',codeBar:'#141414'},
    },
  },
]

// ── CSS generation ────────────────────────────────────────────────

function buildTheme(t) {
  const p = `.md-preview.theme-${t.id}`
  const dp = `.dark .md-preview.theme-${t.id}`
  const L = t.light
  const D = t.dark

  let out = `\n\n/* ${'═'.repeat(60)}\n   THEME · ${t.name} (${t.id})${t.darkOnly ? ' — 暗色专属' : t.lightOnly ? ' — 亮色专属' : ''}\n${'═'.repeat(60)} */\n`

  // ── Light base ──
  out += `${p} {\n  ${L.base}\n}\n`

  // ── Vertical writing mode ──
  if (t.vertical) {
    out += `${p} {\n  writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; text-orientation: upright;\n  line-height: 2.2; letter-spacing: .12em; padding: 8px 4px;\n}\n`
  }

  // ── Shared heading ──
  if (L.h) {
    out += `${p} h1,${p} h2,${p} h3,${p} h4 { ${L.h} }\n`
  }

  // ── Individual headings ──
  ;['h1','h2','h3','h4'].forEach(tag => {
    if (L[tag]) out += `${p} ${tag} { ${L[tag]} }\n`
    if (L[`${tag}before`]) out += `${p} ${tag}::before { ${L[`${tag}before`]} }\n`
    if (L[`${tag}after`]) out += `${p} ${tag}::after { ${L[`${tag}after`]} }\n`
  })

  // ── Paragraph ──
  if (L.p) out += `${p} p { ${L.p} }\n`
  // academic: no indent after headings
  if (L.pFirstAfterH) out += `${p} h1+p,${p} h2+p,${p} h3+p { text-indent:0; }\n`
  // cnclassic: no indent after headings
  if (L.pNoIndent) out += `${p} h1+p,${p} h2+p,${p} h3+p { text-indent:0; }\n`

  // ── Blockquote ──
  if (L.quote) {
    out += `${p} blockquote { ${L.quote} }\n`
    out += `${p} blockquote p { margin:0; }\n`
    out += `${p} blockquote p+p { margin-top:.6em; }\n`
    if (L.quoteBefore) out += `${p} blockquote::before { ${L.quoteBefore} }\n`
    if (L.quoteAfter) out += `${p} blockquote::after { ${L.quoteAfter} }\n`
  }

  // ── Drop cap (magazine) ──
  if (L.dropCap) {
    out += `${p} h1+p::first-letter { font-family:'Playfair Display',Georgia,serif; font-size:3.1em; font-weight:900; float:left; line-height:.82; margin:.05em .12em 0 0; color:#B33A2B; }\n`
  }

  // ── Struct ──
  out += struct(p, L.sc) + '\n'

  if (t.darkOnly || t.lightOnly) return out

  // ── Dark base ──
  out += `${dp} { ${D.base} }\n`

  // ── Dark heading overrides ──
  if (D.h) out += `${dp} h1,${dp} h2,${dp} h3,${dp} h4 { ${D.h} }\n`
  if (D.h1extra) out += `${dp} h1 { ${D.h1extra} }\n`
  if (D.h2extra) out += `${dp} h2 { ${D.h2extra} }\n`
  if (D.h3extra) out += `${dp} h3 { ${D.h3extra} }\n`
  if (D.h4extra) out += `${dp} h4 { ${D.h4extra} }\n`
  if (D.h1beforeextra) out += `${dp} h1::before { ${D.h1beforeextra} }\n`
  if (D.h2beforeextra) out += `${dp} h2::before { ${D.h2beforeextra} }\n`
  if (D.h1afterextra) out += `${dp} h1::after { ${D.h1afterextra} }\n`
  if (D.h2afterextra) out += `${dp} h2::after { ${D.h2afterextra} }\n`

  // ── Dark blockquote ──
  if (D.quote) out += `${dp} blockquote { ${D.quote} }\n`

  // ── Dark drop cap ──
  if (L.dropCap && D.sc) {
    out += `${dp} h1+p::first-letter { color:${D.sc.accent}; }\n`
  }

  // ── Dark struct ──
  out += struct(dp, D.sc) + '\n'

  return out
}

// ── Shared preamble ───────────────────────────────────────────────
const SHARED = `
/* ══════════════════════════════════════════════════════════════════
   Google Fonts — graceful offline fallback
══════════════════════════════════════════════════════════════════ */
${FONTS}

/* ══════════════════════════════════════════════════════════════════
   Shared structural resets (scoped to .md-preview)
══════════════════════════════════════════════════════════════════ */
.md-preview { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; word-break: break-word; overflow-wrap: break-word; }
.md-preview * { box-sizing: border-box; }
.md-preview img { max-width: 100%; height: auto; display: block; }
.md-preview pre { overflow: hidden; }
.md-preview pre code { font-family: 'JetBrains Mono','Fira Code',Consolas,monospace!important; background: transparent!important; border: none!important; padding: 1em 1.2em; display: block; font-size: .84em; line-height: 1.7; white-space: pre; overflow-x: auto; }
.md-preview :not(pre)>code { font-family: 'JetBrains Mono','Fira Code',Consolas,monospace; }
.md-preview table { border-collapse: collapse; width: 100%; }
.md-preview blockquote p { margin: 0; }
.md-preview blockquote p+p { margin-top: .6em; }
`.trim()

// ── Output ────────────────────────────────────────────────────────
let output = SHARED
THEMES.forEach(t => { output += buildTheme(t) })
process.stdout.write(output + '\n')
