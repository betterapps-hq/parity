// Only a default export, as plenty of JavaScript projects write their components.
export default function Avatar({ name, size = 40 }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-label={name}>
      {initials}
    </span>
  )
}
