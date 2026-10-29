import type { AgentPalette } from "./agent-colors.ts"
import type { Box } from "./motion.ts"

/** How long a scan takes at full pace: the beam's sweep, a hold once it covers the target, and a slow fade. */
export const scanMs = 3500

/** The share of a scan the beam takes to cover its target, and then holds it: when the cursor can move on. */
export const scanCoveredShare = 0.6

export interface Scan {
  /** Where the target is, relative to the canvas area; asked every frame, so the scan follows the canvas. */
  box(): Box
  /** The target's corner radius on screen. */
  radius: number
  palette: AgentPalette
  /** Who's scanning: scans of the same target by different agents mix their colors. */
  agent: string
  ms: number
}

interface Running extends Scan {
  start: number
}

/** How far past its target a scan's glow can reach, in CSS pixels. */
const margin = 48

const vertex = `
attribute vec2 v;
uniform vec2 r;
uniform vec4 quad;
void main() {
  vec2 p = mix(quad.xy, quad.zw, v * .5 + .5);
  gl_Position = vec4(p.x / r.x * 2. - 1., 1. - p.y / r.y * 2., 0., 1.);
}`

/**
 * Iridescent halo: a hairline beam in the agent's colors travels down the target, and what it has passed is lit with
 * a thin-film iridescence, with light flowing round its edges and just past them. Once the target is covered it holds,
 * then fades slowly. With a second agent's palette (`duo`), the two flow through each other.
 */
const fragment = `
precision highp float;
uniform vec2 r;
uniform float t, e, d, duo, dpr, rad, still;
uniform vec4 rect;
uniform vec3 a0, a1, a2, b0, b1, b2;
float sq(float x) { return x * x; }
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
}
float box(vec2 p, vec2 b, float rr) {
  vec2 q = abs(p) - b + rr;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - rr;
}
vec3 ramp(vec3 c0, vec3 c1, vec3 c2, float x) {
  x = fract(x);
  x = x < .5 ? x * 2. : 2. - x * 2.;
  return x < .5 ? mix(c0, c1, x * 2.) : mix(c1, c2, x * 2. - 1.);
}
vec3 pal(float x, float m) {
  vec3 a = ramp(a0, a1, a2, x);
  return duo < .5 ? a : mix(a, ramp(b0, b1, b2, x + .17), m);
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, r.y - gl_FragCoord.y);
  vec2 size = rect.zw - rect.xy;
  vec2 local = px - rect.xy;
  vec2 uvl = local / size;
  float sd = box(local - size * .5, size * .5, min(rad, min(size.x, size.y) * .5));
  float inside = clamp(.5 - sd, 0., 1.);
  float edgeDist = max(-sd, 0.), outDist = max(sd, 0.);

  float sweepT = d * .45, holdT = d * .15, outT = d * .34;
  float s = still > .5 ? 1. : clamp(e / sweepT, 0., 1.);
  float se = s < .5 ? 4. * s * s * s : 1. - pow(2. - 2. * s, 3.) / 2.;
  float beamY = mix(-2. * dpr, size.y + 2. * dpr, se);
  float done = step(1., s);
  float k = clamp((e - sweepT - holdT) / outT, 0., 1.);
  float covered = max(done, clamp(beamY - local.y + .5, 0., 1.));
  float above = max(done, step(local.y, beamY));
  float dm = smoothstep(.3, .7, .5 + .5 * sin(uvl.x * 7.5 - uvl.y * 4. + t * .9));

  float film = uvl.x * .55 + uvl.y * .8 + .12 * sin(uvl.x * 7. + t * .7) + .08 * sin(uvl.y * 11. - t * .5);
  float bands = .5 + .5 * sin(film * 18.);
  float fade = 1. - smoothstep(.1, 1., k);
  vec2 cq = uvl - .5;
  float per = atan(cq.y * size.y, cq.x * size.x) / 6.2832 + .5;
  float flow = .65 + .2 * sin(per * 18.85 - t * 1.4) + .25 * n(vec2(per * 8., t * .5));
  float inner = exp(-edgeDist / (8. * dpr)) * .75 + exp(-edgeDist / (30. * dpr)) * .18;
  float fillA = (.08 + .05 * bands + inner * flow) * fade;
  vec3 edgeCol = pal(per + t * .1, smoothstep(.3, .7, .5 + .5 * sin(per * 12.566 + t)));
  vec3 fillCol = mix(pal(film * 1.4 + t * .03, dm), edgeCol, clamp(inner, 0., 1.));
  float outerA = exp(-outDist / (6. * dpr)) * .45 * flow * fade;
  vec3 outerCol = pal(per + t * .1, dm);

  // The beam stays inside the target, rounded corners and all: it never runs past an edge.
  float dy = local.y - beamY;
  float core = exp(-.5 * sq(dy / (.5 * dpr))) * .95;
  float glow = exp(-.5 * sq(dy / (2.5 * dpr))) * .4 + exp(-.5 * sq(dy / (9. * dpr))) * .14;
  float beamA = (core + glow) * inside * (1. - done);
  vec3 beamCol = mix(pal(uvl.x + t * .35, dm), vec3(1.), core * .5);

  float fA = fillA * inside * covered;
  float oA = outerA * (1. - inside) * above;
  float total = fA + oA + beamA;
  vec3 col = (fillCol * fA + outerCol * oA + beamCol * beamA) / max(total, 1e-4);
  float alpha = clamp(total, 0., .96);
  gl_FragColor = vec4(col * alpha, alpha);
}`

/**
 * Draws agents' scans on a canvas over the canvas area, one quad per scan around its target, while any are running.
 * The canvas is hidden whenever nothing is scanning, so it can never cover the designs: not before its first frame,
 * not after its last, and not if the GPU loses its context, after which it stays hidden. Without WebGL it draws
 * nothing; the cursor still shows what the agent is looking at.
 */
export class Scanner {
  private readonly gl: WebGLRenderingContext | null
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>()
  private scans: Running[] = []
  private frame = 0
  private readonly epoch = performance.now()
  private readonly still = matchMedia("(prefers-reduced-motion: reduce)").matches
  private lost = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.style.visibility = "hidden"
    this.gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false })
    const gl = this.gl
    if (!gl || gl.isContextLost()) {
      this.lost = true
      return
    }
    canvas.addEventListener("webglcontextlost", this.loseContext)
    const program = gl.createProgram()
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment]
    ] as const) {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader))
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "v")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    for (const name of ["r", "quad", "t", "e", "d", "duo", "dpr", "rad", "still", "rect"]) {
      this.uniforms.set(name, gl.getUniformLocation(program, name))
    }
    for (const name of ["a0", "a1", "a2", "b0", "b1", "b2"])
      this.uniforms.set(name, gl.getUniformLocation(program, name))
  }

  scan(scan: Scan): void {
    if (!this.gl || this.lost) return
    this.scans.push({ ...scan, start: performance.now() })
    this.frame ||= requestAnimationFrame(this.draw)
  }

  /**
   * Stops drawing and hides the canvas. The context stays: a canvas has only one, and React can mount a scanner on
   * the same canvas again (as StrictMode does), which a lost context would leave unusable.
   */
  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.scans = []
    this.canvas.style.visibility = "hidden"
    this.canvas.removeEventListener("webglcontextlost", this.loseContext)
  }

  private readonly loseContext = () => {
    this.lost = true
    this.dispose()
  }

  private readonly draw = (now: number) => {
    const gl = this.gl!
    this.scans = this.scans.filter((scan) => now - scan.start < scan.ms)
    if (this.lost || this.scans.length === 0) {
      this.canvas.style.visibility = "hidden"
      this.frame = 0
      return
    }
    const dpr = Math.min(2, devicePixelRatio || 1)
    const width = Math.round(this.canvas.clientWidth * dpr)
    const height = Math.round(this.canvas.clientHeight * dpr)
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.canvas.style.visibility = "visible"
    const boxes = this.scans.map((scan) => scan.box())
    for (const [index, scan] of this.scans.entries()) {
      const box = boxes[index]!
      if (box.w <= 0 || box.h <= 0) continue
      const partner = this.scans.find((other, at) => other.agent !== scan.agent && sameTarget(box, boxes[at]!))
      const rect = [box.x * dpr, box.y * dpr, (box.x + box.w) * dpr, (box.y + box.h) * dpr] as const
      const reach = margin * dpr
      this.set("r", (u) => gl.uniform2f(u, width, height))
      this.set("quad", (u) => gl.uniform4f(u, rect[0] - reach, rect[1] - reach, rect[2] + reach, rect[3] + reach))
      this.set("rect", (u) => gl.uniform4f(u, ...rect))
      this.set("t", (u) => gl.uniform1f(u, (now - this.epoch) / 1000))
      this.set("e", (u) => gl.uniform1f(u, (now - scan.start) / 1000))
      this.set("d", (u) => gl.uniform1f(u, scan.ms / 1000))
      this.set("duo", (u) => gl.uniform1f(u, partner ? 1 : 0))
      this.set("dpr", (u) => gl.uniform1f(u, dpr))
      this.set("rad", (u) => gl.uniform1f(u, scan.radius * dpr))
      this.set("still", (u) => gl.uniform1f(u, this.still ? 1 : 0))
      const other = (partner ?? scan).palette.stops
      for (const [stop, color] of [
        ...scan.palette.stops.map((c, i) => [`a${i}`, c]),
        ...other.map((c, i) => [`b${i}`, c])
      ]) {
        this.set(stop!, (u) => gl.uniform3f(u, ...rgb(color!)))
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    this.frame = requestAnimationFrame(this.draw)
  }

  private set(name: string, apply: (location: WebGLUniformLocation) => void): void {
    const location = this.uniforms.get(name)
    if (location) apply(location)
  }
}

/** Two scans are of the same thing when they mostly cover each other. */
function sameTarget(a: Box, b: Box): boolean {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return false
  return (width * height) / Math.min(a.w * a.h, b.w * b.h) > 0.6
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number]
}
