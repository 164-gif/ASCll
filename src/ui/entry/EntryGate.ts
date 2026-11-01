const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

export class EntryGate {
  readonly element: HTMLElement

  private readonly button: HTMLButtonElement
  private entered = false
  private resolveEntry: (() => void) | null = null
  private onEnter: (() => void) | null = null

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    this.activate()
  }

  private readonly handlePointer = (): void => {
    this.activate()
  }

  constructor(parent: HTMLElement) {
    this.element = document.createElement('section')
    this.element.className = 'entry-gate'
    this.element.setAttribute('aria-label', 'Вход в игру')
    this.element.innerHTML = `
      <div class="entry-gate__axis" aria-hidden="true"></div>
      <div class="entry-gate__center">
        <div class="entry-gate__mark" aria-hidden="true"><span>a</span></div>
        <p class="entry-gate__name">ASCII</p>
        <button class="entry-gate__enter" type="button">
          <span>войти</span>
          <i aria-hidden="true"></i>
        </button>
        <p class="entry-gate__hint">касание / enter · звук включится после входа</p>
      </div>
      <div class="entry-gate__footer" aria-hidden="true">
        <span>signal 00</span>
        <span>pre-alpha</span>
      </div>
    `

    const button = this.element.querySelector<HTMLButtonElement>('.entry-gate__enter')
    if (!button) throw new Error('Entry button is unavailable')
    this.button = button
    parent.append(this.element)
  }

  async wait(onEnter: () => void): Promise<void> {
    this.onEnter = onEnter
    this.button.addEventListener('click', this.handlePointer)
    window.addEventListener('keydown', this.handleKeydown, { passive: false })
    requestAnimationFrame(() => this.element.classList.add('entry-gate--ready'))
    window.setTimeout(() => this.button.focus({ preventScroll: true }), 120)

    await new Promise<void>((resolve) => {
      this.resolveEntry = resolve
    })

    this.element.classList.add('entry-gate--leaving')
    await sleep(980)
    this.destroy()
  }

  destroy(): void {
    this.button.removeEventListener('click', this.handlePointer)
    window.removeEventListener('keydown', this.handleKeydown)
    this.resolveEntry = null
    this.onEnter = null
    this.element.remove()
  }

  private activate(): void {
    if (this.entered) return
    this.entered = true
    this.onEnter?.()
    this.element.classList.add('entry-gate--accepted')
    this.button.disabled = true
    this.resolveEntry?.()
  }
}
