import type { WorldState } from '../../simulation/WorldState'
import { WORLD_LIMIT } from '../../world/WorldLayout'

const MAP_COLS = 72
const MAP_ROWS = 72
const MAP_GLYPHS = ' .,:;+=x*#%@'
const MAP_PALETTE = [
  '#08110f', '#10201c', '#1c3529', '#365a3b', '#3e5663',
  '#7f8b83', '#8d5b21', '#d28a25', '#f0c45a', '#d7d2bb',
] as const

// Compact glyph/palette sampling of the generated four-segment map artwork.
// Each byte stores palette index in the high nibble and glyph index in the low nibble.
const MAP_DATA = 'AAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAREQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEQAAACEhEREREREREREREREREREREREREREREREREREREREiEQAzYwARIiERERERERERERERERERERERERERERERERERERERISEAAREAAAAAEREiEQAREREAAAAAABERAAAAABERABEREQAAAAARIQAAAAAAAAAAAAAAAQARAQAAABEAAAEiISIRESIRAAAAABEAEQEAIiIjIhERISIiESIRAAAREQAREQAAIjMiESIiESIiAAAAAAEAAAAREQAAESIRERERAAAAIiEBETMiERERIiEiIgARAAEREQARIhERIiIiIRERABERAAAAABEREQAiIxEiMyIRIiIiIgAAAAABIgAAAAARQyIRIjMiEQARIhERESIBIjMiIhERIhEREREREREAABERESIiIiIiIgAREREREQABEQEhIiIiEREiIhERAQAAABEiIiIiAQABIkMREREREREhIhERAAAiIhEiIxEiEREREREREREAIiIiMxERIjMiIgAhEQAAABEREQAAIhERIiIiIQARIgAAACIiIiEiIgABESIiABEiIhEiIhERESIzESIhIiEiIhERAREREREiIREhMyEhIiIRAAAiEQAREREhESERACIzETMiIgARIhEAABEhIiIiIgARERFDQyEiEQEiIhERERERESIiIiIiEREiEREREREiEREiQxEAAAAAACEjMwAAABERAAARABERASIiIgAiEREAETMiIhEiIxEiIiIiQxEAEREhEREREQARIiIiMxEAESIRABEREREAAAAiIyIiABERIiIzQzMiEQAAAQAAAAARIiIzEQERERERABERIiIiESIzMyEhQ0MiEREiIiEREQARIhEiIhEAEREREREREQAAIhEiMxEiESEiIjNkZGRkIgAAESIAAAAAERFEEREiIRERABEAIhERARERIhEREUNEIhEREQERIREAAAEzIwARESIiEREREQARIiIzIhEAIiJDQzMzIjNjIiIAEREjIhERIRFDERERERERABEAIgEAEREAEQARQ0MiIREREREREREAIREiIgARIiIRABEREQEAASEzERERIiIiIiJjESJkYxEAEQAiZCIiEQAiAAARERERAQAAIxERIiIREREiIhERIhEhAREAABEiIhEiIgERIhERERERERERERFEImMREREhImQzEQARIjMiEREREREREQERIiMiERERERERIhERIkMiIiIRIiIhERERIhEiIhEREREiIhERISIRABERERERESIzZHYiEREiM2QiIhERIWMiASJlEQABEREREQABEREREREREREiABERESIRESIiIhEBABEiEREAADNlMyIRIiIhEREREREAESEiIWMRIiIRESEiIiIiESIiESJjIhERESIiIREREQAAAAAREREiERERISEiEREiERERESEAIRERIhEhMyIiIiIREREREQERIiIhERERM2RlIhEiZCIiImVkIiIiESIRIjMiIiIiEQAAAAARERERESIiIiIzYxERESIRIiIiIiIjYzMzMyIiEQERABERERERESIREREiM2RkMxERIiJjZIl2YyIRMyIAIhEREQARIRERERERERERERERESFjZTMzIiIiMzNkZGRkZGNmZWMiIhEREQARERERESIiEREhITMiIiIiImNjZGVlZGMiIhEREREhEREREREREREiIiIiIjMzMyIiImNjZGRlZWNjYyIiIhEhM2NjIiIRABERERERERERERERERERESEiI2RjY2NjY2MiERERERERESERIiIiIiIiIiIiIiIiM2RkZGV2ZTNjIhERAREiABEiMyEiIxERERERERERESIiERERERERIjMiIiIzY2RjMxERERERIiMzIiIiIiIiIREREREAERERISIiM2MzESERESIRAAAiESEiIiIRIiIREREREREREREREREiEQAiIxEBEREAESIiIREiIiIhMyIiEREREREAEREAIiIAAREiMzMiIiIhIiIRESIAESIhERERIiEBIiIRAREREQAAEQAAACIiIgAAABEiEREAESERESEiMyIiERERESIRAREiEQARISIRABERISIiIhERIiIREREAImQiEREiISERISIRABEREREAEQAAERERIhEAESIzMzMiERERIhEiIiIREREREQEAIjQzIyIRESERACIiAAABESIzEQARESIiEWMiESIiIiIRISIRERERERERERERERERIiIBAAAAESIiAREREREiIRERERERARERMyEiISIhERERITMiMxEAESIiIiEREREiESIRAREhIiIRIiIREREREREiEQARISERESIiEREREQAAERERIjMiEREiIiIRADMzESEhEREhIiIRIiIRIiIREQAREREiRCEiIhERISIiIhEiIhEiEREREREAEREhEQERERERERERERERIREiMyIRABEhERERMzMiIhEiEQAhERERESIiIREREQARESJDIiIiEREhIiIRESIiESIiEREREREAESERESIRESIREREhERERESIzEQAiQ0MiEQARIiIRIhEiERERERERIiIiIjMRIhERISIREREAESIiIiIiIjMRM0MiEREREREAEREAEQAAEREiIhERERERETMiESJEQyIREQAAABEiIhEzEREhIhEREQAiIREhIiIiIiIRAREiIjMiIiIRIxERIhEiEQEREQERIiIRAREiIhEAABEiIQERIiIRESIiIhEBESIiEQAAEREzESEiEQERIgEjIgERIiIjIhEhIiIRESEiIhEiIhERESIiEREREREREREhESERABEiIREAETMiIiIRERERABEiMzMiIhERIhEzEREAEREBEQAiIiIhESIhISIiIiIiIiIhEREiESIREREREQEREREREREiEQAAAAAAERERERERIiMREREAEUMiEREAABEAAREjEREiIhEiIhEiEREiIiIiERERIiIiIgEhESIiESIREQAiEREREREREREREQARAQAAABEhERERETMiEREREREAEQAAAAARIgAiERERERERERERESEiQzMiIREiEREiIhEREREiEREBACEiEREREREREREREQARABEiMzMhAREREREzIREiEREAACIiEREiIhERABERABEREREAESIRERERIiIiIhERESNEIgAjEQAhEREhAREREREAERERIiIRABERISIREQAREREiIxERERERIjMzIyIhEREAESIhEREAAAAhIhEiAAAAERERIhEAITNDQxEiASIzMyERAREREREAEREAABEREQAAAAARIhERESERIiIRIhEiIhERESIRERERAREiIhEAABEiEREREQARIiIRASIiIiMRQxERESIiESIiABEREQARIiIiIQAAERERAAARAAERERERMxERIhERMyIiIhEhERERAAARIiIiERERERERESERAAARACJEQyMiMxEAETMiIiIiEREREQEiEREiMyIRAAARIiIhABEiEREiIhERIhERIhEiESIiERERABEiIiEiERERABERIjMiEREiEUMiQ0MiISIRIgAAMyIRIhERERERIjMiEREAEQEAAAAAABEREREzIhEhIhEAAAAiEQAAEREAIjMiIgAAERERIjMzMxEiIgARMyIzIzMzIhEiQyIAIhERABEREREiIiIiMzMRERERERERERERESIiEREREREREQAiIhEREQAREREiIiEzIhERMyIiIiIiASIiMzMiQzMiIiIiETMiIiIRABERERERESIhIiIiAAERAAAiIgARESMiEREREQEAIkNDQyIAEREAAAARIiIiIhEAABERACIhAEQiMyIiIiIzQyIhESIRESEAABEREREAEUMiIiIBEQAAESIiIiIRESIiERERESEiQxEiERERIiIRAREiEQAAEQAAADMzIhEREUQiIiIzIiIzQyIiMzMzIhEiIhEREQERITMiEREAABEzQyIhIiIiESEiERERIiIzRCIBERERIiERABEREREAABEhESMiRCIiIkQzITM0ZDQzQyJDIiIRESMzIhEREQERIUMRESIiM0QjEQAiImVlEREiIhERIhEiIiIiEQEiIhERERERIhERESIiESIzESIiIjQRMzQzIiI0IiJDIiIRIiMiIhEREREAADMAESIRQzMAESIiIiJjEREiIhERERERESIiIiIiEREiEQEBERERESJkESIzACIhEWQjZDMiABEzMyEzIxERQxEiIhEREREhITMAESIiMzMAESIiIhEREREiIhEhIhEREQARAQEAERERERERIiIRESJkESIzACIiM2RjM2MRImQzZCI0IhERIhEjIhERERERIkMAESIiIhEiIiIiIiIiIiEzIhEiESIiEREiESEiIiEREQAREREREREiIiIiIiIiM3Z2ZDMRImMiZGQjIRERIiJDABEREQAAISIRIiIiESIiMyIRIiMiIjMiESIRIjMzIgEBESIiEQARIREAAAARERERESIiIiIiM3Z2ZGMREREhd3ZjIgARIiMzABEREQERIhEiIjMiESJkZWRjZGMiYyIREREiIhEiMyIAEQAAABEAERERIhEhIiIRM2QRIiIRImQzZGMhIiJjdnZkIiIzESIzIQERERERIhERESIiESIiY2QiEREzIhEzIhERImNkEQARIhEhACEAABERIhERESIzZGUiIiIiIjMiImNlZWVkZDMzIjMzIxEiERERERERESIRERERISIiIjMiIiIzISIRISIjI2V2IhEAESIiERERIyIREREiIiIiImMiIzMzIiIiIjRkZDMzQxEiZBERIhEiERERERERESIRESNDESIiIhEiIiIzESEiISIjM2RjIiIREREREREiERERERERESERImMiMyMiIjMzZGRkMzMzIiIzMyIRMxEiERERERERESIiIiIhMyIRIiIiESEjIhEiIiJDQyIzIiIiIhEAIhEAABEREQERESIiIiIiIjMiMzNkZGRkYzMiIjMRIiIiMyIiEREREREAEREREQARIiIRIiIiIREiMyIRIiIhESEhIiIiEREREREiIiIiIiIiIiIRESEiIiEiM2RkZDMzRCIjMyIiMyIiIiIiERERERERIiIiIiERESIiEQAAEQARETMiESIRESERIRERERERIiMiEREhIiIiM2QzIiMiMzMzZDMiIiIzRBEzMyIzESIiIiIRABEREREAABERIiERERERIhERESIiEREiIiIiIhERIhEiIiIiIhERIiIhESIRESJlZDMzIiIzIiIiMzMiQxEiIhEBAREAESIiERERERERIhEREREBEREAERERESIiIgARISIiIiMjIiIiIiERERERIiIRABERMyJkIhEiIiIiISMzIiIzQxEAITMjIgAiIiIBABERERERERERIiIRESIiEREREREREREREREREREREREAESERIiIREQABIiIzMzNjIjMiERERIREhESIREREAMyIzMyIRABEREQEREREAEREiAAAAABERAQAhIiIiIiIREREREREiEQAiMzMiIiERESIiQyJEZWVlMzMRESIzIhEBESIREREiMzMiESMiEREREREREREREREhIhEiMxERIiIRESIiIhEREREREQAAACIzIhEiIhEREREiIiJkZGQiIRERASIhERERIiIiERERIiIiIhERAAAAABEREREAERERITMiIiIiIjMzEQARESIiERERESIiERERABEiERERESEiEUMiMyIRABEhIxEREREhIhEREQEiMyIiIhEjIgERAQAREQEAERERACIzIiIiEREhESIhESEiERERESIjMzMzIREhIRERERERIyIiIiEAESIiIREAESEiIhERIREiIhEiIiIiIREAABERERERERERIhEiIhERIhERESIzIiIhEREhERERISIzMyIiEREREREiIhERERERESIiIiIjIhEhEREREREAAAAiIwAREQARIhEREREAABERERERESIiEREiMyIRESIiEREiERERIhEBEREiERERESEiACIhARERMzMzIhEiQxERIREAERERIREiIhEiIhEiEREREREAESIiMyIRIgAhIiIiIiIREQAAABEiIiIhEREAACERERERARERESIiEQARESEREREiREMiERERESIhIhEhIhEhEREREREREQEBERERIiIRESIiERERAAARIiIBERERESEzQyMREREiIREhERERISERIgEREQEBIiIRESIiISIREREiEREiEREiIyIRABEREQEAAAAAERERESIRIREREREREREiMyIRASIjIhERERERAAAAEREAEREREREREREREQAAESIiISIiIREiIhERESEREREAAAEREREAAAAAAAAAAAARIREAARERABEREREBERERAAAAEREAEREBAAERABEBERERABEBERERIhEREREhIkMRABERERERAAAAABERACEREREREREREREREREREQAAAAAAAREhEQEBAAABAQAAAAABAREBEQEBERERAQAAEQABAAAAAAAAESIREREREQEREREBESEAABEREREBAQEBAAERAREBASEiIQAAACJkEQAAETMAAAAiIiIAAAAzIgAAADMRAAAiYyEAAAAiIiIRAAAAAQEBAQEBAQEREREAAAAAAAAAAAAAAAAAAAAAABEREQAAACIjEQAAETMRAAARABERABEiEQEAADMRAAAiIiIAAAEREREAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAERAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export class WorldMap {
  readonly element: HTMLElement

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly openButton: HTMLButtonElement
  private readonly closeButton: HTMLButtonElement
  private readonly onOpenChange: (open: boolean) => void
  private readonly mapBytes: Uint8Array
  private open = false
  private staticLayer: HTMLCanvasElement | null = null

  constructor(parent: HTMLElement, world: WorldState, onOpenChange: (open: boolean) => void) {
    this.onOpenChange = onOpenChange
    const decoded = atob(MAP_DATA)
    this.mapBytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0))

    this.openButton = document.createElement('button')
    this.openButton.className = 'world-map-button'
    this.openButton.type = 'button'
    this.openButton.textContent = 'M · карта'
    this.openButton.setAttribute('aria-label', 'Открыть карту мира')
    parent.append(this.openButton)

    this.element = document.createElement('section')
    this.element.className = 'world-map'
    this.element.setAttribute('aria-hidden', 'true')
    this.element.innerHTML = `
      <div class="world-map__frame">
        <header class="world-map__header">
          <div>
            <span class="world-map__eyebrow">карта мира · 4 сегмента</span>
            <strong>the drowned valley</strong>
          </div>
          <button class="world-map__close" type="button" aria-label="Закрыть карту">M / ESC</button>
        </header>
        <canvas class="world-map__canvas" aria-label="Четырёхсегментная карта игрового мира"></canvas>
        <footer class="world-map__legend">
          <span><i class="world-map__dot world-map__dot--player"></i>ты</span>
          <span><i class="world-map__dot world-map__dot--enemy"></i>враг</span>
          <span>◰ лагерь</span>
          <span>═ переправа</span>
          <span>⌂ убежище</span>
          <span>▣ руины</span>
        </footer>
      </div>
    `

    const canvas = this.element.querySelector<HTMLCanvasElement>('canvas')
    const close = this.element.querySelector<HTMLButtonElement>('.world-map__close')
    if (!canvas || !close) throw new Error('World map nodes are unavailable')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('World map canvas context is unavailable')

    this.canvas = canvas
    this.ctx = ctx
    this.closeButton = close
    parent.append(this.element)

    this.openButton.addEventListener('click', this.handleToggle)
    this.closeButton.addEventListener('click', this.handleClose)
    this.resize()
    this.draw(world)
  }

  get isOpen(): boolean {
    return this.open
  }

  toggle(world: WorldState): void {
    this.setOpen(!this.open, world)
  }

  close(world: WorldState): void {
    this.setOpen(false, world)
  }

  update(world: WorldState): void {
    if (this.open) this.draw(world)
  }

  destroy(): void {
    this.openButton.removeEventListener('click', this.handleToggle)
    this.closeButton.removeEventListener('click', this.handleClose)
    this.openButton.remove()
    this.element.remove()
  }

  private readonly handleToggle = (): void => {
    this.element.dispatchEvent(new CustomEvent('world-map:toggle', { bubbles: true }))
  }

  private readonly handleClose = (): void => {
    this.element.dispatchEvent(new CustomEvent('world-map:close', { bubbles: true }))
  }

  private setOpen(open: boolean, world: WorldState): void {
    if (this.open === open) return
    this.open = open
    this.element.classList.toggle('world-map--open', open)
    this.element.setAttribute('aria-hidden', String(!open))
    this.openButton.classList.toggle('world-map-button--hidden', open)
    if (open) {
      this.resize()
      this.draw(world)
    }
    this.onOpenChange(open)
  }

  private resize(): void {
    const size = Math.min(900, Math.max(420, Math.floor(Math.min(window.innerWidth * 0.9, window.innerHeight * 0.8))))
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.floor(size * ratio)
    this.canvas.height = Math.floor(size * ratio)
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size}px`
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.staticLayer = null
  }

  private mapX(x: number, size: number): number {
    // East is deliberately on the left so the forest/camp quadrant matches the illustrated atlas.
    return ((WORLD_LIMIT - x) / (WORLD_LIMIT * 2)) * size
  }

  private mapY(z: number, size: number): number {
    return size - ((z + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * size
  }

  private draw(world: WorldState): void {
    const size = this.canvas.clientWidth
    if (size <= 0) return
    if (!this.staticLayer) this.staticLayer = this.buildStaticLayer(size)

    this.ctx.clearRect(0, 0, size, size)
    this.ctx.drawImage(this.staticLayer, 0, 0, size, size)

    const px = this.mapX(world.player.x, size)
    const py = this.mapY(world.player.z, size)

    const segmentLeft = px < size * 0.5 ? 0 : size * 0.5
    const segmentTop = py < size * 0.5 ? 0 : size * 0.5
    this.ctx.save()
    this.ctx.fillStyle = 'rgba(232,181,63,.035)'
    this.ctx.strokeStyle = 'rgba(235,184,67,.25)'
    this.ctx.lineWidth = 1.2
    this.ctx.fillRect(segmentLeft, segmentTop, size * 0.5, size * 0.5)
    this.ctx.strokeRect(segmentLeft + 1, segmentTop + 1, size * 0.5 - 2, size * 0.5 - 2)
    this.ctx.restore()

    for (const enemy of world.enemies) {
      const ex = this.mapX(enemy.x, size)
      const ey = this.mapY(enemy.z, size)
      this.ctx.beginPath()
      this.ctx.arc(ex, ey, Math.max(1.6, size * 0.0028), 0, Math.PI * 2)
      this.ctx.fillStyle = 'rgba(191,74,79,.78)'
      this.ctx.shadowColor = 'rgba(191,52,58,.4)'
      this.ctx.shadowBlur = 4
      this.ctx.fill()
    }

    this.ctx.shadowBlur = 0
    this.ctx.save()
    this.ctx.translate(px, py)
    this.ctx.rotate(-world.player.facing)
    this.ctx.shadowColor = 'rgba(255,196,65,.95)'
    this.ctx.shadowBlur = Math.max(8, size * 0.016)
    this.ctx.fillStyle = '#ffd86b'
    this.ctx.strokeStyle = '#fff0b2'
    this.ctx.lineWidth = Math.max(1, size * 0.0017)
    this.ctx.beginPath()
    this.ctx.moveTo(0, -Math.max(7, size * 0.011))
    this.ctx.lineTo(Math.max(5, size * 0.007), Math.max(6, size * 0.009))
    this.ctx.lineTo(0, Math.max(3, size * 0.004))
    this.ctx.lineTo(-Math.max(5, size * 0.007), Math.max(6, size * 0.009))
    this.ctx.closePath()
    this.ctx.fill()
    this.ctx.stroke()
    this.ctx.restore()

    this.ctx.shadowBlur = 0
    this.ctx.fillStyle = 'rgba(235,224,190,.78)'
    this.ctx.font = `${Math.max(10, Math.floor(size * 0.014))}px ui-monospace, monospace`
    this.ctx.textAlign = 'left'
    this.ctx.fillText(`${this.segmentName(world.player.x, world.player.z)} · ${world.player.x.toFixed(0)}, ${world.player.z.toFixed(0)}`, 15, size - 15)
  }

  private segmentName(x: number, z: number): string {
    if (x >= 0 && z >= 0) return 'лесной лагерь'
    if (x < 0 && z >= 0) return 'северная переправа'
    if (x >= 0 && z < 0) return 'нижний лесной тракт'
    return 'руины у ручья'
  }

  private buildStaticLayer(size: number): HTMLCanvasElement {
    const layer = document.createElement('canvas')
    layer.width = size
    layer.height = size
    const ctx = layer.getContext('2d')
    if (!ctx) return layer

    ctx.fillStyle = '#050908'
    ctx.fillRect(0, 0, size, size)

    const cellW = size / MAP_COLS
    const cellH = size / MAP_ROWS
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${Math.ceil(cellH * 1.2)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

    for (let row = 0; row < MAP_ROWS; row += 1) {
      for (let col = 0; col < MAP_COLS; col += 1) {
        const packed = this.mapBytes[row * MAP_COLS + col] ?? 0
        const paletteIndex = Math.min(MAP_PALETTE.length - 1, packed >> 4)
        const glyphIndex = Math.min(MAP_GLYPHS.length - 1, packed & 0x0f)
        const glyph = MAP_GLYPHS[glyphIndex] ?? ' '
        if (glyph === ' ') continue
        ctx.fillStyle = MAP_PALETTE[paletteIndex] ?? MAP_PALETTE[0]
        ctx.fillText(glyph, (col + 0.5) * cellW, (row + 0.5) * cellH)
      }
    }

    const vignette = ctx.createRadialGradient(size * 0.5, size * 0.47, size * 0.24, size * 0.5, size * 0.5, size * 0.72)
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, 'rgba(0,4,3,.47)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, size, size)

    ctx.save()
    ctx.strokeStyle = 'rgba(217,151,43,.32)'
    ctx.lineWidth = 1
    ctx.setLineDash([Math.max(3, size * 0.004), Math.max(8, size * 0.012)])
    ctx.beginPath()
    ctx.moveTo(size * 0.5, 8)
    ctx.lineTo(size * 0.5, size - 8)
    ctx.moveTo(8, size * 0.5)
    ctx.lineTo(size - 8, size * 0.5)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.strokeStyle = 'rgba(221,158,48,.58)'
    ctx.lineWidth = Math.max(1, size * 0.0016)
    ctx.strokeRect(4.5, 4.5, size - 9, size - 9)
    ctx.strokeStyle = 'rgba(221,158,48,.18)'
    ctx.strokeRect(9.5, 9.5, size - 19, size - 19)
    ctx.restore()

    return layer
  }
}
