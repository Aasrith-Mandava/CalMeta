// Palette from the wireframes: neutral grays, dark cards for "what's next",
// purple for flow and progress. Light mode only for now.

export const colors = {
  bg: '#F6F5FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEEF4',
  ink: '#1C1B2E',
  inkMuted: '#6E6D80',
  line: '#DEDCE6',
  dark: '#2B2A3A',
  onDark: '#FFFFFF',
  onDarkMuted: '#B9B8C7',
  accent: '#5B4CF0',
  accentSoft: '#ECE9FE',
  danger: '#C53B3B',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export const font = { title: 26, heading: 17, body: 15, small: 13 } as const;
