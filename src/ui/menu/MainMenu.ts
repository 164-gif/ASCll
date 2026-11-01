import type { AudioDirector } from '../../audio/AudioDirector'
import { FullscreenController } from '../../core/FullscreenController'
import { SettingsDialog } from '../settings/SettingsDialog'

export class MainMenu {
  readonly element: HTMLElement
  private readonly fullscreen: FullscreenController
  private readonly settings: SettingsDialog
  private readonly audio: AudioDirector
  private unsubscribeFullscreen: (() => void) | null = null
  private selectedIndex = 0
  private active = false

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.active) return

    if (event.key === 'F11') {
      event.preventDefault()
      void this.fullscreen.toggle()
      return
    }

    if (this.settings.element.open) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      this.moveSelection(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const buttons = this.getAvailableActions()
      buttons[this.selectedIndex]?.click()
    }
  }

  constructor(
    fullscreen: FullscreenController,
    onMotionPreference: (enabled: boolean) => void,
    audio: AudioDirector,
  ) {
    this.fullscreen = fullscreen
    this.audio = audio
    this.settings = new SettingsDialog(fullscreen, onMotionPreference)
    this.element = document.createElement('main')
    this.element.className = 'main-menu main-menu--waiting'

    this.element.innerHTML = `
      <header class="menu-topbar">
        <span class="menu-wordmark">ascii <span class="menu-signal" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>
        <button class="fullscreen-button" type="button" aria-label="Полноэкранный режим" title="F11">
          <span class="fullscreen-button__corners" aria-hidden="true"></span>
          <span class="fullscreen-button__label">полный экран</span>
        </button>
      </header>

      <section class="menu-content" aria-label="Главное меню">
        <p class="menu-caption">главное меню</p>
        <nav class="menu-actions" aria-label="Главное меню">
          <button class="menu-action is-selected" type="button" data-action="new-game">
            <span class="menu-action__label">Новая игра</span>
          </button>
          <button class="menu-action" type="button" data-action="continue" disabled>
            <span class="menu-action__label">Продолжить</span>
          </button>
          <button class="menu-action" type="button" data-action="load" disabled>
            <span class="menu-action__label">Загрузить</span>
          </button>
          <button class="menu-action" type="button" data-action="settings">
            <span class="menu-action__label">Настройки</span>
          </button>
          <button class="menu-action" type="button" data-action="exit">
            <span class="menu-action__label">Выход</span>
          </button>
        </nav>
        <p class="menu-version">0.1.0</p>
      </section>

      <div class="menu-track" aria-hidden="true">
        <span>sound study</span>
        <b>pale glass motif</b>
      </div>

      <footer class="menu-footer">
        <span>↑↓ выбор&nbsp;&nbsp; enter подтвердить</span>
        <span>pre-alpha</span>
      </footer>
    `

    this.element.append(this.settings.element)
    this.bind()
  }

  reveal(): void {
    requestAnimationFrame(() => {
      this.element.classList.remove('main-menu--waiting')
      this.element.classList.add('main-menu--ready')
      this.active = true
      this.syncSelection()
    })
  }

  setActive(active: boolean): void {
    this.active = active
  }

  destroy(): void {
    this.active = false
    this.unsubscribeFullscreen?.()
    this.settings.destroy()
    window.removeEventListener('keydown', this.handleKeydown)
  }

  private bind(): void {
    const fullscreenButton = this.element.querySelector<HTMLButtonElement>('.fullscreen-button')
    const settingsButton = this.element.querySelector<HTMLButtonElement>('[data-action="settings"]')
    const newGameButton = this.element.querySelector<HTMLButtonElement>('[data-action="new-game"]')
    const exitButton = this.element.querySelector<HTMLButtonElement>('[data-action="exit"]')

    fullscreenButton?.addEventListener('click', () => {
      this.audio.uiConfirm()
      void this.fullscreen.toggle()
    })
    settingsButton?.addEventListener('click', () => {
      this.audio.uiConfirm()
      this.settings.open()
    })
    newGameButton?.addEventListener('click', () => {
      if (!this.active) return
      this.active = false
      this.audio.uiConfirm()
      this.element.classList.add('main-menu--departing')
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ascii:new-game'))
        this.element.classList.remove('main-menu--departing')
      }, 620)
    })
    exitButton?.addEventListener('click', () => {
      this.audio.uiConfirm()
      if (window.history.length > 1) window.history.back()
    })

    for (const button of this.getAvailableActions()) {
      button.addEventListener('pointerenter', () => {
        if (!this.active) return
        const buttons = this.getAvailableActions()
        const index = buttons.indexOf(button)
        if (index >= 0 && index !== this.selectedIndex) {
          this.selectedIndex = index
          this.audio.uiMove()
          this.syncSelection()
        }
      })
    }

    this.unsubscribeFullscreen = this.fullscreen.subscribe((active) => {
      if (!fullscreenButton) return
      fullscreenButton.classList.toggle('fullscreen-button--active', active)
      const label = fullscreenButton.querySelector<HTMLElement>('.fullscreen-button__label')
      if (label) label.textContent = active ? 'оконный режим' : 'полный экран'
    })

    window.addEventListener('keydown', this.handleKeydown)
  }

  private getAvailableActions(): HTMLButtonElement[] {
    return Array.from(this.element.querySelectorAll<HTMLButtonElement>('.menu-action:not(:disabled)'))
  }

  private moveSelection(direction: number): void {
    const buttons = this.getAvailableActions()
    if (buttons.length === 0) return
    this.selectedIndex = (this.selectedIndex + direction + buttons.length) % buttons.length
    this.audio.uiMove()
    this.syncSelection()
  }

  private syncSelection(): void {
    const buttons = this.getAvailableActions()
    buttons.forEach((button, index) => button.classList.toggle('is-selected', index === this.selectedIndex))
  }
}
