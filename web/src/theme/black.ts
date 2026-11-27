// Pitch-black dark theme ("Black"), in the spirit of Vercel's Geist dark UI:
// a true #000 canvas, near-black raised surfaces, hairline borders and a
// white primary action. It extends Neutral, so typography, radii, motion,
// icons and status colors stay identical; only the surface/text/border
// tokens are redefined.
//
// Every token keeps Neutral's light value as the first entry of its
// [light, dark] pair, so the theme stays coherent if it is ever rendered in
// light mode. The app renders it with mode="dark" only.
//
// Build (static CSS + theme object, per Astryx guidance for themes known
// ahead of time):  pnpm theme:build
import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

export const blackTheme = defineTheme({
  name: 'dumpstation-black',
  extends: neutralTheme,
  tokens: {
    // Surfaces: canvas is pure black; cards, popovers and the side nav sit
    // one hairline step above it.
    '--color-background-body': ['#f1f1f1', '#000000'],
    '--color-background-surface': ['#ffffff', '#0a0a0a'],
    '--color-background-card': ['#ffffff', '#0a0a0a'],
    '--color-background-popover': ['#ffffff', '#0a0a0a'],
    '--color-background-muted': ['#f1f1f1', '#111111'],
    '--color-background-gray': ['#e2e2e2', '#1a1a1a'],
    '--color-syntax-background': ['#ffffff', '#0a0a0a'],

    // Primary action: white on black.
    '--color-accent': ['#1b1b1b', '#ededed'],
    '--color-accent-muted': ['#d4d4d4', '#2e2e2e'],
    '--color-on-accent': ['#ffffff', '#0a0a0a'],
    '--color-text-accent': ['#1b1b1b', '#ededed'],
    '--color-icon-accent': ['#1b1b1b', '#ededed'],

    // Text and icons: Geist-like soft white and gray.
    '--color-text-primary': ['#000000', '#ededed'],
    '--color-text-secondary': ['#474747', '#a1a1a1'],
    '--color-text-disabled': ['#919191', '#575757'],
    '--color-icon-primary': ['#000000', '#ededed'],
    '--color-icon-secondary': ['#6a6a6a', '#a1a1a1'],
    '--color-icon-disabled': ['#919191', '#575757'],

    // Borders: hairlines carry the structure instead of fills.
    '--color-border': ['#00000014', '#ffffff24'],
    '--color-border-emphasized': ['#d4d4d4', '#3d3d3d'],
    '--color-border-gray': ['#d4d4d4', '#262626'],
    '--color-neutral': ['#0000000F', '#ffffff14'],
    '--color-skeleton': ['#d4d4d4', '#1f1f1f'],

    // Flat elevation: no heavy drop shadows on black, only the rim.
    '--shadow-low':
      '0 2px 4px light-dark(oklch(0 0 0 / 5%), transparent), ' +
      '0 4px 8px light-dark(oklch(0 0 0 / 10%), transparent), ' +
      'inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 10%))',
    '--shadow-med':
      '0 2px 4px light-dark(oklch(0 0 0 / 5%), oklch(0 0 0 / 60%)), ' +
      '0 4px 12px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 60%)), ' +
      'inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 14%))',
    '--shadow-high':
      '0 4px 6px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 70%)), ' +
      '0 12px 24px light-dark(oklch(0 0 0 / 15%), oklch(0 0 0 / 80%)), ' +
      'inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 16%))',
  },
})

export default blackTheme
