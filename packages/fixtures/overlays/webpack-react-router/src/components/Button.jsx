import { Button as AriaButton } from 'react-aria-components'
import styled, { css } from 'styled-components'

const variants = {
  primary: css`
    background: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primaryForeground};
    border-color: transparent;
  `,
  secondary: css`
    background: transparent;
    color: ${({ theme }) => theme.colors.foreground};
    border-color: ${({ theme }) => theme.colors.border};
  `,
}

const StyledButton = styled(AriaButton)`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  padding: ${({ theme }) => `${theme.space.sm} ${theme.space.md}`};
  border: 1px solid;
  border-radius: ${({ theme }) => theme.radius};
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  ${({ $variant }) => variants[$variant]}

  &[data-pressed] {
    transform: scale(0.98);
  }

  &[data-focus-visible] {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

/**
 * A button for the app's forms and toolbars.
 * @param {{ variant?: 'primary' | 'secondary' } & import('react-aria-components').ButtonProps} props
 */
export function Button({ variant = 'primary', ...props }) {
  return <StyledButton $variant={variant} {...props} />
}
