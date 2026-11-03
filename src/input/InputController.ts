export type MovementInput = {
  x: number
  z: number
  running: boolean
}

export class InputController {
  private readonly keys = new Set<string>()
  private attackQueued = false
  private torchToggleQueued = false
  private macroZoomQueued = false
  private zoomDelta = 0
  private enabled = true

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) return
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyF', 'KeyZ'].includes(event.code)) {
      event.preventDefault()
    }
    this.keys.add(event.code)
    if (event.code === 'Space' && !event.repeat) this.attackQueued = true
    if (event.code === 'KeyF' && !event.repeat) this.torchToggleQueued = true
    if (event.code === 'KeyZ' && !event.repeat) this.macroZoomQueued = true
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0 || (event.target instanceof Element && event.target.closest('button,[role=dialog]'))) return
    this.attackQueued = true
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.enabled) return
    event.preventDefault()
    this.zoomDelta += event.deltaY < 0 ? 1 : -1
  }

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', this.handlePointerDown)
    target.addEventListener('wheel', this.handleWheel, { passive: false })
    window.addEventListener('keydown', this.handleKeyDown, { passive: false })
    window.addEventListener('keyup', this.handleKeyUp)
  }

  movement(): MovementInput {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft')
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight')
    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp')
    const backward = this.keys.has('KeyS') || this.keys.has('ArrowDown')

    let x = Number(right) - Number(left)
    let z = Number(backward) - Number(forward)
    const length = Math.hypot(x, z)
    if (length > 1) {
      x /= length
      z /= length
    }

    return {
      x,
      z,
      running: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    }
  }

  consumeAttack(): boolean {
    const queued = this.attackQueued
    this.attackQueued = false
    return queued
  }

  consumeTorchToggle(): boolean {
    const queued = this.torchToggleQueued
    this.torchToggleQueued = false
    return queued
  }

  consumeMacroZoom(): boolean {
    const queued = this.macroZoomQueued
    this.macroZoomQueued = false
    return queued
  }

  consumeZoomDelta(): number {
    const delta = this.zoomDelta
    this.zoomDelta = 0
    return delta
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.keys.clear()
      this.attackQueued = false
      this.torchToggleQueued = false
      this.macroZoomQueued = false
      this.zoomDelta = 0
    }
  }

  destroy(target: HTMLElement): void {
    target.removeEventListener('pointerdown', this.handlePointerDown)
    target.removeEventListener('wheel', this.handleWheel)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    this.keys.clear()
  }
}
