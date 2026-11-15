import { Outlet } from 'react-router'
import styled from 'styled-components'

const Main = styled.main`
  max-width: 480px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.lg};
`

export default function Settings() {
  return (
    <Main>
      <h1>Settings</h1>
      <Outlet />
    </Main>
  )
}
