import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import styled from 'styled-components'
import { Button } from '../components/Button'

const Main = styled.main`
  max-width: 640px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space.lg};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.space.md};
  }
`

export default function Home() {
  const navigate = useNavigate()
  return (
    <Main>
      <h1>Welcome back</h1>
      <p>Pick up where you left off.</p>
      <Button onPress={() => navigate('/settings/profile')}>
        Edit your profile
        <ArrowRight size={16} />
      </Button>
    </Main>
  )
}
