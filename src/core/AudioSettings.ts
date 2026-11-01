export type AudioSettingsState = {
  master: number
  music: number
  effects: number
  muteWhenHidden: boolean
}

const STORAGE_KEY = 'ascii.audio.settings.v1'
const DEFAULTS: AudioSettingsState = {
  master: 0.8,
  music: 0.62,
  effects: 0.72,
  muteWhenHidden: true,
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

export class AudioSettings {
  private state: AudioSettingsState = { ...DEFAULTS }

  constructor() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const parsed = JSON.parse(saved) as Partial<AudioSettingsState>
      this.state = {
        master: clamp(typeof parsed.master === 'number' ? parsed.master : DEFAULTS.master),
        music: clamp(typeof parsed.music === 'number' ? parsed.music : DEFAULTS.music),
        effects: clamp(typeof parsed.effects === 'number' ? parsed.effects : DEFAULTS.effects),
        muteWhenHidden: typeof parsed.muteWhenHidden === 'boolean' ? parsed.muteWhenHidden : DEFAULTS.muteWhenHidden,
      }
    } catch {
      this.state = { ...DEFAULTS }
    }
  }

  get(): AudioSettingsState {
    return { ...this.state }
  }

  update(next: Partial<AudioSettingsState>): AudioSettingsState {
    this.state = {
      master: clamp(next.master ?? this.state.master),
      music: clamp(next.music ?? this.state.music),
      effects: clamp(next.effects ?? this.state.effects),
      muteWhenHidden: next.muteWhenHidden ?? this.state.muteWhenHidden,
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // Settings still work for the current session when storage is unavailable.
    }

    window.dispatchEvent(new CustomEvent<AudioSettingsState>('ascii:audio-settings', { detail: this.get() }))
    return this.get()
  }
}
