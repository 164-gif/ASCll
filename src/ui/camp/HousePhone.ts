import type { WorldState } from '../../simulation/WorldState'

type PhoneSound = { kind: 'digit' | 'lift' | 'hangup' | 'ring' | 'typing'; digit?: string }
const RESPONSES: Record<string, string> = {
  '101': 'Дежурная служба. Пожалуйста, оставайтесь дома. Если кто-то попросит открыть дверь — сначала посмотрите в глазок.',
  '417': 'Ты снова проснулся? Слушай внимательно: если в трубке услышишь свой голос, положи её. И не выключай свет.',
  '000': 'В трубке долго молчат. Потом слышится дыхание — и три тихих удара, словно кто-то стучит изнутри стены.',
}

export class HousePhone {
  readonly element = document.createElement('div')
  private world: WorldState | null = null
  private number = ''
  private state: 'idle' | 'dialing' | 'connected' = 'idle'
  private timers: number[] = []
  private typingFrame = 0
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(parent: HTMLElement, private readonly onClose: () => void, private readonly sound: (sound: PhoneSound) => void) {
    this.element.className = 'house-phone'; this.element.hidden = true
    this.element.setAttribute('role', 'dialog'); this.element.setAttribute('aria-modal', 'true'); this.element.setAttribute('aria-label', 'Телефон')
    this.element.innerHTML = `<div class="house-phone__panel">
      <header><span>телефон / линия открыта</span><button type="button" data-phone-close>ESC · положить трубку</button></header>
      <div class="house-phone__receiver" aria-hidden="true">╭───────╮<br>╰─╮ &nbsp; ╭─╯</div>
      <output class="house-phone__number" aria-label="Набранный номер">_</output>
      <p class="house-phone__status" role="status">Гудок. Можно набрать номер.</p>
      <div class="house-phone__keypad" aria-label="Клавиатура телефона">${['1','2','3','4','5','6','7','8','9','*','0','#'].map(d => `<button type="button" data-digit="${d}">${d}</button>`).join('')}</div>
      <div class="house-phone__actions"><button type="button" data-phone-erase>стереть</button><button type="button" data-phone-call>позвонить ↗</button></div>
      <p class="house-phone__hint">На листке рядом: 101 · дежурная / 417 · знакомый голос / 000 · ?<br>Цифры · набрать &nbsp; ENTER · звонок &nbsp; BACKSPACE · стереть</p>
    </div>`
    this.element.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return
      if (button.dataset.digit !== undefined) this.digit(button.dataset.digit)
      else if (button.hasAttribute('data-phone-erase')) this.erase()
      else if (button.hasAttribute('data-phone-call')) this.call()
      else if (button.hasAttribute('data-phone-close')) this.onClose()
    })
    parent.append(this.element)
  }
  open(world: WorldState): void {
    this.world = world; this.number = ''; this.state = 'idle'; this.element.hidden = false
    this.element.classList.add('is-open'); this.update(); this.sound({ kind: 'lift' })
    this.element.querySelector<HTMLButtonElement>('[data-digit="1"]')?.focus()
  }
  handleKey(event: KeyboardEvent): void {
    if (event.code === 'Escape') { event.preventDefault(); this.onClose(); return }
    if (event.code === 'Tab') {
      const buttons = [...this.element.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
      return
    }
    if (event.repeat) return
    if (/^[0-9*#]$/.test(event.key)) { event.preventDefault(); this.digit(event.key) }
    else if (event.code === 'Backspace') { event.preventDefault(); this.erase() }
    else if (event.code === 'Enter' && !(document.activeElement instanceof HTMLButtonElement && document.activeElement.hasAttribute('data-phone-close'))) { event.preventDefault(); this.call() }
  }
  close(): void {
    if (!this.element.hidden) this.sound({ kind: 'hangup' })
    this.cancel(); this.element.hidden = true; this.element.classList.remove('is-open', 'is-dialing', 'is-connected')
    if (this.world) this.world.house.phoneLifted = false
    this.world = null
  }
  destroy(): void { this.close(); this.element.remove() }
  private digit(digit: string): void {
    if (this.state === 'dialing') return
    if (this.state === 'connected') { this.cancel(); this.number = ''; this.state = 'idle'; this.setStatus('Гудок. Можно набрать номер.') }
    if (this.number.length >= 12) return
    this.number += digit; this.sound({ kind: 'digit', digit }); this.update()
  }
  private erase(): void { if (this.state === 'dialing') return; this.cancel(); this.number = this.number.slice(0, -1); this.state = 'idle'; this.update() }
  private call(): void {
    if (!this.number || this.state === 'dialing') return
    this.cancel(); this.state = 'dialing'; this.update(); this.sound({ kind: 'ring' }); this.setStatus('Соединение. Длинные гудки...')
    this.timers.push(window.setTimeout(() => { if (this.state === 'dialing') this.sound({ kind: 'ring' }) }, 1700))
    this.timers.push(window.setTimeout(() => {
      this.state = 'connected'; this.update()
      this.typeResponse(RESPONSES[this.number] ?? 'Никто не отвечает. Линия обрывается, оставляя только тишину.')
    }, 3400))
  }
  private typeResponse(text: string): void {
    if (this.reducedMotion) { this.setStatus(text); return }
    let count = 0, next = performance.now()
    const tick = (now: number): void => {
      const previous = count
      while (now >= next && count < text.length) { const c = text[count++]!; next += /[.!?…]/.test(c) ? 190 : /[,;:]/.test(c) ? 80 : 27 }
      this.setStatus(text.slice(0, count))
      if (count > previous && /\S/.test(text.slice(previous, count))) this.sound({ kind: 'typing' })
      if (count < text.length) this.typingFrame = requestAnimationFrame(tick)
      else this.typingFrame = 0
    }
    this.typingFrame = requestAnimationFrame(tick)
  }
  private cancel(): void { this.timers.forEach(clearTimeout); this.timers = []; if (this.typingFrame) cancelAnimationFrame(this.typingFrame); this.typingFrame = 0 }
  private setStatus(text: string): void { this.element.querySelector('.house-phone__status')!.textContent = text }
  private update(): void {
    this.element.querySelector<HTMLOutputElement>('.house-phone__number')!.textContent = this.number || '_'
    this.element.classList.toggle('is-dialing', this.state === 'dialing'); this.element.classList.toggle('is-connected', this.state === 'connected')
    this.element.querySelector<HTMLButtonElement>('[data-phone-call]')!.disabled = !this.number || this.state === 'dialing'
  }
}
