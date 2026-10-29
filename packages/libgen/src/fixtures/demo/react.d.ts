// Just enough of React's types for the component detection tests, resolved through `paths` instead of node_modules.
export type ReactNode = ReactElement | string | number | bigint | boolean | null | undefined | Iterable<ReactNode>
export interface ReactElement {
  type: unknown
  props: unknown
  key: string | null
}
export interface ExoticComponent<P> {
  (props: P): ReactNode
  readonly $$typeof: symbol
}
export interface ForwardRefExoticComponent<P> extends ExoticComponent<P> {}
export interface MemoExoticComponent<P> extends ExoticComponent<P> {}
export interface Context<T> extends ExoticComponent<{ value: T; children?: ReactNode }> {
  Provider: ExoticComponent<{ value: T; children?: ReactNode }>
  Consumer: ExoticComponent<{ children: (value: T) => ReactNode }>
}
export type FC<P = {}> = (props: P) => ReactNode | Promise<ReactNode>
export declare class Component<P> {
  props: P
  render(): ReactNode
}
