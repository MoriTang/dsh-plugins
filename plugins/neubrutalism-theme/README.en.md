# dsh-neubrutalism-theme

An out-of-tree Web theme for DeepSeek Harness. It follows the visual grammar in the [Neubrutalism guide](https://neubrutalism.com/): 2px control outlines, 3px container outlines, square corners, zero-blur offset shadows, a limited flat accent palette, and tactile lift/press button feedback.

## Visual system and fonts

- The light palette starts from `#FFFDF5` and uses `#FFD23F`, `#FF6B6B`, `#74B9FF`, `#88D498`, `#FFA552`, and `#B8A9FA` as accents.
- Dark mode keeps the same hierarchy with dark surfaces, off-white outlines, and bright accents.
- Display: Syne Variable 800.
- Headings and controls: Space Grotesk Variable 700.
- Body: Inter Variable, with platform CJK fallbacks.
- Code: Space Mono 400/700.

Fontsource packages provide the fonts. The build embeds only the Latin WOFF2 files as data URLs in `lib/client.js`, so the browser makes no Google Fonts request and does not require system-installed copies.

## Install, build, and test

```sh
cd /Users/mori/src/dsh/plugins/neubrutalism-theme
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

This repository expects the Harness checkout at the sibling path `../deepseek-harness`; local development dependencies use `link:` references to that checkout.

## Mount in the web profile

The package is also a profile bundle:

```sh
cd /Users/mori/src/deepseek-harness
pnpm dsh plugin --profile web add /Users/mori/src/dsh/plugins/neubrutalism-theme
```

Restart `pnpm dsh web` after registration. The bundle patch inserts the Host Loader row, while package metadata exposes `lib/client.js` as its Web client half.

Remove it with:

```sh
pnpm dsh plugin --profile web remove dsh-neubrutalism-theme
```

Cordis effects own both the token overrides and the `<style>` element. Loader disposal removes both and immediately restores the base DSH theme.
