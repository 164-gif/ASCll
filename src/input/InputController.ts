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
  private firstPerson = false
  private lookX = 0
  private lookY = 0
  private dragPoint: { x: number; y: number } | null = null
  private readonly target: HTMLElement

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
    if (this.firstPerson) {
      this.dragPoint = { x: event.clientX, y: event.clientY }
      if (event.target instanceof HTMLCanvasElement && document.pointerLockElement !== event.target) {
        try { void Promise.resolve(event.target.requestPointerLock()).catch(() => {}) } catch { /* Drag and arrow keys remain available. */ }
      }
      return
    }
    this.attackQueued = true
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled || !this.firstPerson) return
    if (document.pointerLockElement && this.target.contains(document.pointerLockElement)) {
      this.lookX += event.movementX; this.lookY += event.movementY
    } else if (this.dragPoint && event.buttons === 1) {
      this.lookX += event.clientX - this.dragPoint.x; this.lookY += event.clientY - this.dragPoint.y
      this.dragPoint = { x: event.clientX, y: event.clientY }
    }
  }
  private readonly handlePointerUp = (): void => { this.dragPoint = null }
  private readonly handleBlur = (): void => { this.keys.clear(); this.lookX = 0; this.lookY = 0; this.dragPoint = null }

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.enabled) return
    event.preventDefault()
    this.zoomDelta += event.deltaY < 0 ? 1 : -1
  }

  constructor(target: HTMLElement) {
    this.target = target
    target.addEventListener('pointerdown', this.handlePointerDown)
    target.addEventListener('wheel', this.handleWheel, { passive: false })
    window.addEventListener('keydown', this.handleKeyDown, { passive: false })
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.handlePointerUp)
    window.addEventListener('blur', this.handleBlur)
  }

  movement(): MovementInput {
    const left = this.keys.has('KeyA') || (!this.firstPerson && this.keys.has('ArrowLeft'))
    const right = this.keys.has('KeyD') || (!this.firstPerson && this.keys.has('ArrowRight'))
    const forward = this.keys.has('KeyW') || (!this.firstPerson && this.keys.has('ArrowUp'))
    const backward = this.keys.has('KeyS') || (!this.firstPerson && this.keys.has('ArrowDown'))

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

  setFirstPerson(enabled: boolean): void {
    if (enabled === this.firstPerson) return
    this.firstPerson = enabled; this.keys.clear(); this.lookX = 0; this.lookY = 0; this.attackQueued = false
  }

  consumeLookDelta(dt: number): { x: number; y: number } {
    const x = this.lookX + (Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'))) * dt * 550
    const y = this.lookY + (Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp'))) * dt * 450
    this.lookX = 0; this.lookY = 0
    return { x, y }
  }

  releasePointer(): void { if (document.pointerLockElement && this.target.contains(document.pointerLockElement)) document.exitPointerLock() }

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
      this.releasePointer(); this.lookX = 0; this.lookY = 0; this.dragPoint = null
      this.keys.clear()
      this.attackQueued = false
      this.torchToggleQueued = false
      this.macroZoomQueued = false
      this.zoomDelta = 0
    }
  }

  destroy(target: HTMLElement): void {
    this.releasePointer()
    target.removeEventListener('pointerdown', this.handlePointerDown)
    target.removeEventListener('wheel', this.handleWheel)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.handlePointerUp)
    window.removeEventListener('blur', this.handleBlur)
    this.keys.clear()
  }
}
