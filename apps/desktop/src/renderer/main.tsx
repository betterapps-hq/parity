import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.tsx"
import { keepFilesFromOpening } from "./canvas/drop-files.ts"
import { startTheme } from "./theme.ts"
import "tldraw/tldraw.css"
import "./styles.css"

startTheme()
keepFilesFromOpening(window)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
