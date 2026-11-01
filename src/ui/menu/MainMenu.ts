import { FullscreenController } from '../../core/FullscreenController'
import { SettingsDialog } from '../settings/SettingsDialog'

export class MainMenu {
  readonly element: HTMLElement
  private readonly fullscreen: FullscreenController
  private readonly settings: SettingsDialog
  private unsubscribeFullscreen: (() => void) | null = null

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'F11') {
      event.preventDefault()
      void this.fullscreen.toggle()
    }
  }

  constructor(fullscreen: FullscreenController, onMotionPreference: (enabled: boolean) => void) {
    this.fullscreen = fullscreen
    this.settings = new SettingsDialog(onMotionPreference)
    this.element = document.createElement('main')
    this.element.className = 'main-menu main-menu--waiting'

    this.element.innerHTML = `
      <header class="menu-topbar">
        <div class="menu-id" aria-label="Build information">
          <span class="menu-id__mark">A:</span>
          <span>WORLD INTERFACE // 0001</span>
        </div>
        <button class="fullscreen-button" type="button" aria-label="Enter fullscreen" title="Fullscreen (F11)">
          <span class="fullscreen-button__corners" aria-hidden="true"></span>
          <span class="fullscreen-button__label">FULLSCREEN</span>
        </button>
      </header>

      <section class="menu-content" aria-labelledby="game-title">
        <div class="brand-lockup">
          <div class="brand-sigil" aria-hidden="true">
            <span class="brand-sigil__ring">/\\:|·:/\\:|·:/\\:|·:</span>
            <span class="brand-sigil__core">A</span>
          </div>
          <p class="brand-kicker">SIGNAL ACQUIRED</p>
          <h1 id="game-title" data-text="ASCII" aria-label="ASCII">ASCII</h1>
          <p class="brand-subtitle">WORLD WITHOUT PIXELS</p>
        </div>

        <nav class="menu-actions" aria-label="Main menu">
          <button class="menu-action menu-action--primary" type="button" data-action="enter">
            <span class="menu-action__index">[01]</span>
            <span class="menu-action__label">ENTER WORLD</span>
            <span class="menu-action__signal" aria-hidden="true">//////</span>
          </button>
          <button class="menu-action" type="button" data-action="settings">
            <span class="menu-action__index">[02]</span>
            <span class="menu-action__label">SETTINGS</span>
            <span class="menu-action__signal" aria-hidden="true">::..::</span>
          </button>
        </nav>
      </section>

      <footer class="menu-footer">
        <span>PRE-ALPHA // BUILD 0.1.0</span>
        <span class="menu-footer__hint">↑ ↓ SELECT&nbsp;&nbsp;&nbsp; ENTER CONFIRM&nbsp;&nbsp;&nbsp; F11 FULLSCREEN</span>
      </footer>

      <div class="prototype-toast" role="status" aria-live="polite">
        <span class="prototype-toast__glyph">[//]</span>
        <span>WORLD CORE IS NOT CONNECTED YET</span>
      </div>
    `

    this.element.append(this.settings.element)
    this.bind()
  }

  reveal(): void {
    requestAnimationFrame(() => {
      this.element.classList.remove('main-menu--waiting')
      this.element.classList.add('main-menu--ready')
    })
  }

  destroy(): void {
    this.unsubscribeFullscreen?.()
    window.removeEventListener('keydown', this.handleKeydown)
  }

  private bind(): void {
    const fullscreenButton = this.element.querySelector<HTMLButtonElement>('.fullscreen-button')
    const enterButton = this.element.querySelector<HTMLButtonElement>('[data-action="enter"]')
    const settingsButton = this.element.querySelector<HTMLButtonElement>('[data-action="settings"]')
    const toast = this.element.querySelector<HTMLElement>('.prototype-toast')

    fullscreenButton?.addEventListener('click', () => void this.fullscreen.toggle())
    settingsButton?.addEventListener('click', () => this.settings.open())
    enterButton?.addEventListener('click', () => {
      this.element.classList.add('main-menu--pulse')
      window.setTimeout(() => this.element.classList.remove('main-menu--pulse'), 540)
      toast?.classList.remove('prototype-toast--visible')
      window.setTimeout(() => toast?.classList.add('prototype-toast--visible'), 120)
      window.setTimeout(() => toast?.classList.remove('prototype-toast--visible'), 2500)
    })

    this.unsubscribeFullscreen = this.fullscreen.subscribe((active) => {
      if (!fullscreenButton) return
      fullscreenButton.classList.toggle('fullscreen-button--active', active)
      fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen')
      const label = fullscreenButton.querySelector<HTMLElement>('.fullscreen-button__label')
      if (label) label.textContent = active ? 'WINDOWED' : 'FULLSCREEN'
    })

    window.addEventListener('keydown', this.handleKeydown)
  }
}
