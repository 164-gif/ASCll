const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms))

export class EntryGate {
  readonly element: HTMLElement

  private readonly disclaimer: HTMLElement
  private readonly prompt: HTMLElement
  private entered = false
  private activationPromise: Promise<void> | null = null
  private resolveEntry: (() => void) | null = null
  private onEnter: (() => void) | null = null

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    event.preventDefault()
    this.activate()
  }

  private readonly handlePointer = (): void => {
    this.activate()
  }

  constructor(parent: HTMLElement) {
    this.element = document.createElement('section')
    this.element.className = 'entry-gate'
    this.element.setAttribute('aria-label', 'Дисклеймер')
    this.element.innerHTML = `
      <div class="entry-gate__center">
        <p class="entry-gate__disclaimer" aria-label="Игра является художественным вымыслом. Персонажи, события и места придуманы; любые совпадения случайны."></p>
        <p class="entry-gate__enter" aria-label="Нажмите на любую кнопку"></p>
      </div>
    `

    const disclaimer = this.element.querySelector<HTMLElement>('.entry-gate__disclaimer')
    const prompt = this.element.querySelector<HTMLElement>('.entry-gate__enter')
    if (!disclaimer || !prompt) throw new Error('Disclaimer text is unavailable')
    this.disclaimer = disclaimer
    this.prompt = prompt
    parent.append(this.element)
  }

  async wait(onEnter: () => void): Promise<void> {
    this.onEnter = onEnter
    this.activationPromise = new Promise<void>((resolve) => {
      this.resolveEntry = resolve
    })
    window.addEventListener('pointerdown', this.handlePointer, { once: true })
    window.addEventListener('keydown', this.handleKeydown, { passive: false })
    requestAnimationFrame(() => this.element.classList.add('entry-gate--ready'))
    void this.animateDisclaimerAndPrompt()
    await this.activationPromise

    this.element.classList.add('entry-gate--leaving')
    await sleep(980)
    this.destroy()
  }

  destroy(): void {
    window.removeEventListener('pointerdown', this.handlePointer)
    window.removeEventListener('keydown', this.handleKeydown)
    this.resolveEntry = null
    this.activationPromise = null
    this.onEnter = null
    this.element.remove()
  }

  private async animateDisclaimerAndPrompt(): Promise<void> {
    await this.animateText(
      this.disclaimer,
      'Игра является художественным вымыслом. Персонажи, события и места придуманы; любые совпадения случайны.',
      3000,
    )
    if (this.entered) return

    const activation = this.activationPromise
    if (activation) await Promise.race([sleep(350), activation])
    if (this.entered) return

    await this.animateText(this.prompt, 'Нажмите на любую кнопку', 1500)
  }

  private animateText(element: HTMLElement, message: string, duration: number): Promise<void> {
    const alphabet = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789'
    const startedAt = performance.now()

    return new Promise((resolve) => {
      const tick = (now: number): void => {
        if (this.entered) {
          resolve()
          return
        }

        const progress = Math.min(1, (now - startedAt) / duration)
        const visibleCount = Math.ceil(progress * message.length)
        const lockedCount = Math.floor(Math.min(1, Math.max(0, (progress - 0.28) / 0.72)) * message.length)
        element.style.opacity = String(Math.min(1, progress * 5))
        element.textContent = Array.from(message, (character, index) => {
          if (index >= visibleCount) return ''
          if (character === ' ' || index < lockedCount) return character
          return alphabet[Math.floor(Math.random() * alphabet.length)] ?? character
        }).join('')

        if (progress >= 1) {
          element.textContent = message
          resolve()
          return
        }

        requestAnimationFrame(tick)
      }

      requestAnimationFrame(tick)
    })
  }

  private activate(): void {
    if (this.entered) return
    this.entered = true
    window.removeEventListener('pointerdown', this.handlePointer)
    window.removeEventListener('keydown', this.handleKeydown)
    this.onEnter?.()
    this.element.classList.add('entry-gate--accepted')
    this.resolveEntry?.()
  }
}
