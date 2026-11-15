import Image from "next/image"

export function Avatar({ name, src = "/avatar.svg" }: { name: string; src?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Image src={src} alt="" width={32} height={32} className="rounded-full" />
      <span className="text-sm font-medium">{name}</span>
    </span>
  )
}
