import type { WorldState } from '../../simulation/WorldState'
import {
  WORLD_BRIDGES,
  WORLD_FIRES,
  WORLD_LIMIT,
  WORLD_ROADS,
  WORLD_ZONES,
  RIVER_HALF_WIDTH,
  riverCenterZ,
  terrainHeightAt,
} from '../../world/WorldLayout'

export class WorldMap {
  readonly element: HTMLElement

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly openButton: HTMLButtonElement
  private readonly closeButton: HTMLButtonElement
  private readonly onOpenChange: (open: boolean) => void
  private open = false
  private staticLayer: HTMLCanvasElement | null = null

  constructor(parent: HTMLElement, world: WorldState, onOpenChange: (open: boolean) => void) {
    this.onOpenChange = onOpenChange

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
            <span class="world-map__eyebrow">карта мира</span>
            <strong>the drowned valley</strong>
          </div>
          <button class="world-map__close" type="button" aria-label="Закрыть карту">M / ESC</button>
        </header>
        <canvas class="world-map__canvas" aria-label="Карта игрового мира"></canvas>
        <footer class="world-map__legend">
          <span><i class="world-map__dot world-map__dot--player"></i>ты</span>
          <span><i class="world-map__dot world-map__dot--enemy"></i>враг</span>
          <span>━ дорога</span>
          <span>═ мост</span>
          <span>▲ монолит</span>
          <span>□ руины</span>
          <span>▣ башня</span>
          <span>· лес</span>
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
    if (!this.open) return
    this.draw(world)
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
    const size = Math.min(860, Math.max(420, Math.floor(Math.min(window.innerWidth * 0.86, window.innerHeight * 0.76))))
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.floor(size * ratio)
    this.canvas.height = Math.floor(size * ratio)
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size}px`
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.staticLayer = null
  }

  private draw(world: WorldState): void {
    const cssSize = this.canvas.clientWidth
    if (cssSize <= 0) return

    if (!this.staticLayer) this.staticLayer = this.buildStaticLayer(cssSize, world)
    this.ctx.clearRect(0, 0, cssSize, cssSize)
    this.ctx.drawImage(this.staticLayer, 0, 0, cssSize, cssSize)

    const map = (value: number): number => ((value + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * cssSize
    const px = map(world.player.x)
    const py = cssSize - map(world.player.z)

    this.ctx.save()
    this.ctx.translate(px, py)
    this.ctx.rotate(-world.player.facing)
    this.ctx.beginPath()
    this.ctx.moveTo(0, -8)
    this.ctx.lineTo(5.5, 6)
    this.ctx.lineTo(0, 3.5)
    this.ctx.lineTo(-5.5, 6)
    this.ctx.closePath()
    this.ctx.fillStyle = '#eef5ef'
    this.ctx.shadowColor = 'rgba(220,255,230,.55)'
    this.ctx.shadowBlur = 9
    this.ctx.fill()
    this.ctx.restore()

    this.ctx.shadowBlur = 0
    for (const enemy of world.enemies) {
      const ex = map(enemy.x)
      const ey = cssSize - map(enemy.z)
      this.ctx.beginPath()
      this.ctx.arc(ex, ey, 2.4, 0, Math.PI * 2)
      this.ctx.fillStyle = 'rgba(188,72,78,.8)'
      this.ctx.fill()
    }

    this.ctx.font = '11px ui-monospace, monospace'
    this.ctx.fillStyle = 'rgba(235,240,236,.72)'
    this.ctx.textAlign = 'left'
    this.ctx.fillText(`${world.currentZone.name} · ${world.player.x.toFixed(0)}, ${world.player.z.toFixed(0)}`, 14, cssSize - 14)
  }

  private buildStaticLayer(size: number, world: WorldState): HTMLCanvasElement {
    const layer = document.createElement('canvas')
    layer.width = size
    layer.height = size
    const ctx = layer.getContext('2d')
    if (!ctx) return layer

    const map = (value: number): number => ((value + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * size
    const steps = 92
    const cell = size / steps

    ctx.fillStyle = '#070b08'
    ctx.fillRect(0, 0, size, size)

    for (let gy = 0; gy < steps; gy += 1) {
      for (let gx = 0; gx < steps; gx += 1) {
        const x = -WORLD_LIMIT + ((gx + 0.5) / steps) * WORLD_LIMIT * 2
        const z = -WORLD_LIMIT + ((gy + 0.5) / steps) * WORLD_LIMIT * 2
        const h = terrainHeightAt(x, z)
        const t = Math.max(0, Math.min(1, (h + 0.7) / 5.1))
        const base = 14 + Math.round(t * 24)
        ctx.fillStyle = `rgb(${base - 3},${base + 7},${base})`
        ctx.fillRect(gx * cell, size - (gy + 1) * cell, Math.ceil(cell + 1), Math.ceil(cell + 1))
      }
    }

    const riverPath = new Path2D()
    let first = true
    for (let x = -WORLD_LIMIT - 8; x <= WORLD_LIMIT + 8; x += 1.25) {
      const z = riverCenterZ(x)
      const sx = map(x)
      const sy = size - map(z)
      if (first) {
        riverPath.moveTo(sx, sy)
        first = false
      } else riverPath.lineTo(sx, sy)
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(7, (RIVER_HALF_WIDTH * 2 / (WORLD_LIMIT * 2)) * size)
    ctx.strokeStyle = 'rgba(44,70,79,.72)'
    ctx.stroke(riverPath)
    ctx.lineWidth = Math.max(1.5, size * 0.003)
    ctx.strokeStyle = 'rgba(133,170,181,.56)'
    ctx.stroke(riverPath)

    for (const road of WORLD_ROADS) {
      ctx.beginPath()
      road.points.forEach((point, index) => {
        const x = map(point[0])
        const y = size - map(point[1])
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.lineWidth = Math.max(2, (road.width / (WORLD_LIMIT * 2)) * size)
      ctx.strokeStyle = 'rgba(178,157,119,.62)'
      ctx.stroke()
      ctx.lineWidth = Math.max(0.8, ctx.lineWidth * 0.24)
      ctx.strokeStyle = 'rgba(231,216,180,.35)'
      ctx.stroke()
    }

    for (const bridge of WORLD_BRIDGES) {
      const x = map(bridge.x)
      const y = size - map(bridge.z)
      const scale = size / (WORLD_LIMIT * 2)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(-bridge.rotation)
      ctx.fillStyle = bridge.style === 'stone' ? 'rgba(218,211,190,.9)' : 'rgba(166,116,73,.88)'
      ctx.fillRect(-bridge.width * scale * 0.5, -bridge.length * scale * 0.5, bridge.width * scale, bridge.length * scale)
      ctx.restore()
    }

    ctx.lineWidth = Math.max(1, size * 0.002)
    for (const zone of WORLD_ZONES) {
      const zx = map(zone.x)
      const zy = size - map(zone.z)
      const zr = (zone.radius / (WORLD_LIMIT * 2)) * size
      ctx.beginPath()
      ctx.arc(zx, zy, zr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(188,204,193,.1)'
      ctx.setLineDash([4, 6])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(219,228,221,.5)'
      ctx.font = `${Math.max(9, Math.floor(size * 0.015))}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.fillText(zone.name, zx, zy - zr - 5)
    }

    for (const landmark of world.trees) {
      const x = map(landmark.x)
      const y = size - map(landmark.z)
      if (landmark.kind === 'tree') {
        ctx.fillStyle = 'rgba(104,142,109,.58)'
        ctx.fillRect(x, y, 1.5, 1.5)
      } else if (landmark.kind === 'ruin' || landmark.kind === 'gate') {
        ctx.strokeStyle = 'rgba(202,193,174,.74)'
        ctx.strokeRect(x - 2.5, y - 2.5, 5, 5)
      } else if (landmark.kind === 'tower') {
        ctx.fillStyle = 'rgba(204,199,184,.78)'
        ctx.fillRect(x - 2.8, y - 2.8, 5.6, 5.6)
        ctx.strokeStyle = 'rgba(238,232,214,.6)'
        ctx.strokeRect(x - 3.5, y - 3.5, 7, 7)
      } else if (landmark.kind === 'monolith') {
        ctx.fillStyle = 'rgba(218,215,199,.82)'
        ctx.beginPath()
        ctx.moveTo(x, y - 4)
        ctx.lineTo(x + 3.5, y + 3)
        ctx.lineTo(x - 3.5, y + 3)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillStyle = 'rgba(148,153,145,.54)'
        ctx.beginPath()
        ctx.arc(x, y, Math.min(2.5, 0.8 + landmark.radius * 0.45), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const fire of WORLD_FIRES) {
      const x = map(fire.x)
      const y = size - map(fire.z)
      ctx.beginPath()
      ctx.arc(x, y, 2.1, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(230,150,55,.9)'
      ctx.shadowColor = 'rgba(235,137,42,.6)'
      ctx.shadowBlur = 7
      ctx.fill()
    }
    ctx.shadowBlur = 0

    ctx.strokeStyle = 'rgba(224,233,226,.22)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1)

    return layer
  }
}
