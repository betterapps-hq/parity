import { Form } from 'react-aria-components'
import styled from 'styled-components'
import { Button } from '../components/Button'
import { TextField } from '../components/TextField'

const Fields = styled(Form)`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.md};
`

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space.sm};
`

export default function Profile() {
  return (
    <Fields>
      <TextField label="Name" isRequired />
      <TextField label="Email" type="email" description="We never share it." isRequired />
      <Actions>
        <Button type="submit">Save</Button>
        <Button variant="secondary" type="reset">
          Clear
        </Button>
      </Actions>
    </Fields>
  )
}
