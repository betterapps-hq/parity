import type { ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline'
}

const variants = {
  default: 'bg-primary text-primary-foreground hover:opacity-90',
  outline: 'border border-border hover:bg-black/5 dark:hover:bg-white/10',
}

export function Button({ variant = 'default', className = '', ...props }: ButtonProps) {
  return <button className={`rounded-md px-4 py-2 text-sm font-medium ${variants[variant]} ${className}`} {...props} />
}
