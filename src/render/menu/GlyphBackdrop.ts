import { createRandom } from './seededRandom'

type GlyphNode = {
  x: number
  y: number
  glyph: string
  alpha: number
  size: number
  layer: number
  tint: number
  sway: number
}

type Firefly = {
  x: number
  y: number
  phase: number
  speed: number
  radius: number
}

const GLYPHS = ['/', '\\', '|', ':', ';', '·', '.', ',', '^', 'v', 'Y', 'T', '†', '*']

export class GlyphBackdrop {
  readonly element: HTMLCanvasElement

  private readonly ctx: CanvasRenderingContext2D
  private readonly nodes: GlyphNode[] = []
  private readonly fireflies: Firefly[] = []
  private readonly random = createRandom(0xa5c11)
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
  private resizeObserver: ResizeObserver

  constructor(parent: HTMLElement) {
    this.element = document.createElement('canvas')
    this.element.className = 'glyph-backdrop'
    this.element.setAttribute('aria-hidden', 'true')

    const context = this.element.getContext('2d', { alpha: false })
    if (!context) {
      throw new Error('2D canvas is unavailable')
    }
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
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6)

    this.element.width = Math.floor(this.width * this.dpr)
    this.element.height = Math.floor(this.height * this.dpr)
    this.element.style.width = `${this.width}px`
    this.element.style.height = `${this.height}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    this.rebuildField()
  }

  private rebuildField(): void {
    this.nodes.length = 0
    this.fireflies.length = 0

    const area = this.width * this.height
    const count = Math.min(2300, Math.max(750, Math.floor(area / 900)))

    for (let i = 0; i < count; i += 1) {
      const layer = this.random() ** 1.4
      const yBias = Math.pow(this.random(), 0.58)
      const y = this.height * (0.22 + yBias * 0.88)
      const horizonFade = Math.max(0, Math.min(1, (y - this.height * 0.2) / (this.height * 0.62)))
      const size = 9 + layer * 8 + this.random() * 4

      this.nodes.push({
        x: this.random() * this.width,
        y,
        glyph: GLYPHS[Math.floor(this.random() * GLYPHS.length)] ?? '.',
        alpha: (0.10 + layer * 0.48) * horizonFade,
        size,
        layer,
        tint: this.random(),
        sway: this.random() * Math.PI * 2,
      })
    }

    const fireflyCount = Math.max(9, Math.floor(this.width / 120))
    for (let i = 0; i < fireflyCount; i += 1) {
      this.fireflies.push({
        x: this.width * (0.32 + this.random() * 0.64),
        y: this.height * (0.2 + this.random() * 0.62),
        phase: this.random() * Math.PI * 2,
        speed: 0.35 + this.random() * 0.65,
        radius: 0.8 + this.random() * 1.4,
      })
    }
  }

  private render = (timestamp: number): void => {
    const seconds = this.ambientMotionEnabled ? timestamp * 0.001 : 0
    this.pointerX += (this.targetPointerX - this.pointerX) * 0.035
    this.pointerY += (this.targetPointerY - this.pointerY) * 0.035

    this.drawSky()
    this.drawMoon(seconds)
    this.drawHills(seconds)
    this.drawGlyphForest(seconds)
    this.drawFog(seconds)
    this.drawFireflies(seconds)
    this.drawVignette()

    this.frame = requestAnimationFrame(this.render)
  }

  private drawSky(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height)
    gradient.addColorStop(0, '#071114')
    gradient.addColorStop(0.48, '#0a1212')
    gradient.addColorStop(1, '#030506')
    this.ctx.fillStyle = gradient
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  private drawMoon(seconds: number): void {
    const x = this.width * 0.73 + this.pointerX * 10
    const y = this.height * 0.19 + this.pointerY * 6
    const pulse = this.reducedMotion ? 1 : 0.96 + Math.sin(seconds * 0.45) * 0.04
    const radius = Math.min(this.width, this.height) * 0.055 * pulse

    const halo = this.ctx.createRadialGradient(x, y, 0, x, y, radius * 5.5)
    halo.addColorStop(0, 'rgba(205, 232, 220, .22)')
    halo.addColorStop(0.25, 'rgba(141, 183, 170, .08)')
    halo.addColorStop(1, 'rgba(40, 74, 67, 0)')
    this.ctx.fillStyle = halo
    this.ctx.beginPath()
    this.ctx.arc(x, y, radius * 5.5, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.fillStyle = 'rgba(217, 234, 223, .76)'
    this.ctx.beginPath()
    this.ctx.arc(x, y, radius, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.fillStyle = 'rgba(6, 13, 14, .24)'
    this.ctx.beginPath()
    this.ctx.arc(x - radius * 0.23, y - radius * 0.14, radius * 0.17, 0, Math.PI * 2)
    this.ctx.arc(x + radius * 0.25, y + radius * 0.19, radius * 0.11, 0, Math.PI * 2)
    this.ctx.fill()
  }

  private drawHills(seconds: number): void {
    const layers = [
      { y: 0.49, amp: 0.055, alpha: 0.75, speed: 0.025 },
      { y: 0.59, amp: 0.07, alpha: 0.88, speed: 0.04 },
      { y: 0.70, amp: 0.045, alpha: 1, speed: 0.06 },
    ]

    for (let layer = 0; layer < layers.length; layer += 1) {
      const entry = layers[layer]
      if (!entry) continue
      const parallax = this.pointerX * (layer + 1) * 6
      this.ctx.beginPath()
      this.ctx.moveTo(-30, this.height)

      for (let x = -30; x <= this.width + 30; x += 18) {
        const nx = (x + parallax) / Math.max(1, this.width)
        const wave = Math.sin(nx * 8.4 + layer * 1.7 + seconds * entry.speed) * entry.amp
        const wave2 = Math.sin(nx * 17.8 + layer * 2.8) * entry.amp * 0.38
        const y = this.height * (entry.y + wave + wave2)
        this.ctx.lineTo(x, y)
      }

      this.ctx.lineTo(this.width + 30, this.height)
      this.ctx.closePath()
      this.ctx.fillStyle = `rgba(${5 + layer * 2}, ${12 + layer * 5}, ${11 + layer * 4}, ${entry.alpha})`
      this.ctx.fill()
    }
  }

  private drawGlyphForest(seconds: number): void {
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'

    for (const node of this.nodes) {
      const drift = this.reducedMotion ? 0 : Math.sin(seconds * (0.15 + node.layer * 0.55) + node.sway) * (0.6 + node.layer * 1.2)
      const parallaxX = this.pointerX * 14 * node.layer
      const parallaxY = this.pointerY * 8 * node.layer
      const x = node.x + parallaxX + drift
      const y = node.y + parallaxY
      if (x < -20 || x > this.width + 20 || y < -20 || y > this.height + 30) continue

      const warm = node.tint > 0.93
      const color = warm ? '176, 161, 104' : node.tint > 0.58 ? '113, 146, 128' : '77, 108, 95'
      this.ctx.fillStyle = `rgba(${color}, ${node.alpha})`
      this.ctx.font = `${Math.round(node.size)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      this.ctx.fillText(node.glyph, x, y)
    }
  }

  private drawFog(seconds: number): void {
    for (let i = 0; i < 4; i += 1) {
      const phase = this.reducedMotion ? i : (seconds * (6 + i * 2) + i * 210) % (this.width + 500)
      const x = phase - 250
      const y = this.height * (0.44 + i * 0.095)
      const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 260 + i * 50)
      gradient.addColorStop(0, 'rgba(126, 151, 139, .035)')
      gradient.addColorStop(1, 'rgba(80, 100, 92, 0)')
      this.ctx.fillStyle = gradient
      this.ctx.fillRect(x - 330, y - 120, 660, 240)
    }
  }

  private drawFireflies(seconds: number): void {
    for (const firefly of this.fireflies) {
      const motion = this.reducedMotion ? 0 : Math.sin(seconds * firefly.speed + firefly.phase)
      const x = firefly.x + motion * 13 + this.pointerX * 4
      const y = firefly.y + Math.cos(seconds * firefly.speed * 0.7 + firefly.phase) * 7
      const alpha = 0.12 + (Math.sin(seconds * firefly.speed * 2 + firefly.phase) + 1) * 0.14

      this.ctx.fillStyle = `rgba(199, 207, 139, ${alpha})`
      this.ctx.beginPath()
      this.ctx.arc(x, y, firefly.radius, 0, Math.PI * 2)
      this.ctx.fill()
    }
  }

  private drawVignette(): void {
    const vignette = this.ctx.createRadialGradient(
      this.width * 0.52,
      this.height * 0.45,
      Math.min(this.width, this.height) * 0.15,
      this.width * 0.52,
      this.height * 0.45,
      Math.max(this.width, this.height) * 0.72,
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(0.68, 'rgba(0,0,0,.18)')
    vignette.addColorStop(1, 'rgba(0,0,0,.78)')
    this.ctx.fillStyle = vignette
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  private handlePointer = (event: PointerEvent): void => {
    this.targetPointerX = (event.clientX / Math.max(1, this.width) - 0.5) * 2
    this.targetPointerY = (event.clientY / Math.max(1, this.height) - 0.5) * 2
  }
}
