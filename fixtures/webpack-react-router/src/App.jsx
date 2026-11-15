import { useState } from 'react'
import { Route, Routes } from 'react-router'
import { ThemeProvider } from 'styled-components'
import { GlobalStyle } from './GlobalStyle'
import { NavBar } from './components/NavBar'
import Home from './routes/Home'
import Settings from './routes/Settings'
import Profile from './routes/Profile'
import { darkTheme, lightTheme } from './theme'

function App() {
  const [isDark, setDark] = useState(false)
  return (
    <ThemeProvider theme={isDark ? darkTheme : lightTheme}>
      <GlobalStyle />
      <NavBar isDark={isDark} onDarkChange={setDark} />
      <Routes>
        <Route index element={<Home />} />
        <Route path="settings" element={<Settings />}>
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}

export default App
