const shared = {
  radius: '8px',
  space: { sm: '8px', md: '16px', lg: '24px' },
  font: 'Inter, system-ui, sans-serif',
  breakpoints: { sm: '640px', md: '768px' },
}

export const lightTheme = {
  ...shared,
  colors: {
    background: '#ffffff',
    foreground: '#18181b',
    muted: '#71717a',
    border: '#e4e4e7',
    primary: '#4f46e5',
    primaryForeground: '#ffffff',
  },
}

export const darkTheme = {
  ...shared,
  colors: {
    background: '#09090b',
    foreground: '#fafafa',
    muted: '#a1a1aa',
    border: '#27272a',
    primary: '#818cf8',
    primaryForeground: '#09090b',
  },
}
