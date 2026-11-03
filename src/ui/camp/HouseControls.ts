import type { WorldState } from '../../simulation/WorldState'
import { RADIO_MIN, RADIO_MAX } from '../../world/HouseRadio'

/** The receiver stays live while walking input is suspended by the modal. */
export class HouseControls {
  readonly element = document.createElement('div')
  private world: WorldState | null = null
  private frame = 0
  private previousTime = 0
  private held: { direction: number; fine: boolean } | null = null
  private drag: { y: number; fine: boolean; pointer: number } | null = null
  private kind: 'radio' | 'peephole' = 'radio'
  private readonly release = (): void => { this.held = null; this.drag = null }
  private readonly releaseKey = (event: KeyboardEvent): void => { if (event.code.startsWith('Arrow')) this.held = null }
  constructor(parent: HTMLElement, private readonly onClose: () => void) {
    this.element.className = 'house-device'
    this.element.setAttribute('role', 'dialog'); this.element.setAttribute('aria-modal', 'true')
    this.element.hidden = true
    this.element.innerHTML = `
      <div class="house-radio">
        <div class="house-radio__header"><span>радиоприёмник / ДВ</span><button type="button" data-device-close>ESC · отойти</button></div>
        <div class="house-radio__scale" aria-hidden="true"><span>530</span><span>800</span><span>1100</span><span>1400</span><span>1710</span><i></i></div>
        <div class="house-radio__readout"><output data-frequency></output><span data-signal></span></div>
        <div class="house-radio__knobs">
          <div><button type="button" class="house-radio__knob" data-knob="coarse" aria-label="Грубая настройка частоты"><i></i></button><span>настройка</span><div><button type="button" data-turn="-1">−</button><button type="button" data-turn="1">+</button></div></div>
          <div><button type="button" class="house-radio__knob" data-knob="fine" aria-label="Точная настройка частоты"><i></i></button><span>подстройка</span><div><button type="button" data-turn="-1" data-fine>−</button><button type="button" data-turn="1" data-fine>+</button></div></div>
        </div>
        <p class="house-radio__transmission" data-transmission aria-live="off"></p>
        <p class="house-radio__hint">Зажми − / + или крути ручку мышью. ← → настройка · ↑ ↓ подстройка.<br>Не спеши. Если услышишь голос — замри и прислушайся.</p>
        <button type="button" data-power></button>
      </div>
      <div class="house-peephole__hint">за дверью <span>тихо</span><button type="button" data-device-close>E / ESC · отойти от глазка</button></div>`
    this.element.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
      if (button?.hasAttribute('data-device-close')) this.onClose()
      if (button?.hasAttribute('data-power') && this.world) this.world.house.radioOn = !this.world.house.radioOn
      if (button?.hasAttribute('data-turn') && event.detail === 0) this.world?.tuneRadio(Number(button.dataset.turn) * (button.hasAttribute('data-fine') ? 0.02 : 0.2), button.hasAttribute('data-fine'))
    })
    this.element.addEventListener('pointerdown', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
      if (!button || !this.world) return
      if (button.hasAttribute('data-turn')) {
        this.held = { direction: Number(button.dataset.turn), fine: button.hasAttribute('data-fine') }
        this.world.tuneRadio(this.held.direction * (this.held.fine ? 0.02 : 0.2), this.held.fine)
      } else if (button.dataset.knob) this.drag = { y: event.clientY, fine: button.dataset.knob === 'fine', pointer: event.pointerId }
      else return
      button.setPointerCapture(event.pointerId); event.preventDefault(); button.focus()
    })
    this.element.addEventListener('pointermove', (event) => {
      if (!this.drag || this.drag.pointer !== event.pointerId) return
      this.world?.tuneRadio((this.drag.y - event.clientY) * (this.drag.fine ? 0.008 : 0.12), this.drag.fine); this.drag.y = event.clientY
    })
    this.element.addEventListener('wheel', (event) => {
      const knob = (event.target as HTMLElement).closest<HTMLElement>('[data-knob]'); if (!knob) return
      event.preventDefault(); const fine = knob.dataset.knob === 'fine'
      this.world?.tuneRadio(-Math.sign(event.deltaY) * (fine ? 0.02 : 0.2), fine)
    }, { passive: false })
    window.addEventListener('pointerup', this.release); window.addEventListener('pointercancel', this.release)
    window.addEventListener('keyup', this.releaseKey); window.addEventListener('blur', this.release)
    parent.append(this.element)
  }
  open(world: WorldState, kind: 'radio' | 'peephole'): void {
    this.world = world; this.kind = kind
    this.element.classList.toggle('house-device--peephole', kind === 'peephole')
    this.element.setAttribute('aria-label', kind === 'radio' ? 'Настройка радио' : 'Дверной глазок')
    this.element.hidden = false; this.previousTime = performance.now()
    this.element.querySelector<HTMLButtonElement>(kind === 'radio' ? '[data-knob]' : '.house-peephole__hint button')!.focus()
    this.frame = requestAnimationFrame(this.tick)
  }
  handleKey(event: KeyboardEvent): void {
    if (event.code === 'Escape' || (event.code === 'KeyE' && this.kind === 'peephole')) { event.preventDefault(); this.onClose(); return }
    if (event.code === 'Tab') {
      const panel = this.element.querySelector<HTMLElement>(this.kind === 'radio' ? '.house-radio' : '.house-peephole__hint')!
      const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button')]
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
      return
    }
    if (this.kind !== 'radio' || !event.code.startsWith('Arrow')) return
    event.preventDefault()
    if (!event.repeat) this.held = { direction: event.code === 'ArrowRight' || event.code === 'ArrowUp' ? 1 : -1, fine: event.code === 'ArrowUp' || event.code === 'ArrowDown' }
  }
  close(): void {
    cancelAnimationFrame(this.frame); this.frame = 0; this.release(); this.element.hidden = true
    if (this.world) this.world.house.peeking = false
  }
  destroy(): void {
    this.close(); window.removeEventListener('pointerup', this.release); window.removeEventListener('pointercancel', this.release)
    window.removeEventListener('keyup', this.releaseKey); window.removeEventListener('blur', this.release); this.element.remove()
  }
  private readonly tick = (now: number): void => {
    const world = this.world; if (!world || this.element.hidden) return
    const dt = Math.min(0.05, Math.max(0, (now - this.previousTime) / 1000)); this.previousTime = now
    if (this.held && !document.hidden) world.tuneRadio(this.held.direction * (this.held.fine ? 0.55 : 14) * dt, this.held.fine)
    if (this.kind === 'radio') {
      const frequency = world.radioFrequency, reception = world.radioSignal
      this.element.querySelector<HTMLElement>('[data-frequency]')!.textContent = `${frequency.toFixed(1)} кГц`
      this.element.querySelector<HTMLElement>('.house-radio__scale i')!.style.left = `${(frequency - RADIO_MIN) / (RADIO_MAX - RADIO_MIN) * 100}%`
      this.element.querySelector<HTMLElement>('[data-signal]')!.textContent = !world.house.radioOn ? '· · · · ·' : '▮'.repeat(Math.round(reception.quality * 5)).padEnd(5, '·')
      const message = world.radioMessage
      this.element.querySelector<HTMLElement>('[data-transmission]')!.textContent = !world.house.radioOn ? 'тишина' : message ? message.slice(0, Math.floor((world.house.radioSettled - 8) * 18)) : reception.interference > 0.1 ? reception.station?.kind === 'scream' ? '...резкий звук прорывается и гаснет...' : reception.station?.kind === 'music' ? '...под треском тянется тонкая нота...' : '...будто кто-то пытается говорить...' : '...только шорох...'
      this.element.querySelector<HTMLElement>('[data-power]')!.textContent = world.house.radioOn ? '○ выключить приёмник' : '● включить приёмник'
      for (const knob of this.element.querySelectorAll<HTMLElement>('[data-knob] i')) knob.style.transform = `rotate(${knob.parentElement!.dataset.knob === 'fine' ? world.house.radioFine * 18 : world.house.radioFrequency * 9}deg)`
    }
    this.frame = requestAnimationFrame(this.tick)
  }
}
