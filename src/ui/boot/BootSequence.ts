const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

const BOOT_STEPS = [
  { at: 0.06, label: 'INITIALIZING GLYPH FIELD' },
  { at: 0.28, label: 'MAPPING SYMBOL SPACE' },
  { at: 0.52, label: 'SYNCING WORLD LAYERS' },
  { at: 0.76, label: 'CALIBRATING SIGNAL' },
  { at: 0.94, label: 'READY' },
]

export class BootSequence {
  readonly element: HTMLElement

  private frame = 0
  private reducedMotion = false

  constructor(parent: HTMLElement) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.element = document.createElement('div')
    this.element.className = 'boot-sequence'
    this.element.setAttribute('aria-label', 'Loading')
    this.element.innerHTML = `
      <div class="boot-sequence__noise" aria-hidden="true">/\\|::..//\\||::..//\\|::..//\\||::..//\\|</div>
      <div class="boot-sequence__core">
        <div class="boot-mark" aria-hidden="true">
          <span class="boot-mark__axis boot-mark__axis--x"></span>
          <span class="boot-mark__axis boot-mark__axis--y"></span>
          <span class="boot-mark__glyph">A</span>
          <span class="boot-mark__orbit">/ · \\ : | / · \\ : |</span>
        </div>
        <div class="boot-readout">
          <span class="boot-readout__label">INITIALIZING</span>
          <span class="boot-readout__value">000%</span>
        </div>
        <div class="boot-progress" aria-hidden="true"><span></span></div>
      </div>
      <div class="boot-sequence__stamp">ASCII // WORLD INTERFACE</div>
    `
    parent.append(this.element)
  }

  async play(): Promise<void> {
    if (this.reducedMotion) {
      this.setProgress(1)
      this.element.classList.add('boot-sequence--active')
      await sleep(120)
      this.element.classList.add('boot-sequence--leaving')
      await sleep(120)
      this.element.remove()
      return
    }

    this.element.classList.add('boot-sequence--active')
    const started = performance.now()
    const duration = 1850

    await new Promise<void>((resolve) => {
      const tick = (now: number): void => {
        const elapsed = now - started
        const linear = Math.min(1, elapsed / duration)
        const eased = 1 - Math.pow(1 - linear, 2.4)
        this.setProgress(eased)

        if (linear >= 1) {
          this.frame = 0
          resolve()
          return
        }

        this.frame = requestAnimationFrame(tick)
      }

      this.frame = requestAnimationFrame(tick)
    })

    await sleep(170)
    this.element.classList.add('boot-sequence--leaving')
    await sleep(720)
    this.element.remove()
  }

  destroy(): void {
    if (this.frame !== 0) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.element.remove()
  }

  private setProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress))
    const value = this.element.querySelector<HTMLElement>('.boot-readout__value')
    const label = this.element.querySelector<HTMLElement>('.boot-readout__label')
    const bar = this.element.querySelector<HTMLElement>('.boot-progress span')

    if (value) value.textContent = `${Math.round(clamped * 100).toString().padStart(3, '0')}%`
    if (bar) bar.style.transform = `scaleX(${clamped})`

    if (label) {
      let current = BOOT_STEPS[0]?.label ?? 'INITIALIZING'
      for (const step of BOOT_STEPS) {
        if (clamped >= step.at) current = step.label
      }
      label.textContent = current
    }
  }
}
