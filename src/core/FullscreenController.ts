export type FullscreenListener = (active: boolean) => void

export class FullscreenController {
  private listeners = new Set<FullscreenListener>()

  constructor() {
    document.addEventListener('fullscreenchange', this.handleChange)
  }

  get active(): boolean {
    return document.fullscreenElement !== null
  }

  async toggle(): Promise<void> {
    if (this.active) {
      await document.exitFullscreen()
      return
    }

    await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  }

  subscribe(listener: FullscreenListener): () => void {
    this.listeners.add(listener)
    listener(this.active)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    document.removeEventListener('fullscreenchange', this.handleChange)
    this.listeners.clear()
  }

  private handleChange = (): void => {
    for (const listener of this.listeners) {
      listener(this.active)
    }
  }
}
