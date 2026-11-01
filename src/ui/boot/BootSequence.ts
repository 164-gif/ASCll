const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

type GlyphParticle = {
  angle: number
  radius: number
  drift: number
  glyph: string
  phase: number
  alpha: number
}

const GLYPHS = ['/', '\\', '|', ':', '.', '·', '[', ']', '{', '}', '0', '1', '+', '=']

const easeOut = (value: number): number => 1 - Math.pow(1 - value, 3)
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
    this.element.setAttribute('aria-label', 'Loading')
    this.element.innerHTML = `
      <canvas class="boot-field" aria-hidden="true"></canvas>
      <div class="boot-scan" aria-hidden="true"></div>
      <div class="boot-prelude">
        <span class="boot-prelude__lead">ASCII // SIGNAL INTERFACE</span>
        <span class="boot-prelude__line">constructing symbolic world layer</span>
      </div>
      <div class="boot-focus">
        <span class="boot-focus__eyebrow">ATTENTION</span>
        <span class="boot-focus__title">GLYPH FIELD</span>
        <span class="boot-focus__meta">synchronizing // local renderer // world state</span>
      </div>
      <div class="boot-readout boot-readout--cinematic">
        <span class="boot-readout__label">WAKE SIGNAL</span>
        <span class="boot-readout__value">000%</span>
      </div>
      <div class="boot-progress boot-progress--cinematic" aria-hidden="true"><span></span></div>
      <div class="boot-sequence__stamp">A5C11 // WORLD INTERFACE</div>
      <div class="boot-sequence__corner">SYS.01 / INIT</div>
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
      this.updateReadout(1, 'READY')
      await sleep(180)
      this.element.classList.add('boot-sequence--leaving')
      await sleep(140)
      this.destroy()
      return
    }

    this.element.classList.add('boot-sequence--active')
    const started = performance.now()
    const duration = 4100

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

    this.element.classList.add('boot-sequence--leaving')
    await sleep(620)
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

    for (let i = 0; i < 128; i += 1) {
      this.particles.push({
        angle: random() * Math.PI * 2 + i * 0.11,
        radius: 34 + random() * 250,
        drift: (random() - 0.5) * 0.7,
        glyph: GLYPHS[Math.floor(random() * GLYPHS.length)] ?? '.',
        phase: random() * Math.PI * 2,
        alpha: 0.18 + random() * 0.62,
      })
    }
  }

  private updatePhase(progress: number): void {
    const prelude = this.element.querySelector<HTMLElement>('.boot-prelude')
    const focus = this.element.querySelector<HTMLElement>('.boot-focus')

    this.element.classList.toggle('boot-sequence--assembling', progress >= 0.12 && progress < 0.53)
    this.element.classList.toggle('boot-sequence--collapse', progress >= 0.53 && progress < 0.64)
    this.element.classList.toggle('boot-sequence--blackout', progress >= 0.64 && progress < 0.70)
    this.element.classList.toggle('boot-sequence--locked', progress >= 0.70)

    if (prelude) prelude.style.opacity = progress < 0.31 ? '1' : '0'
    if (focus) focus.style.opacity = progress >= 0.70 ? '1' : '0'

    let label = 'WAKE SIGNAL'
    let displayProgress = progress * 0.42

    if (progress >= 0.18) {
      label = 'MAPPING SYMBOL SPACE'
      displayProgress = 0.22 + (progress - 0.18) * 0.82
    }
    if (progress >= 0.43) {
      label = 'COLLAPSING FIELD'
      displayProgress = 0.63 + (progress - 0.43) * 0.62
    }
    if (progress >= 0.64) {
      label = 'SIGNAL LOST'
      displayProgress = 0.91
    }
    if (progress >= 0.70) {
      label = 'SIGNAL LOCKED'
      displayProgress = 0.94 + (progress - 0.70) * 0.2
    }
    if (progress >= 0.93) {
      label = 'READY'
      displayProgress = 1
    }

    this.updateReadout(clamp01(displayProgress), label)
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

    if (progress >= 0.64 && progress < 0.70) return

    const cx = this.width * 0.5
    const cy = this.height * 0.5
    const minSize = Math.min(this.width, this.height)
    const assembling = clamp01((progress - 0.08) / 0.38)
    const collapse = clamp01((progress - 0.50) / 0.14)
    const locked = clamp01((progress - 0.70) / 0.19)

    this.drawGuide(cx, cy, minSize, progress, seconds)

    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.font = `${Math.max(8, minSize * 0.012)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

    for (let i = 0; i < this.particles.length; i += 1) {
      const particle = this.particles[i]
      if (!particle) continue

      const initialX = cx + Math.sin(particle.phase * 1.7) * this.width * 0.47
      const initialY = cy + Math.cos(particle.phase * 1.3) * this.height * 0.43
      const spiralRadius = particle.radius * (0.34 + i / this.particles.length)
      const spiralAngle = particle.angle + seconds * (0.22 + particle.drift * 0.2) + i * 0.055
      const targetX = cx + Math.cos(spiralAngle) * spiralRadius
      const targetY = cy + Math.sin(spiralAngle) * spiralRadius * 0.42

      let x = initialX + (targetX - initialX) * easeOut(assembling)
      let y = initialY + (targetY - initialY) * easeOut(assembling)

      if (collapse > 0) {
        const force = easeOut(collapse)
        x += (cx - x) * force
        y += (cy - y) * force
      }

      if (locked > 0) {
        const ring = minSize * (0.055 + locked * 0.05)
        const angle = particle.angle + seconds * 0.18
        x = cx + Math.cos(angle) * ring * (0.9 + (i % 7) * 0.035)
        y = cy + Math.sin(angle) * ring * 0.38
      }

      const fadeIn = clamp01((progress - i / this.particles.length * 0.18) / 0.16)
      const fadeOut = progress > 0.90 ? 1 - clamp01((progress - 0.90) / 0.10) : 1
      const alpha = particle.alpha * fadeIn * Math.max(0.08, fadeOut)

      this.ctx.fillStyle = `rgba(224, 232, 229, ${alpha})`
      this.ctx.fillText(particle.glyph, x, y)
    }

    if (locked > 0) {
      const pulse = 0.62 + Math.sin(seconds * 5.2) * 0.08
      this.ctx.strokeStyle = `rgba(230, 238, 235, ${0.12 + locked * 0.25})`
      this.ctx.lineWidth = 1
      this.ctx.beginPath()
      this.ctx.arc(cx, cy, minSize * 0.065 * pulse, 0, Math.PI * 2)
      this.ctx.stroke()

      this.ctx.fillStyle = `rgba(238, 243, 241, ${0.42 + locked * 0.4})`
      this.ctx.font = `${Math.max(19, minSize * 0.052)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      this.ctx.fillText('A', cx, cy)
    }
  }

  private drawGuide(cx: number, cy: number, minSize: number, progress: number, seconds: number): void {
    const alpha = progress < 0.70 ? 0.09 : 0.15
    const radius = minSize * (0.09 + Math.sin(seconds * 0.5) * 0.002)

    this.ctx.save()
    this.ctx.translate(cx, cy)
    this.ctx.rotate(seconds * 0.045)
    this.ctx.strokeStyle = `rgba(226, 234, 231, ${alpha})`
    this.ctx.lineWidth = 1
    this.ctx.setLineDash([2, 8])
    this.ctx.beginPath()
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2)
    this.ctx.stroke()
    this.ctx.setLineDash([])

    this.ctx.strokeStyle = `rgba(226, 234, 231, ${alpha * 0.55})`
    this.ctx.beginPath()
    this.ctx.moveTo(-radius * 1.7, 0)
    this.ctx.lineTo(radius * 1.7, 0)
    this.ctx.moveTo(0, -radius * 0.9)
    this.ctx.lineTo(0, radius * 0.9)
    this.ctx.stroke()
    this.ctx.restore()
  }
}
