import { House, Moon, Settings, Sun } from 'lucide-react'
import { Link as RouterLink } from 'react-router'
import { ToggleButton } from 'react-aria-components'
import styled from 'styled-components'

const Bar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.space.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const Links = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.md};
`

const Link = styled(RouterLink)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`

const ThemeToggle = styled(ToggleButton)`
  display: inline-flex;
  padding: ${({ theme }) => theme.space.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius};
  background: transparent;
  color: inherit;
  cursor: pointer;

  &[data-focus-visible] {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
  }
`

export function NavBar({ isDark, onDarkChange }) {
  return (
    <Bar>
      <strong>Acme</strong>
      <Links>
        <Link to="/">
          <House size={18} />
          Home
        </Link>
        <Link to="/settings/profile">
          <Settings size={18} />
          Settings
        </Link>
        <ThemeToggle aria-label="Dark mode" isSelected={isDark} onChange={onDarkChange}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </ThemeToggle>
      </Links>
    </Bar>
  )
}
