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
    this.element.className = 'main-menu'

    this.element.innerHTML = `
      <header class="menu-topbar">
        <div class="world-state" aria-label="World status">
          <span class="world-state__dot"></span>
          <span>WORLD // DORMANT</span>
        </div>
        <button class="fullscreen-button" type="button" aria-label="Enter fullscreen" title="Fullscreen (F11)">
          <span class="fullscreen-button__corners" aria-hidden="true"></span>
          <span class="fullscreen-button__label">FULLSCREEN</span>
        </button>
      </header>

      <section class="menu-content" aria-labelledby="game-title">
        <div class="brand-lockup">
          <p class="brand-kicker">A WORLD RENDERED IN GLYPHS</p>
          <h1 id="game-title" aria-label="ASCII">ASCII</h1>
          <p class="brand-subtitle">The forest remembers every step.</p>
        </div>

        <nav class="menu-actions" aria-label="Main menu">
          <button class="menu-action menu-action--primary" type="button" data-action="enter">
            <span class="menu-action__index">01</span>
            <span class="menu-action__label">Enter world</span>
            <span class="menu-action__mark" aria-hidden="true">›</span>
          </button>
          <button class="menu-action" type="button" data-action="settings">
            <span class="menu-action__index">02</span>
            <span class="menu-action__label">Settings</span>
            <span class="menu-action__mark" aria-hidden="true">›</span>
          </button>
        </nav>
      </section>

      <footer class="menu-footer">
        <span>PRE-ALPHA // 0.1.0</span>
        <span class="menu-footer__hint">ENTER · SELECT&nbsp;&nbsp;&nbsp; ESC · BACK</span>
      </footer>

      <div class="prototype-toast" role="status" aria-live="polite">
        <span class="prototype-toast__glyph">⌁</span>
        <span>World simulation is the next milestone.</span>
      </div>
    `

    this.element.append(this.settings.element)
    this.bind()
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
      toast?.classList.remove('prototype-toast--visible')
      window.setTimeout(() => toast?.classList.add('prototype-toast--visible'), 10)
      window.setTimeout(() => toast?.classList.remove('prototype-toast--visible'), 2600)
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
