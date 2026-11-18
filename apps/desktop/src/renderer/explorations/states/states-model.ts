import { type PlanCardProps, planCardProps } from "./plan-card.tsx"

/**
 * A component's states as saved setups of its props, and nothing else (PAR-1069), as a Storybook story is a set of
 * args. Base is the props' own values; each other state keeps only the props it sets differently.
 */

/** A saved state: its name and the props it sets over Base. */
export interface PropState {
  id: string
  name: string
  props: Partial<PlanCardProps>
}

/** What a component's states are, wherever they're shown: on the component itself or on an instance of it. */
export interface States {
  /** Every prop's own value: Base. */
  base: PlanCardProps
  /** The states after Base, in order. */
  states: PropState[]
  /** The state tagged Default: what a new instance and the component's story show. Base when it's undefined. */
  defaultState?: string
}

export const baseId = "base"

const baseState: PropState = { id: baseId, name: "Base", props: {} }

/** Base, then every saved state. */
export const allStates = (model: States): PropState[] => [baseState, ...model.states]

export const stateOf = (model: States, id: string | undefined) => allStates(model).find((state) => state.id === id)

/** A state's props as saved: Base's, with what the state sets over them. */
export const savedProps = (model: States, id: string): PlanCardProps => ({
  ...model.base,
  ...stateOf(model, id)?.props
})

/** What `props` sets differently from Base: what a state saved from them keeps. */
export function overBase(model: States, props: PlanCardProps): Partial<PlanCardProps> {
  // SAFETY: every entry is one of `props`'s own, under its own key, so the entries kept make a part of PlanCardProps.
  return Object.fromEntries(
    Object.entries(props).filter(([key, value]) => value !== model.base[key as keyof PlanCardProps])
  ) as Partial<PlanCardProps>
}

export const sameProps = (a: PlanCardProps, b: PlanCardProps) => planCardProps.every(({ name }) => a[name] === b[name])

export const isDefault = (model: States, id: string) => (model.defaultState ?? baseId) === id

/** A name no state has yet: State 2, State 3 and on. */
export function freshName(model: States): string {
  const names = new Set(allStates(model).map((state) => state.name.toLowerCase()))
  let count = model.states.length + 2

  while (names.has(`state ${count}`)) {
    count += 1
  }

  return `State ${count}`
}

/** Why `name` can't be a state's, or undefined where it can: each state is a story, named for its export. */
export function nameProblem(model: States, id: string, name: string): string | undefined {
  const taken = allStates(model).find((state) => state.id !== id && state.name.toLowerCase() === name.toLowerCase())

  return taken ? `There's already a state called ${taken.name}.` : undefined
}

export const withState = <M extends States>(model: M, id: string, change: (state: PropState) => PropState): M => ({
  ...model,
  states: model.states.map((state) => (state.id === id ? change(state) : state))
})

/** The states with `made` after `after`, or at the end. */
export function inserted<M extends States>(model: M, made: PropState, after?: string): M {
  const at = model.states.findIndex((state) => state.id === after)

  return { ...model, states: at < 0 ? [...model.states, made] : model.states.toSpliced(at + 1, 0, made) }
}

/** The states without `id`, and Default back on Base where it was the one tagged. */
export const withoutState = <M extends States>(model: M, id: string): M => ({
  ...model,
  states: model.states.filter((state) => state.id !== id),
  defaultState: model.defaultState === id ? undefined : model.defaultState
})

/** The state beside `id` that's picked when it's deleted: the next, or the one before, or Base. */
export function neighborOf(model: States, id: string): string {
  const at = model.states.findIndex((state) => state.id === id)

  return (model.states[at + 1] ?? model.states[at - 1])?.id ?? baseId
}

export const newId = () => `state-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

/** Plan card's states as the example app's pricing page uses them: Starter, with Team and Enterprise saved. */
export const planCardStates: States = {
  base: {
    plan: "Starter",
    description: "For individuals and small side projects",
    price: "$0",
    period: "free for 3 people",
    popular: false,
    action: "Start for free",
    variant: "outline"
  },
  states: [
    {
      id: "team",
      name: "Team",
      props: {
        plan: "Team",
        description: "For small teams shipping often",
        price: "$24",
        period: "a month",
        popular: true,
        action: "Choose Team",
        variant: "default"
      }
    },
    {
      id: "enterprise",
      name: "Enterprise",
      props: {
        plan: "Enterprise",
        description: "For companies with many teams",
        price: "Custom",
        period: "billed yearly",
        action: "Contact sales"
      }
    }
  ],
  defaultState: "team"
}

/** Plan card with Base and nine saved states, as a pricing page with every plan and offer would have. */
export const planCardManyStates: States = {
  ...planCardStates,
  states: [
    planCardStates.states[0]!,
    {
      id: "business",
      name: "Business",
      props: {
        plan: "Business",
        description: "For growing teams that need control",
        price: "$49",
        period: "a month",
        action: "Choose Business"
      }
    },
    planCardStates.states[1]!,
    {
      id: "annual-team",
      name: "Annual team",
      props: { ...planCardStates.states[0]!.props, price: "$240", period: "a year" }
    },
    {
      id: "education",
      name: "Education",
      props: {
        plan: "Education",
        description: "For classrooms and students",
        price: "$5",
        period: "a month per class",
        action: "Apply"
      }
    },
    {
      id: "nonprofit",
      name: "Nonprofit",
      props: {
        plan: "Nonprofit",
        description: "For registered charities",
        price: "$12",
        period: "a month",
        action: "Apply"
      }
    },
    {
      id: "startup",
      name: "Startup",
      props: {
        plan: "Startup",
        description: "For new companies in our program",
        period: "for a year",
        action: "Join the program"
      }
    },
    {
      id: "agency",
      name: "Agency",
      props: {
        plan: "Agency",
        description: "For studios building for clients",
        price: "$99",
        period: "a month",
        action: "Talk to us"
      }
    },
    {
      id: "trial",
      name: "Trial",
      props: {
        plan: "Team trial",
        description: "Everything in Team",
        period: "for 14 days",
        action: "Start trial",
        variant: "default"
      }
    }
  ]
}
