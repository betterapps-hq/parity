import {
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  FieldError,
  Input,
  Label,
  Text,
} from 'react-aria-components'

export interface TextFieldProps extends AriaTextFieldProps {
  label: string
  description?: string
  errorMessage?: string
}

export function TextField({ label, description, errorMessage, ...props }: TextFieldProps) {
  return (
    <AriaTextField {...props} className="flex flex-col gap-1">
      <Label className="text-sm font-medium">{label}</Label>
      <Input className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none data-[focused]:border-accent" />
      {description && (
        <Text slot="description" className="text-xs text-muted">
          {description}
        </Text>
      )}
      <FieldError className="text-xs text-red-600">{errorMessage}</FieldError>
    </AriaTextField>
  )
}
