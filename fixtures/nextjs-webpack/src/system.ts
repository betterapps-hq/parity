import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

const config = defineConfig({
  globalCss: {
    html: { colorPalette: 'indigo' },
  },
  theme: {
    tokens: {
      fonts: {
        body: { value: 'Inter, system-ui, sans-serif' },
        heading: { value: 'Inter, system-ui, sans-serif' },
      },
    },
  },
})

export const system = createSystem(defaultConfig, config)
