/**
 * What Session Replay leaves out, as boxes their size: a project's frames and its icons, the project's own drawing
 * (PAR-624). The recorder watches the shadow root of every element it records, a left-out one included, and keeps what
 * it watched for the whole session, so a frame's or an icon's shadow host sits inside an element listed here and is
 * never recorded itself (PAR-1169).
 */
export const replayBlock = ["[data-frame-box]", "[data-frame]", "[data-guest-icon]"]
