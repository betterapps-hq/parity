import { Input, Label, TextField as AriaTextField, Text } from 'react-aria-components'
import styled from 'styled-components'

const Field = styled(AriaTextField)`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const StyledInput = styled(Input)`
  padding: ${({ theme }) => theme.space.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius};
  background: transparent;
  color: inherit;
  font: inherit;

  &[data-focused] {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
  }
`

const Description = styled(Text)`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.875rem;
`

/**
 * A labelled text input.
 * @param {{ label: string, description?: string } & import('react-aria-components').TextFieldProps} props
 */
export function TextField({ label, description, ...props }) {
  return (
    <Field {...props}>
      <Label>{label}</Label>
      <StyledInput />
      {description && <Description slot="description">{description}</Description>}
    </Field>
  )
}
