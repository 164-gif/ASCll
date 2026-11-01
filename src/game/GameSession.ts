import '../gameplay.css'
import '../ui/map/ReadableWorldMap.css'
import '../ui/camp/CampInteraction.css'
import type { AudioDirector } from '../audio/AudioDirector'
import { InputController } from '../input/InputController'
import { WorldRenderer } from '../render/world/WorldRenderer'
import { ForestCampEnhancer } from '../render/world/ForestCampEnhancer'
import { WorldState } from '../simulation/WorldState'
import { CampInteraction } from '../ui/camp/CampInteraction'
import { GameHud } from '../ui/hud/GameHud'
import { WorldMap } from '../ui/map/ReadableWorldMap'

const FIXED_STEP = 1 / 60

export class GameSession {
  readonly element: HTMLElement

  private readonly input: InputController
  private readonly world = new WorldState()
  private readonly renderer: WorldRenderer
  private readonly campEnhancer: ForestCampEnhancer
  private readonly hud: GameHud
  private readonly interaction: CampInteraction
  private readonly map: WorldMap
  private readonly audio: AudioDirector
  private readonly onExit: () => void

  private frame = 0
  private lastTime = 0
  private accumulator = 0
  private active = false

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyE' && !event.repeat && !this.map.isOpen) {
      event.preventDefault()
      this.interaction.interact(this.world)
      this.syncInputState()
      return
    }

    if (event.code === 'KeyM' && !event.repeat) {
      if (this.interaction.isModal) return
      event.preventDefault()
      this.map.toggle(this.world)
      return
    }

    if (event.key !== 'Escape') return
    event.preventDefault()

    if (this.interaction.isModal) {
      this.interaction.close()
      this.syncInputState()
      return
    }

    if (this.map.isOpen) {
      this.map.close(this.world)
      return
    }

    this.onExit()
  }

  private readonly handleMapToggle = (): void => {
    if (this.interaction.isModal) return
    this.map.toggle(this.world)
  }

  private readonly handleMapClose = (): void => {
    this.map.close(this.world)
  }

  private readonly handleInteractionChange = (): void => { this.syncInputState() }

  private readonly handleVisibility = (): void => {
    this.syncInputState()
    this.lastTime = performance.now()
    this.accumulator = 0
  }

  constructor(parent: HTMLElement, audio: AudioDirector, onExit: () => void) {
    this.audio = audio
    this.onExit = onExit
    this.element = document.createElement('section')
    this.element.className = 'gameplay-root gameplay-root--entering'
    this.element.setAttribute('aria-label', 'Игровой мир')
    parent.append(this.element)

    this.input = new InputController(this.element)
    this.renderer = new WorldRenderer(this.element, this.world)
    this.campEnhancer = new ForestCampEnhancer(this.renderer)
    this.hud = new GameHud(this.element)
    this.interaction = new CampInteraction(this.element)
    this.map = new WorldMap(this.element, this.world, (open) => {
      this.element.classList.toggle('gameplay-root--map-open', open)
      this.syncInputState()
    })
    this.hud.update(this.world)
    this.interaction.update(this.world)

    window.addEventListener('keydown', this.handleKeyDown, { passive: false })
    this.map.element.addEventListener('world-map:toggle', this.handleMapToggle)
    this.map.element.addEventListener('world-map:close', this.handleMapClose)
    this.interaction.element.addEventListener('interaction:change', this.handleInteractionChange)
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  start(): void {
    if (this.active) return
    this.active = true
    this.audio.enterWorld(this.world)
    this.lastTime = performance.now()
    requestAnimationFrame(() => this.element.classList.remove('gameplay-root--entering'))
    this.frame = requestAnimationFrame(this.tick)
  }

  destroy(): void {
    if (!this.active && this.frame === 0) return
    this.active = false
    if (this.frame !== 0) cancelAnimationFrame(this.frame)
    this.frame = 0

    window.removeEventListener('keydown', this.handleKeyDown)
    this.map.element.removeEventListener('world-map:toggle', this.handleMapToggle)
    this.map.element.removeEventListener('world-map:close', this.handleMapClose)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.input.destroy(this.element)
    this.map.destroy()
    this.interaction.element.removeEventListener('interaction:change', this.handleInteractionChange)
    this.interaction.destroy()
    this.hud.destroy()
    this.campEnhancer.destroy()
    this.renderer.destroy()
    this.element.remove()
  }

  private syncInputState(): void {
    this.input.setEnabled(!document.hidden && !this.map.isOpen && !this.interaction.isModal)
  }

  private readonly tick = (now: number): void => {
    if (!this.active) return

    const frameDt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000))
    this.lastTime = now
    this.accumulator = Math.min(0.15, this.accumulator + frameDt)

    if (!this.map.isOpen && !this.interaction.isModal) {
      if (this.input.consumeTorchToggle()) this.world.toggleTorch()
      if (this.input.consumeMacroZoom()) this.renderer.toggleMacroZoom()
      this.renderer.adjustZoom(this.input.consumeZoomDelta())

      const movement = this.input.movement()
      let attack = this.input.consumeAttack()

      while (this.accumulator >= FIXED_STEP) {
        this.world.update(FIXED_STEP, movement, attack)
        attack = false
        this.accumulator -= FIXED_STEP
      }
    } else {
      this.accumulator = 0
    }

    this.audio.updateWorld(this.world, frameDt)
    this.renderer.render(this.world, frameDt)
    this.hud.update(this.world)
    this.interaction.update(this.world)
    this.map.update(this.world)
    this.frame = requestAnimationFrame(this.tick)
  }
}
