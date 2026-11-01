export type MotionPreferenceListener = (enabled: boolean) => void

export class SettingsDialog {
  readonly element: HTMLDialogElement

  private readonly onMotionPreference: MotionPreferenceListener

  constructor(onMotionPreference: MotionPreferenceListener) {
    this.onMotionPreference = onMotionPreference
    this.element = document.createElement('dialog')
    this.element.className = 'settings-dialog'
    this.element.innerHTML = `
      <form method="dialog" class="settings-panel">
        <div class="settings-panel__header">
          <div>
            <p class="eyebrow">SYSTEM</p>
            <h2>Settings</h2>
          </div>
          <button class="icon-button" value="cancel" aria-label="Close settings">×</button>
        </div>

        <label class="setting-row">
          <span>
            <strong>Ambient motion</strong>
            <small>Subtle movement in menu scenery</small>
          </span>
          <input id="ambient-motion" type="checkbox" checked />
        </label>

        <label class="setting-row">
          <span>
            <strong>Interface sound</strong>
            <small>Reserved for the audio system</small>
          </span>
          <input type="checkbox" checked disabled />
        </label>

        <p class="settings-note">More settings will appear when the playable world is connected.</p>
      </form>
    `

    this.bind()
  }

  open(): void {
    if (!this.element.open) this.element.showModal()
  }

  private bind(): void {
    const motionToggle = this.element.querySelector<HTMLInputElement>('#ambient-motion')
    motionToggle?.addEventListener('change', () => {
      this.onMotionPreference(motionToggle.checked)
    })
  }
}
