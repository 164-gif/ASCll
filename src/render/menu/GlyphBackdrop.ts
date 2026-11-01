import { createRandom } from './seededRandom'

type GlyphParticle = {
  x: number
  y: number
  glyph: string
  size: number
  alpha: number
  speed: number
  phase: number
  depth: number
}

type GlyphStream = {
  x: number
  width: number
  speed: number
  offset: number
  alpha: number
}

const GLYPHS = ['/', '\\', '|', ':', ';', '.', '·', '+', '-', '=', '<', '>', '[', ']', '{', '}', '0', '1']
const STREAM_GLYPHS = '/\\|:;.=+-<>[]{}01'

export class GlyphBackdrop {
  readonly element: HTMLCanvasElement

  private readonly ctx: CanvasRenderingContext2D
  private readonly random = createRandom(0xa5c11)
  private readonly particles: GlyphParticle[] = []
  private readonly streams: GlyphStream[] = []
  private frame = 0
  private width = 0
  private height = 0
  private dpr = 1
  private targetPointerX = 0
  private targetPointerY = 0
  private pointerX = 0
  private pointerY = 0
  private reducedMotion = false
  private ambientMotionEnabled = true
  private readonly resizeObserver: ResizeObserver

  constructor(parent: HTMLElement) {
    this.element = document.createElement('canvas')
    this.element.className = 'glyph-backdrop'
    this.element.setAttribute('aria-hidden', 'true')

    const context = this.element.getContext('2d', { alpha: false })
    if (!context) throw new Error('2D canvas is unavailable')
    this.ctx = context

    parent.prepend(this.element)
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.addEventListener('pointermove', this.handlePointer, { passive: true })

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(parent)
    this.resize()
  }

  setAmbientMotion(enabled: boolean): void {
    this.ambientMotionEnabled = enabled
  }

  start(): void {
    if (this.frame !== 0) return
    this.frame = requestAnimationFrame(this.render)
  }

  destroy(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.resizeObserver.disconnect()
    window.removeEventListener('pointermove', this.handlePointer)
    this.element.remove()
  }

  private resize = (): void => {
    const rect = this.element.parentElement?.getBoundingClientRect()
    if (!rect) return

    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.7)
    this.element.width = Math.floor(this.width * this.dpr)
    this.element.height = Math.floor(this.height * this.dpr)
    this.element.style.width = `${this.width}px`
    this.element.style.height = `${this.height}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.rebuild()
  }

  private rebuild(): void {
    this.particles.length = 0
    this.streams.length = 0

    const area = this.width * this.height
    const count = Math.min(720, Math.max(280, Math.floor(area / 2600)))

    for (let index = 0; index < count; index += 1) {
      const depth = 0.25 + this.random() * 0.75
      this.particles.push({
        x: this.random() * this.width,
        y: this.random() * this.height,
        glyph: GLYPHS[Math.floor(this.random() * GLYPHS.length)] ?? '.',
        size: 8 + this.random() * 8 + depth * 4,
        alpha: 0.035 + this.random() * 0.18,
        speed: 4 + this.random() * 11,
        phase: this.random() * Math.PI * 2,
        depth,
      })
    }

    const streamCount = Math.max(5, Math.min(11, Math.floor(this.width / 170)))
    for (let index = 0; index < streamCount; index += 1) {
      this.streams.push({
        x: this.width * (0.08 + this.random() * 0.84),
        width: 24 + this.random() * 72,
        speed: 12 + this.random() * 26,
        offset: this.random() * this.height,
        alpha: 0.035 + this.random() * 0.08,
      })
    }
  }

  private render = (timestamp: number): void => {
    const seconds = this.ambientMotionEnabled && !this.reducedMotion ? timestamp * 0.001 : 0
    this.pointerX += (this.targetPointerX - this.pointerX) * 0.04
    this.pointerY += (this.targetPointerY - this.pointerY) * 0.04

    this.ctx.fillStyle = '#000000'
    this.ctx.fillRect(0, 0, this.width, this.height)

    this.drawAmbientField(seconds)
    this.drawStreams(seconds)
    this.drawOrbit(seconds)
    this.drawFaultLines(seconds)
    this.drawVignette()

    this.frame = requestAnimationFrame(this.render)
  }

  private drawAmbientField(seconds: number): void {
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'

    for (const particle of this.particles) {
      const driftX = Math.sin(seconds * 0.22 + particle.phase) * 7 * particle.depth
      const driftY = ((seconds * particle.speed + particle.phase * 40) % (this.height + 80)) - 40
      const x = particle.x + driftX + this.pointerX * 11 * particle.depth
      const y = (particle.y + driftY * 0.12 + this.pointerY * 7 * particle.depth + this.height) % this.height
      const pulse = 0.72 + Math.sin(seconds * 0.75 + particle.phase) * 0.28

      this.ctx.font = `${Math.round(particle.size)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      this.ctx.fillStyle = `rgba(206, 218, 214, ${particle.alpha * pulse})`
      this.ctx.fillText(particle.glyph, x, y)
    }
  }

  private drawStreams(seconds: number): void {
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

    for (let streamIndex = 0; streamIndex < this.streams.length; streamIndex += 1) {
      const stream = this.streams[streamIndex]
      if (!stream) continue

      for (let row = -3; row < Math.ceil(this.height / 22) + 3; row += 1) {
        const travel = seconds * stream.speed + stream.offset
        const y = ((row * 22 + travel) % (this.height + 88)) - 44
        const bend = Math.sin(y * 0.012 + streamIndex * 1.7 + seconds * 0.3) * stream.width
        const x = stream.x + bend + this.pointerX * 4
        const glyphIndex = Math.abs(Math.floor(row * 7 + streamIndex * 11 + seconds * 3)) % STREAM_GLYPHS.length
        const glyph = STREAM_GLYPHS[glyphIndex] ?? ':'
        const fade = Math.max(0.15, 1 - Math.abs(y - this.height * 0.5) / (this.height * 0.62))

        this.ctx.fillStyle = `rgba(225, 233, 230, ${stream.alpha * fade})`
        this.ctx.fillText(glyph, x, y)
      }
    }
  }

  private drawOrbit(seconds: number): void {
    const centerX = this.width * 0.73 + this.pointerX * 13
    const centerY = this.height * 0.48 + this.pointerY * 9
    const radiusX = Math.min(this.width * 0.21, 250)
    const radiusY = Math.min(this.height * 0.28, 210)
    const count = this.width < 720 ? 34 : 54

    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + seconds * 0.08
      const x = centerX + Math.cos(angle) * radiusX
      const y = centerY + Math.sin(angle) * radiusY
      const glyph = STREAM_GLYPHS[(index * 3) % STREAM_GLYPHS.length] ?? '/'
      const alpha = 0.045 + (Math.sin(angle * 3 + seconds) + 1) * 0.025
      this.ctx.fillStyle = `rgba(233, 239, 237, ${alpha})`
      this.ctx.fillText(glyph, x, y)
    }

    const innerCount = 18
    for (let index = 0; index < innerCount; index += 1) {
      const angle = (index / innerCount) * Math.PI * 2 - seconds * 0.12
      const x = centerX + Math.cos(angle) * radiusX * 0.48
      const y = centerY + Math.sin(angle) * radiusY * 0.48
      this.ctx.fillStyle = 'rgba(195, 205, 202, .05)'
      this.ctx.fillText(index % 2 === 0 ? '/' : '\\', x, y)
    }
  }

  private drawFaultLines(seconds: number): void {
    const activation = (Math.sin(seconds * 0.47) + 1) * 0.5
    if (activation < 0.76) return

    this.ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    this.ctx.textAlign = 'left'
    const y = this.height * (0.18 + ((Math.sin(seconds * 0.21) + 1) * 0.32))
    const x = this.width * 0.54
    const fragments = ['////', '::', '00', '||', '[]', '..', '=/=', '\\\\']

    for (let index = 0; index < 8; index += 1) {
      const offset = index * 38 + Math.sin(seconds * 2 + index) * 8
      this.ctx.fillStyle = `rgba(235, 240, 238, ${0.025 + activation * 0.04})`
      this.ctx.fillText(fragments[index % fragments.length] ?? '//', x + offset, y + (index % 2) * 7)
    }
  }

  private drawVignette(): void {
    const gradient = this.ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.5,
      Math.min(this.width, this.height) * 0.1,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.76,
    )
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.66, 'rgba(0,0,0,.18)')
    gradient.addColorStop(1, 'rgba(0,0,0,.82)')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  private handlePointer = (event: PointerEvent): void => {
    this.targetPointerX = (event.clientX / Math.max(1, this.width) - 0.5) * 2
    this.targetPointerY = (event.clientY / Math.max(1, this.height) - 0.5) * 2
  }
}
