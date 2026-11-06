// The offscreen render windows' preload. The project's components run in those pages too, so it gives them nothing but
// a way to send main the telemetry they record (PAR-627).
import { exposeTelemetry } from "./telemetry.ts"

exposeTelemetry()
