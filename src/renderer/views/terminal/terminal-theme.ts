import { resolveTheme } from '../../stores/settings'
import { useSettingsStore } from '../../stores/settings'

export const DARK_THEME = {
  background: '#191919',
  foreground: '#F0EDE8',
  cursor: '#C9A87C',
  cursorAccent: '#191919',
  selectionBackground: 'rgba(201, 168, 124, 0.3)',
  black: '#191919',
  red: '#FC8181',
  green: '#68D391',
  yellow: '#ECC94B',
  blue: '#7AA2F7',
  magenta: '#BB9AF7',
  cyan: '#7DCFFF',
  white: '#F0EDE8',
  brightBlack: '#6B6B6B',
  brightRed: '#FC8181',
  brightGreen: '#68D391',
  brightYellow: '#ECC94B',
  brightBlue: '#7AA2F7',
  brightMagenta: '#BB9AF7',
  brightCyan: '#7DCFFF',
  brightWhite: '#FFFFFF'
}

export const LIGHT_THEME = {
  background: '#FAFAF8',
  foreground: '#1A1A1A',
  cursor: '#7A6244',
  cursorAccent: '#FAFAF8',
  selectionBackground: 'rgba(122, 98, 68, 0.2)',
  black: '#1A1A1A',
  red: '#C53030',
  green: '#2E8B57',
  yellow: '#8B6914',          // Darkened for ~5.2:1 contrast on light bg
  blue: '#2563EB',
  magenta: '#7C3AED',
  cyan: '#0891B2',
  white: '#6B6B6B',          // Darkened — was #F0EDE8 (invisible on light bg)
  brightBlack: '#6B6B6B',   // Darkened from #777777 for safer contrast margin (~5.1:1)
  brightRed: '#E53E3E',
  brightGreen: '#38A169',
  brightYellow: '#7A5C0F',   // Darkened for ~6.1:1 contrast on light bg
  brightBlue: '#3B82F6',
  brightMagenta: '#8B5CF6',
  brightCyan: '#06B6D4',
  brightWhite: '#999999'     // Darker — was #FFFFFF (invisible on light bg)
}

export function getTerminalTheme(): typeof DARK_THEME {
  return resolveTheme(useSettingsStore.getState().theme) === 'light' ? LIGHT_THEME : DARK_THEME
}
