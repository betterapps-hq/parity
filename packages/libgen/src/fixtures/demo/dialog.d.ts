import type { FC, ForwardRefExoticComponent, ReactNode } from "react"

export declare const Root: FC<{ open?: boolean; children?: ReactNode }>
export declare const Trigger: ForwardRefExoticComponent<{ children?: ReactNode }>
/** The same component as Root, under the name Radix also exports it by. */
export { Root as Dialog }
export declare function createDialogScope(): unknown
