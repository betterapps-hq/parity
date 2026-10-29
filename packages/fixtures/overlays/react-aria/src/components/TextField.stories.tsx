import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextField } from './TextField'

const meta = {
  title: 'Components/TextField',
  component: TextField,
  args: { label: 'Email', description: 'We never share it.' },
} satisfies Meta<typeof TextField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Invalid: Story = { args: { isInvalid: true, errorMessage: 'Enter an email address.' } }
