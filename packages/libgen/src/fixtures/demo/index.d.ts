import type {
  Component,
  Context,
  FC,
  ForwardRefExoticComponent,
  MemoExoticComponent,
  ReactElement,
  ReactNode
} from "react"

export interface ButtonProps {
  variant?: "default" | "outline"
  children?: ReactNode
}

/** A plain function component. */
export declare function Badge(props: { label: string }): ReactElement
/** A forwardRef result. */
export declare const Button: ForwardRefExoticComponent<ButtonProps>
/** A memo result, also exported under a second name. */
export declare const Card: MemoExoticComponent<{ title?: string }>
export { Card as Panel }
/** A component typed React.FC, which may return a promise. */
export declare const Spacer: FC
/** A class component. */
export declare class Legacy extends Component<{ size?: number }> {}
/** Parts of one component, grouped in a namespace. */
export * as Dialog from "./dialog"

/** Not components: a hook, a helper that returns text, a constant, a context and a class without render. */
export declare function useTheme(): { mode: string }
export declare function FormatDate(date: Date): string
export declare const THEME_ID: string
export declare const ThemeContext: Context<string>
export declare class ParseError extends Error {}
/** A wrapper typed any, which the types can't decide about. */
// oxlint-disable-next-line typescript/no-explicit-any -- the case under test
export declare const Loose: any
