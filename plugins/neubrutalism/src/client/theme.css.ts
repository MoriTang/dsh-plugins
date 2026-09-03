/**
 * Neubrutalism theme stylesheet, injected at the document root by the browser
 * half. Two sections:
 *
 *  1. DESIGN TOKENS — remaps the harness design system (the `--dsw-static-*`
 *     ramps and the `--dsw-alias-*` semantic layer) to a neubrutalism palette
 *     (warm cream surfaces, ink-black borders/text, loud accent pops), for
 *     light (`body`) and dark (`body[data-ds-dark-theme]`) variants.
 *  2. STRUCTURE — square corners, hard edges and chunky focus strokes on the
 *     main controls. This is intentionally coarse and safe: components that
 *     need per-piece treatment are tuned iteratively (see the "experimental"
 *     block at the end).
 *
 * Quick tuning knobs at the top (`--neo-*`); every rule below references them.
 */

export const neubrutalismCss = String.raw`
/* ────────────────────────────────────────────────────────────
   Tuning knobs (edit here, refresh to see changes)
   ──────────────────────────────────────────────────────────── */
body {
  --neo-ink: #100c06;
  --neo-ink-soft: #4a4131;
  --neo-cream: #f6eed7;      /* app background, light */
  --neo-paper: #fffdf3;      /* cards / menus / popovers, light */
  --neo-paper-2: #faf1dd;    /* nested surfaces, light */
  --neo-line: #100c06;       /* ink borders */
  --neo-accent: #3d5bff;     /* brand / info accent (indigo pop) */
  --neo-accent-2: #ff5c8a;   /* secondary pop (pink) */
  --neo-ok: #12b76a;
  --neo-bad: #f03e2f;
  --neo-warn: #f5a623;
  --neo-dark-bg: #171209;    /* app background, dark */
  --neo-dark-card: #241c0e;
  --neo-dark-card-2: #2f2615;
  --neo-dark-ink: #f4ead2;   /* text / borders, dark */
  --neo-dark-accent: #ffe14d;/* primary pop in dark (yellow) */
  --neo-radius: 0px;
  --neo-stroke: 2px;
}

/* ────────────────────────────────────────────────────────────
   1. DESIGN TOKENS — LIGHT
   ──────────────────────────────────────────────────────────── */
body:not([data-ds-dark-theme]) {
  /* static ramps the alias layer indirets through */
  --dsw-static-neutral-bluish-00: #fffdf3;
  --dsw-static-neutral-bluish-50: #fbf4e0;
  --dsw-static-neutral-bluish-60: #f7edce;
  --dsw-static-neutral-bluish-75: #f2e5bf;
  --dsw-static-neutral-bluish-100: #ecdcab;
  --dsw-static-neutral-bluish-150: #e0cd96;
  --dsw-static-neutral-bluish-200: #cdb87f;
  --dsw-static-neutral-bluish-300: #b09b65;
  --dsw-static-neutral-bluish-400: #97834f;
  --dsw-static-neutral-bluish-500: #7d6c40;
  --dsw-static-neutral-bluish-600: #655733;
  --dsw-static-neutral-bluish-700: #514527;
  --dsw-static-neutral-bluish-750: #40371e;
  --dsw-static-neutral-bluish-800: #2f2815;
  --dsw-static-neutral-bluish-850: #251f10;
  --dsw-static-neutral-bluish-875: #1b170b;
  --dsw-static-neutral-bluish-950: #120f07;
  --dsw-static-neutral-bluish-1000: var(--neo-ink);
  --dsw-static-neutral-200: #ecdcab;
  --dsw-static-neutral-300: #b09b65;

  /* semantic aliases (direct overrides so text/borders stay legible) */
  --dsw-alias-bg-base: var(--neo-cream);
  --dsw-alias-bg-layer-1: var(--neo-paper);
  --dsw-alias-bg-layer-2: var(--neo-paper);
  --dsw-alias-bg-layer-3: var(--neo-paper);
  --dsw-alias-bg-overlay: var(--neo-paper-2);
  --dsw-alias-bg-module-platform: var(--neo-cream);
  --dsw-alias-bg-multi-select: #fff2c9;
  --dsw-alias-bg-skeleton: rgba(16, 12, 6, 0.08);

  --dsw-alias-border-l1: rgba(16, 12, 6, 0.5);
  --dsw-alias-border-l2-darkmode-thin: rgba(16, 12, 6, 0.7);
  --dsw-alias-border-l2: rgba(16, 12, 6, 0.7);
  --dsw-alias-border-l3: rgba(16, 12, 6, 0.9);
  --dsw-alias-border-l4: var(--neo-line);

  --dsw-alias-label-primary: var(--neo-ink);
  --dsw-alias-label-primary-dimmed: #2a2415;
  --dsw-alias-label-primary-bluish: var(--neo-ink);
  --dsw-alias-label-primary-foreground: var(--neo-paper);
  --dsw-alias-label-primary-inverted: var(--neo-paper);
  --dsw-alias-label-secondary: var(--neo-ink-soft);
  --dsw-alias-label-tertiary: #6d624a;
  --dsw-alias-label-caption: #8a7c5c;
  --dsw-alias-label-dimmed: #c9b57f;

  --dsw-alias-brand-primary: var(--neo-ink);
  --dsw-alias-brand-primary-invert: var(--neo-paper);
  --dsw-alias-brand-text: var(--neo-ink);
  --dsw-alias-brand-primary-new-colorprimary-new-color: var(--neo-accent);

  --dsw-alias-button-primary-fill: var(--neo-ink);
  --dsw-alias-button-primary-hover: #2e281a;
  --dsw-alias-button-primary-dimmed: var(--neo-paper-2);
  --dsw-alias-button-contrast-fill: var(--neo-ink);
  --dsw-alias-button-elevated-fill: var(--neo-paper);
  --dsw-alias-button-floating-fill: var(--neo-paper);
  --dsw-alias-button-floating-hover: #fff4d1;
  --dsw-alias-button-info-fill: var(--neo-accent);
  --dsw-alias-button-info-hover: #2747e8;
  --dsw-alias-button-ghost-active-fill: var(--neo-paper-2);
  --dsw-alias-button-ghost-active-hover: #f2e6c2;
  --dsw-alias-button-ghost-active-border: #b09b65;

  --dsw-alias-interactive-bg-hover: rgba(16, 12, 6, 0.07);
  --dsw-alias-interactive-bg-active: rgba(16, 12, 6, 0.12);
  --dsw-alias-interactive-bg-hover-accent: rgba(61, 91, 255, 0.12);
  --dsw-alias-interactive-bg-hover-solid: #f4e7c3;
  --dsw-alias-interactive-bg-hover-danger: rgba(240, 62, 47, 0.08);

  --dsw-alias-state-error-primary: var(--neo-bad);
  --dsw-alias-state-error-secondary: #ff6b5e;
  --dsw-alias-state-success-primary: var(--neo-ok);
  --dsw-alias-state-success-secondary: #2dd286;
  --dsw-alias-state-success-tertiary: #d8f7e8;
  --dsw-alias-state-warn-primary: var(--neo-warn);
  --dsw-alias-state-warn-secondary: #ffb84d;
  --dsw-alias-state-warn-tertiary: #fff0d0;
  --dsw-alias-state-warn-label: #c47f08;
  --dsw-alias-state-business-primary: var(--neo-accent);
  --dsw-alias-state-business-tertiary: #e0e6ff;

  --dsw-alias-toast-bg: var(--neo-ink);
  --dsw-alias-tooltip-bg: var(--neo-ink);
  --dsw-alias-scrollbar-bg-l1: #d9c48c;
  --dsw-alias-scrollbar-bg-l2: #d9c48c;
  --dsw-alias-scrollbar-hover-l1: var(--neo-ink);
  --dsw-alias-scrollbar-hover-l2: var(--neo-ink);

  /* loud accent pops on markdown/decoration surfaces */
  --dsw-alias-markdown-code-block: #f7edd2;
  --dsw-alias-markdown-code-block-banner: #f4e6c0;
  --dsw-alias-markdown-inline-code: #f2e4bd;
  --dsw-alias-markdown-tag: #ffe9a8;
  --dsw-alias-markdown-citation: #f9eecd;
  --dsw-alias-markdown-placeholder: #f4e8c6;
  --dsw-alias-markdown-code-segment-unselected: #f7ecd0;
  --dsw-alias-markdown-code-segment-selected: #fff8e0;
}

/* ────────────────────────────────────────────────────────────
   1b. DESIGN TOKENS — DARK
   ──────────────────────────────────────────────────────────── */
body[data-ds-dark-theme] {
  --dsw-static-neutral-bluish-00: var(--neo-dark-ink);
  --dsw-static-neutral-bluish-100: #3a2f1b;
  --dsw-static-neutral-bluish-150: #2f2615;
  --dsw-static-neutral-bluish-200: #473a20;
  --dsw-static-neutral-bluish-300: #5d4d2b;
  --dsw-static-neutral-bluish-400: #7a6a42;
  --dsw-static-neutral-bluish-500: #99875b;
  --dsw-static-neutral-bluish-600: #b5a47c;
  --dsw-static-neutral-bluish-700: #cfc0a0;
  --dsw-static-neutral-bluish-750: #ded2b8;
  --dsw-static-neutral-bluish-800: #ede4cf;
  --dsw-static-neutral-bluish-850: #f3ecd9;
  --dsw-static-neutral-bluish-875: #f7f1e2;
  --dsw-static-neutral-bluish-950: #fbf6ec;
  --dsw-static-neutral-bluish-1000: #fffaf0;

  --dsw-alias-bg-base: var(--neo-dark-bg);
  --dsw-alias-bg-layer-1: var(--neo-dark-card);
  --dsw-alias-bg-layer-2: var(--neo-dark-card);
  --dsw-alias-bg-layer-3: var(--neo-dark-card-2);
  --dsw-alias-bg-overlay: var(--neo-dark-card);
  --dsw-alias-bg-module-platform: #201a0e;
  --dsw-alias-bg-multi-select: #3a2f16;
  --dsw-alias-bg-skeleton: rgba(244, 234, 210, 0.08);

  --dsw-alias-border-l1: rgba(244, 234, 210, 0.16);
  --dsw-alias-border-l2-darkmode-thin: rgba(244, 234, 210, 0.28);
  --dsw-alias-border-l2: rgba(244, 234, 210, 0.28);
  --dsw-alias-border-l3: rgba(244, 234, 210, 0.45);
  --dsw-alias-border-l4: rgba(255, 225, 77, 0.85);

  --dsw-alias-label-primary: var(--neo-dark-ink);
  --dsw-alias-label-primary-dimmed: #d6c9a8;
  --dsw-alias-label-primary-bluish: var(--neo-dark-ink);
  --dsw-alias-label-primary-foreground: var(--neo-dark-bg);
  --dsw-alias-label-primary-inverted: var(--neo-dark-bg);
  --dsw-alias-label-secondary: #cfc0a0;
  --dsw-alias-label-tertiary: #9f8f6a;
  --dsw-alias-label-caption: #85764f;
  --dsw-alias-label-dimmed: #54452a;

  --dsw-alias-brand-primary: var(--neo-dark-accent);
  --dsw-alias-brand-primary-invert: var(--neo-dark-bg);
  --dsw-alias-brand-text: var(--neo-dark-ink);
  --dsw-alias-brand-primary-new-colorprimary-new-color: #6c7cff;

  --dsw-alias-button-primary-fill: var(--neo-dark-accent);
  --dsw-alias-button-primary-hover: #ffe97a;
  --dsw-alias-button-primary-dimmed: #3a2f19;
  --dsw-alias-button-contrast-fill: #fff3c9;
  --dsw-alias-button-elevated-fill: var(--neo-dark-card);
  --dsw-alias-button-floating-fill: var(--neo-dark-card);
  --dsw-alias-button-floating-hover: #3b3119;
  --dsw-alias-button-info-fill: #6c7cff;
  --dsw-alias-button-info-hover: #8896ff;
  --dsw-alias-button-ghost-active-fill: #362d18;
  --dsw-alias-button-ghost-active-hover: #413720;
  --dsw-alias-button-ghost-active-border: #b39f66;

  --dsw-alias-interactive-bg-hover: rgba(244, 234, 210, 0.08);
  --dsw-alias-interactive-bg-active: rgba(244, 234, 210, 0.14);
  --dsw-alias-interactive-bg-hover-accent: rgba(108, 124, 255, 0.2);
  --dsw-alias-interactive-bg-hover-solid: #453a20;
  --dsw-alias-interactive-bg-hover-danger: rgba(255, 97, 87, 0.14);

  --dsw-alias-state-error-primary: #ff6157;
  --dsw-alias-state-error-secondary: #ff8a82;
  --dsw-alias-state-success-primary: #33e087;
  --dsw-alias-state-success-secondary: #5ceaa2;
  --dsw-alias-state-success-tertiary: #123826;
  --dsw-alias-state-warn-primary: #ffc53d;
  --dsw-alias-state-warn-secondary: #ffd675;
  --dsw-alias-state-warn-tertiary: #3d2f0e;
  --dsw-alias-state-warn-label: #ffcf6e;
  --dsw-alias-state-business-primary: #6c7cff;
  --dsw-alias-state-business-tertiary: #1e2440;

  --dsw-alias-toast-bg: var(--neo-dark-accent);
  --dsw-alias-tooltip-bg: #fff3c9;
  --dsw-alias-scrollbar-bg-l1: #33291a;
  --dsw-alias-scrollbar-bg-l2: #33291a;
  --dsw-alias-scrollbar-hover-l1: var(--neo-dark-accent);
  --dsw-alias-scrollbar-hover-l2: var(--neo-dark-accent);

  --dsw-alias-markdown-code-block: #211a0d;
  --dsw-alias-markdown-code-block-banner: #2b2210;
  --dsw-alias-markdown-inline-code: #2c2312;
  --dsw-alias-markdown-tag: #3a2f14;
  --dsw-alias-markdown-citation: #262013;
  --dsw-alias-markdown-placeholder: #241d10;
  --dsw-alias-markdown-code-segment-unselected: #241d10;
  --dsw-alias-markdown-code-segment-selected: #382d16;
}

/* ────────────────────────────────────────────────────────────
   2. STRUCTURE — square corners, chunky strokes, hard focus
   ──────────────────────────────────────────────────────────── */
:where(button, [role="button"], input:not([type="checkbox"]):not([type="radio"]),
  textarea, select, [role="textbox"], [role="combobox"], [role="dialog"],
  [role="menu"], [role="tooltip"], [data-shell-overlay] > *, [class*="composer"],
  [class*="Composer"]) {
  border-radius: var(--neo-radius) !important;
}

/* hard offset shadows on the main control surfaces (readable + chunky) */
:where(button, [role="button"], [role="dialog"], [role="menu"], [role="tooltip"],
  [class*="Popover"], [class*="popover"], [class*="Menu"], [class*="menu"],
  [class*="Dropdown"], [class*="dropdown"], [class*="Select"], [class*="select"]) {
  box-shadow: 3px 3px 0 var(--neo-ink) !important;
}
body[data-ds-dark-theme] :where(button, [role="button"], [role="dialog"],
  [role="menu"], [role="tooltip"], [class*="Popover"], [class*="popover"],
  [class*="Menu"], [class*="menu"], [class*="Dropdown"], [class*="dropdown"],
  [class*="Select"], [class*="select"]) {
  box-shadow: 3px 3px 0 rgba(255, 225, 77, 0.55) !important;
}

/* press feedback on clickable controls */
:where(button, [role="button"]) {
  transition: transform 60ms ease, box-shadow 60ms ease !important;
}
:where(button, [role="button"]):active {
  transform: translate(2px, 2px) !important;
  box-shadow: 0 0 0 var(--neo-ink) !important;
}

/* chunky focus ring instead of soft glow */
:where(button, [role="button"], input, textarea, select, [role="textbox"], a:focus-visible) {
  outline: var(--neo-stroke) solid var(--neo-accent) !important;
  outline-offset: 2px !important;
}
body[data-ds-dark-theme] :where(button, [role="button"], input, textarea, select,
  [role="textbox"], a:focus-visible) {
  outline-color: var(--neo-dark-accent) !important;
}

/* code blocks: crisp ink frames */
[class*="code"] { border: 1px solid var(--neo-line); }
body[data-ds-dark-theme] [class*="code"] { border-color: rgba(244, 234, 210, 0.2); }

/* ────────────────────────────────────────────────────────────
   EXPERIMENTAL — coarse rules to enable/disable while tuning.
   The blunt "everything square" line is OFF by default; flip it
   if you want the fully hard-edged neubrutalism look.
   ──────────────────────────────────────────────────────────── */
/* * { border-radius: 0 !important; } */
`
