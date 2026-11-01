const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

type GlyphParticle = {
  angle: number
  radius: number
  drift: number
  glyph: string
  phase: number
  alpha: number
}

const GLYPHS = ['/', '\\', '|', ':', '.', '·', '[', ']', '0', '1', '+']
const ease = (value: number): number => {
  const x = Math.max(0, Math.min(1, value))
  return x * x * (3 - 2 * x)
}
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export class BootSequence {
  readonly element: HTMLElement

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly particles: GlyphParticle[] = []
  private readonly resizeObserver: ResizeObserver
  private frame = 0
  private reducedMotion = false
  private width = 1
  private height = 1
  private dpr = 1

  constructor(parent: HTMLElement) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.element = document.createElement('div')
    this.element.className = 'boot-sequence boot-sequence--cinematic'
    this.element.setAttribute('aria-label', 'Загрузка')
    this.element.innerHTML = `
      <canvas class="boot-field" aria-hidden="true"></canvas>
      <div class="boot-prelude">
        <span class="boot-prelude__lead">ascii</span>
        <span class="boot-prelude__line">подготовка пространства</span>
      </div>
      <div class="boot-readout boot-readout--cinematic">
        <span class="boot-readout__label">загрузка</span>
        <span class="boot-readout__value">000%</span>
      </div>
      <div class="boot-progress boot-progress--cinematic" aria-hidden="true"><span></span></div>
    `

    const canvas = this.element.querySelector<HTMLCanvasElement>('.boot-field')
    const context = canvas?.getContext('2d')
    if (!canvas || !context) throw new Error('Boot canvas is unavailable')

    this.canvas = canvas
    this.ctx = context
    parent.append(this.element)

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(parent)
    this.resize()
    this.buildParticles()
  }

  async play(): Promise<void> {
    if (this.reducedMotion) {
      this.element.classList.add('boot-sequence--active', 'boot-sequence--locked')
      this.updateReadout(1, 'загрузка')
      await sleep(260)
      this.element.classList.add('boot-sequence--leaving')
      await sleep(180)
      this.destroy()
      return
    }

    this.element.classList.add('boot-sequence--active')
    const started = performance.now()
    const duration = 8400

    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        const linear = clamp01((now - started) / duration)
        this.render(linear, now * 0.001)
        this.updatePhase(linear)

        if (linear >= 1) {
          this.frame = 0
          resolve()
          return
        }

        this.frame = requestAnimationFrame(tick)
      }

      this.frame = requestAnimationFrame(tick)
    })

    await sleep(260)
    this.element.classList.add('boot-sequence--leaving')
    await sleep(960)
    this.destroy()
  }

  destroy(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.resizeObserver.disconnect()
    this.element.remove()
  }

  private resize = (): void => {
    const rect = this.element.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    this.canvas.width = Math.floor(this.width * this.dpr)
    this.canvas.height = Math.floor(this.height * this.dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  private buildParticles(): void {
    this.particles.length = 0
    let seed = 0xa5c11
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }

    for (let i = 0; i < 164; i += 1) {
      this.particles.push({
        angle: random() * Math.PI * 2 + i * 0.071,
        radius: 26 + random() * 270,
        drift: (random() - 0.5) * 0.42,
        glyph: GLYPHS[Math.floor(random() * GLYPHS.length)] ?? '.',
        phase: random() * Math.PI * 2,
        alpha: 0.11 + random() * 0.5,
      })
    }
  }

  private updatePhase(progress: number): void {
    const prelude = this.element.querySelector<HTMLElement>('.boot-prelude')

    this.element.classList.toggle('boot-sequence--assembling', progress >= 0.08 && progress < 0.62)
    this.element.classList.toggle('boot-sequence--collapse', progress >= 0.62 && progress < 0.76)
    this.element.classList.toggle('boot-sequence--blackout', progress >= 0.76 && progress < 0.84)
    this.element.classList.toggle('boot-sequence--locked', progress >= 0.84)

    if (prelude) prelude.style.opacity = progress < 0.22 ? String(1 - ease((progress - 0.15) / 0.07)) : '0'

    let label = 'загрузка'
    if (progress >= 0.22) label = 'сборка'
    if (progress >= 0.62) label = 'синхронизация'
    if (progress >= 0.76) label = '...'
    if (progress >= 0.84) label = 'проверка'
    if (progress >= 0.96) label = 'загрузка'

    const display = progress < 0.76
      ? progress / 0.84
      : progress < 0.84
        ? 0.91
        : 0.91 + ((progress - 0.84) / 0.16) * 0.09

    this.updateReadout(clamp01(display), label)
  }

  private updateReadout(progress: number, labelText: string): void {
    const value = this.element.querySelector<HTMLElement>('.boot-readout__value')
    const label = this.element.querySelector<HTMLElement>('.boot-readout__label')
    const bar = this.element.querySelector<HTMLElement>('.boot-progress span')

    if (value) value.textContent = `${Math.round(progress * 100).toString().padStart(3, '0')}%`
    if (label) label.textContent = labelText
    if (bar) bar.style.transform = `scaleX(${progress})`
  }

  private render(progress: number, seconds: number): void {
    this.ctx.clearRect(0, 0, this.width, this.height)
    if (progress >= 0.76 && progress < 0.84) return

    const cx = this.width * 0.5
    const cy = this.height * 0.49
    const minSize = Math.min(this.width, this.height)
    const assembling = ease((progress - 0.06) / 0.52)
    const collapse = ease((progress - 0.60) / 0.16)
    const locked = ease((progress - 0.84) / 0.12)

    this.ctx.save()
    this.ctx.strokeStyle = `rgba(224,231,228,${0.025 + assembling * 0.05})`
    this.ctx.lineWidth = 1
    this.ctx.beginPath()
    this.ctx.arc(cx, cy, minSize * 0.19, 0, Math.PI * 2)
    this.ctx.stroke()
    this.ctx.restore()

    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.font = `${Math.max(8, minSize * 0.0115)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i]
      if (!particle) continue

      const startX = cx + Math.sin(particle.phase * 1.3) * this.width * 0.48
      const startY = cy + Math.cos(particle.phase * 1.7) * this.height * 0.46
      const radius = particle.radius * (0.24 + i / this.particles.length)
      const angle = particle.angle + seconds * (0.07 + particle.drift * 0.04) + i * 0.033
      const targetX = cx + Math.cos(angle) * radius
      const targetY = cy + Math.sin(angle) * radius * 0.38

      let x = startX + (targetX - startX) * assembling
      let y = startY + (targetY - startY) * assembling

      if (collapse > 0) {
        x += (cx - x) * collapse
        y += (cy - y) * collapse
      }

      if (locked > 0) {
        const ring = minSize * (0.038 + locked * 0.055)
        const lockedAngle = particle.angle + seconds * 0.045
        x = cx + Math.cos(lockedAngle) * ring * (0.92 + (i % 8) * 0.025)
        y = cy + Math.sin(lockedAngle) * ring * 0.46
      }

      const appear = ease((progress - (i / this.particles.length) * 0.12) / 0.18)
      const alpha = particle.alpha * appear * (progress > 0.97 ? 1 - ease((progress - 0.97) / 0.03) * 0.55 : 1)
      this.ctx.fillStyle = `rgba(224,231,228,${alpha})`
      this.ctx.fillText(particle.glyph, x, y)
    }

    if (locked > 0) {
      this.ctx.fillStyle = `rgba(234,239,237,${0.15 + locked * 0.54})`
      this.ctx.font = `${Math.max(18, minSize * 0.044)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      this.ctx.fillText('a', cx, cy)
    }
  }
}
