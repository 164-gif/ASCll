import { AudioSettings } from '../../core/AudioSettings'
import { FullscreenController } from '../../core/FullscreenController'

export type MotionPreferenceListener = (enabled: boolean) => void

export class SettingsDialog {
  readonly element: HTMLDialogElement

  private readonly audio = new AudioSettings()
  private readonly fullscreen: FullscreenController
  private readonly onMotionPreference: MotionPreferenceListener
  private unsubscribeFullscreen: (() => void) | null = null

  constructor(fullscreen: FullscreenController, onMotionPreference: MotionPreferenceListener) {
    this.fullscreen = fullscreen
    this.onMotionPreference = onMotionPreference
    const audio = this.audio.get()

    this.element = document.createElement('dialog')
    this.element.className = 'settings-dialog'
    this.element.innerHTML = `
      <form method="dialog" class="settings-panel">
        <header class="settings-panel__header">
          <div>
            <p class="settings-caption">ASCII / НАСТРОЙКИ</p>
            <h2>Настройки</h2>
          </div>
          <button class="settings-close" value="cancel" aria-label="Закрыть">ESC</button>
        </header>

        <section class="settings-section" aria-labelledby="settings-audio-title">
          <h3 id="settings-audio-title">Звук</h3>
          ${this.rangeRow('master-volume', 'Общая громкость', audio.master)}
          ${this.rangeRow('music-volume', 'Музыка', audio.music)}
          ${this.rangeRow('effects-volume', 'Эффекты', audio.effects)}
          ${this.toggleRow('mute-hidden', 'Глушить звук в фоне', audio.muteWhenHidden)}
        </section>

        <section class="settings-section" aria-labelledby="settings-video-title">
          <h3 id="settings-video-title">Изображение</h3>
          ${this.toggleRow('ambient-motion', 'Фоновая анимация', true)}
          <div class="setting-line setting-line--action">
            <span>Полноэкранный режим</span>
            <button class="setting-text-button" type="button" data-fullscreen>ВКЛЮЧИТЬ</button>
          </div>
        </section>

        <footer class="settings-footer">
          <span>Изменения сохраняются автоматически</span>
          <button class="settings-done" value="default">Готово</button>
        </footer>
      </form>
    `

    this.bind()
  }

  open(): void {
    if (!this.element.open) this.element.showModal()
  }

  destroy(): void {
    this.unsubscribeFullscreen?.()
    this.element.remove()
  }

  private rangeRow(id: string, label: string, value: number): string {
    const percent = Math.round(value * 100)
    return `
      <label class="setting-line setting-line--range" for="${id}">
        <span>${label}</span>
        <span class="setting-range-wrap">
          <input id="${id}" type="range" min="0" max="100" step="1" value="${percent}" style="--value:${percent}%" />
          <output for="${id}">${percent}</output>
        </span>
      </label>
    `
  }

  private toggleRow(id: string, label: string, checked: boolean): string {
    return `
      <label class="setting-line setting-line--toggle" for="${id}">
        <span>${label}</span>
        <span class="setting-toggle">
          <input id="${id}" type="checkbox" ${checked ? 'checked' : ''} />
          <span aria-hidden="true"><i>ВКЛ</i><b>ВЫКЛ</b></span>
        </span>
      </label>
    `
  }

  private bind(): void {
    const master = this.element.querySelector<HTMLInputElement>('#master-volume')
    const music = this.element.querySelector<HTMLInputElement>('#music-volume')
    const effects = this.element.querySelector<HTMLInputElement>('#effects-volume')
    const muteHidden = this.element.querySelector<HTMLInputElement>('#mute-hidden')
    const motion = this.element.querySelector<HTMLInputElement>('#ambient-motion')
    const fullscreenButton = this.element.querySelector<HTMLButtonElement>('[data-fullscreen]')

    const bindRange = (input: HTMLInputElement | null, key: 'master' | 'music' | 'effects'): void => {
      input?.addEventListener('input', () => {
        const value = Number(input.value)
        input.style.setProperty('--value', `${value}%`)
        const output = input.parentElement?.querySelector<HTMLOutputElement>('output')
        if (output) output.value = String(value)
        this.audio.update({ [key]: value / 100 })
      })
    }

    bindRange(master, 'master')
    bindRange(music, 'music')
    bindRange(effects, 'effects')

    muteHidden?.addEventListener('change', () => this.audio.update({ muteWhenHidden: muteHidden.checked }))
    motion?.addEventListener('change', () => this.onMotionPreference(motion.checked))
    fullscreenButton?.addEventListener('click', () => void this.fullscreen.toggle())

    this.unsubscribeFullscreen = this.fullscreen.subscribe((active) => {
      if (fullscreenButton) fullscreenButton.textContent = active ? 'ВЫКЛЮЧИТЬ' : 'ВКЛЮЧИТЬ'
    })

    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.element.close()
    })
  }
}
