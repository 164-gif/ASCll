import { createRandom } from './seededRandom'

type Point = {
  a: number
  b: number
  c: number
  glyph: string
  alpha: number
  size: number
}

const GLYPHS = ['0', '1', '/', '\\', '|', '.', ':', '+', '·']
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const smooth = (value: number): number => {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

export class GlyphBackdrop {
  readonly element: HTMLCanvasElement

  private readonly ctx: CanvasRenderingContext2D
  private readonly random = createRandom(0xa5c11)
  private readonly points: Point[] = []
  private readonly resizeObserver: ResizeObserver
  private frame = 0
  private width = 1
  private height = 1
  private dpr = 1
  private pointerX = 0
  private pointerY = 0
  private targetPointerX = 0
  private targetPointerY = 0
  private reducedMotion = false
  private ambientMotionEnabled = true

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
    this.buildPoints()
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
  }

  private buildPoints(): void {
    this.points.length = 0
    for (let index = 0; index < 180; index += 1) {
      this.points.push({
        a: this.random() * Math.PI * 2,
        b: Math.acos(2 * this.random() - 1),
        c: this.random(),
        glyph: GLYPHS[Math.floor(this.random() * GLYPHS.length)] ?? '.',
        alpha: 0.16 + this.random() * 0.54,
        size: 7 + this.random() * 3,
      })
    }
  }

  private render = (timestamp: number): void => {
    const moving = this.ambientMotionEnabled && !this.reducedMotion
    const seconds = moving ? timestamp * 0.001 : 0
    this.pointerX += (this.targetPointerX - this.pointerX) * 0.025
    this.pointerY += (this.targetPointerY - this.pointerY) * 0.025

    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.width, this.height)

    const cx = this.width * (this.width < 760 ? 0.69 : 0.73) + this.pointerX * 9
    const cy = this.height * 0.49 + this.pointerY * 7
    const scale = Math.min(this.width, this.height) * (this.width < 760 ? 0.22 : 0.27)

    this.drawFrame(cx, cy, scale, seconds)
    this.drawSculpture(cx, cy, scale, seconds)
    this.drawHairlines(cx, cy, scale, seconds)
    this.drawVignette()

    this.frame = requestAnimationFrame(this.render)
  }

  private drawFrame(cx: number, cy: number, scale: number, seconds: number): void {
    this.ctx.save()
    this.ctx.strokeStyle = 'rgba(226,232,230,.075)'
    this.ctx.lineWidth = 1

    this.ctx.beginPath()
    this.ctx.arc(cx, cy, scale * 1.48, 0, Math.PI * 2)
    this.ctx.stroke()

    this.ctx.strokeStyle = 'rgba(226,232,230,.035)'
    this.ctx.beginPath()
    this.ctx.moveTo(cx - scale * 1.48, cy)
    this.ctx.lineTo(cx + scale * 1.48, cy)
    this.ctx.moveTo(cx, cy - scale * 1.48)
    this.ctx.lineTo(cx, cy + scale * 1.48)
    this.ctx.stroke()

    const arcOffset = seconds * 0.018
    this.ctx.strokeStyle = 'rgba(226,232,230,.095)'
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, scale * 1.48, -1.1 + arcOffset, -0.18 + arcOffset)
    this.ctx.stroke()
    this.ctx.restore()
  }

  private drawSculpture(cx: number, cy: number, scale: number, seconds: number): void {
    const cycle = (seconds % 24) / 24
    const stage = cycle * 4
    const shapeIndex = Math.floor(stage) % 4
    const blend = smooth(stage - Math.floor(stage))

    this.ctx.save()
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'

    for (const point of this.points) {
      const from = this.shape(shapeIndex, point, seconds, scale)
      const to = this.shape((shapeIndex + 1) % 4, point, seconds, scale)
      const x = cx + from.x + (to.x - from.x) * blend
      const y = cy + from.y + (to.y - from.y) * blend
      const depth = from.z + (to.z - from.z) * blend
      const alpha = point.alpha * (0.28 + (depth + 1) * 0.26)
      const size = point.size * (0.9 + (depth + 1) * 0.08)

      this.ctx.font = `${size.toFixed(1)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      this.ctx.fillStyle = `rgba(224,231,228,${Math.min(0.56, alpha)})`
      this.ctx.fillText(point.glyph, x, y)
    }

    this.ctx.restore()
  }

  private shape(index: number, point: Point, seconds: number, scale: number): { x: number; y: number; z: number } {
    const rotation = seconds * 0.055
    const ca = Math.cos(point.a + rotation)
    const sa = Math.sin(point.a + rotation)
    const cb = Math.cos(point.b)
    const sb = Math.sin(point.b)

    if (index === 0) {
      const radius = scale * 0.58
      return {
        x: ca * sb * radius,
        y: cb * radius * 0.82,
        z: sa * sb,
      }
    }

    if (index === 1) {
      const major = scale * 0.47
      const minor = scale * 0.19
      const tube = point.a * 2.1 + point.b
      const ring = point.b + rotation * 0.7
      return {
        x: (major + minor * Math.cos(tube)) * Math.cos(ring),
        y: minor * Math.sin(tube) * 1.65,
        z: Math.sin(ring),
      }
    }

    if (index === 2) {
      const t = point.c * Math.PI * 5.6 + point.a * 0.18
      const radius = scale * (0.12 + point.c * 0.53)
      return {
        x: Math.cos(t + rotation * 1.3) * radius,
        y: Math.sin(t * 0.78) * radius * 0.58,
        z: Math.sin(t + rotation),
      }
    }

    const t = (point.c - 0.5) * 2
    const bend = Math.sin(point.a * 2 + rotation) * scale * 0.18
    return {
      x: t * scale * 0.62 + bend,
      y: Math.sin(t * Math.PI * 1.3 + point.b) * scale * 0.28,
      z: Math.cos(point.a + t * 2),
    }
  }

  private drawHairlines(cx: number, cy: number, scale: number, seconds: number): void {
    this.ctx.save()
    this.ctx.translate(cx, cy)
    this.ctx.lineWidth = 1

    for (let index = 0; index < 4; index += 1) {
      const phase = seconds * (0.028 + index * 0.006) + index * 1.4
      this.ctx.strokeStyle = `rgba(214,222,219,${0.035 + index * 0.008})`
      this.ctx.beginPath()
      for (let step = 0; step <= 90; step += 1) {
        const t = step / 90 * Math.PI * 2
        const r = scale * (0.42 + index * 0.14) * (0.82 + Math.sin(t * 3 + phase) * 0.18)
        const x = Math.cos(t + phase) * r
        const y = Math.sin(t * (1.05 + index * 0.015) - phase * 0.6) * r * 0.54
        if (step === 0) this.ctx.moveTo(x, y)
        else this.ctx.lineTo(x, y)
      }
      this.ctx.stroke()
    }

    this.ctx.restore()
  }

  private drawVignette(): void {
    const gradient = this.ctx.createRadialGradient(
      this.width * 0.69,
      this.height * 0.5,
      Math.min(this.width, this.height) * 0.06,
      this.width * 0.69,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.74,
    )
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.55, 'rgba(0,0,0,.06)')
    gradient.addColorStop(1, 'rgba(0,0,0,.9)')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  private handlePointer = (event: PointerEvent): void => {
    this.targetPointerX = (event.clientX / Math.max(1, this.width) - 0.5) * 2
    this.targetPointerY = (event.clientY / Math.max(1, this.height) - 0.5) * 2
  }
}
