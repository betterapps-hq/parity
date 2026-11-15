import { Box, Container, Flex, Heading, HStack, Link } from "@chakra-ui/react"
import { AnchorIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link as RouterLink, Outlet } from "@tanstack/react-router"

export function AppShell() {
  return (
    <Box minH="100vh" bg="bg.subtle">
      <Box as="header" bg="bg" borderBottomWidth="1px">
        <Container maxW="5xl">
          <Flex h="14" align="center" justify="space-between">
            <HStack gap="2">
              <HugeiconsIcon icon={AnchorIcon} size={22} />
              <Heading size="md">Harbor</Heading>
            </HStack>
            <HStack gap="6">
              <Link asChild>
                <RouterLink to="/">Overview</RouterLink>
              </Link>
              <Link asChild>
                <RouterLink to="/settings">Settings</RouterLink>
              </Link>
            </HStack>
          </Flex>
        </Container>
      </Box>
      <Container maxW="5xl" py="8">
        <Outlet />
      </Container>
    </Box>
  )
}
