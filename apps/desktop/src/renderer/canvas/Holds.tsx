import { useLayoutEffect, useRef } from "react"

interface HoldsProps {
  picture: HTMLElement
}

/** Holds an element React didn't draw, such as the picture `CarriedPicture` carries, and takes it out once it's gone. */
export function Holds({ picture }: HoldsProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    ref.current?.replaceChildren(picture)

    return () => picture.remove()
  }, [picture])

  return <div ref={ref} />
}
