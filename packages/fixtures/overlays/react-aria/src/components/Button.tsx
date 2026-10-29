import { Button as AriaButton, type ButtonProps as AriaButtonProps, composeRenderProps } from 'react-aria-components'

export interface ButtonProps extends AriaButtonProps {
  variant?: 'primary' | 'secondary'
}

const variants = {
  primary: 'bg-accent text-white data-[hovered]:bg-brand-700',
  secondary: 'border border-border text-foreground data-[hovered]:bg-zinc-100 dark:data-[hovered]:bg-zinc-800',
}

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={composeRenderProps(
        className,
        (className) =>
          `inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-accent ${variants[variant]} ${className ?? ''}`,
      )}
    />
  )
}
