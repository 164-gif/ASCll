import type { WorldState } from '../../simulation/WorldState'
import {
  WORLD_BRIDGES,
  WORLD_LIMIT,
  WORLD_ROADS,
  WORLD_STRUCTURES,
  WORLD_ZONES,
  riverCenterZ,
  terrainHeightAt,
  type WorldStructure,
} from '../../world/WorldLayout'

function seeded(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

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
    this.openButton.className = 'world-map-button world-map-button--v2'
    this.openButton.type = 'button'
    this.openButton.textContent = 'M · карта'
    this.openButton.setAttribute('aria-label', 'Открыть карту мира')
    parent.append(this.openButton)

    this.element = document.createElement('section')
    this.element.className = 'world-map world-map-v2'
    this.element.setAttribute('aria-hidden', 'true')
    this.element.innerHTML = `
      <style>
        .world-map-v2 {
          background:
            radial-gradient(circle at 50% 45%, rgba(37,48,39,.35), rgba(3,6,4,.94) 68%),
            rgba(2,4,3,.94);
          backdrop-filter: blur(6px);
        }
        .world-map-v2 .world-map__frame {
          width: min(92vw, 980px);
          max-height: 94vh;
          padding: 18px 18px 13px;
          border: 1px solid rgba(196,205,190,.3);
          background:
            linear-gradient(135deg, rgba(54,61,51,.18), transparent 32%),
            rgba(7,10,8,.96);
          box-shadow: 0 28px 90px rgba(0,0,0,.6), inset 0 0 80px rgba(42,54,43,.12);
        }
        .world-map-v2 .world-map__header {
          padding: 2px 2px 12px;
          border-bottom: 1px solid rgba(210,218,205,.11);
        }
        .world-map-v2 .world-map__header strong {
          display: block;
          margin-top: 4px;
          font: 500 clamp(14px,1.8vw,21px) ui-monospace, monospace;
          letter-spacing: .12em;
          color: rgba(226,231,221,.82);
          text-transform: uppercase;
        }
        .world-map-v2 .world-map__eyebrow {
          color: rgba(198,207,193,.4);
          letter-spacing: .24em;
        }
        .world-map-v2 .world-map__canvas {
          display: block;
          margin: 14px auto 10px;
          max-width: 100%;
          border: 1px solid rgba(204,213,199,.13);
          box-shadow: inset 0 0 34px rgba(0,0,0,.62);
          background: #0b100d;
        }
        .world-map-v2 .world-map__legend {
          gap: 13px;
          padding-top: 8px;
          border-top: 1px solid rgba(210,218,205,.09);
          color: rgba(209,216,205,.45);
        }
        .world-map-v2 .world-map__close {
          border: 1px solid rgba(207,216,204,.17);
          background: rgba(255,255,255,.02);
        }
        .world-map-button--v2 {
          border: 1px solid rgba(215,226,214,.12);
          background: rgba(5,8,6,.62);
          backdrop-filter: blur(7px);
        }
      </style>
      <div class="world-map__frame">
        <header class="world-map__header">
          <div>
            <span class="world-map__eyebrow">карта долины</span>
            <strong>the drowned valley · survey map</strong>
          </div>
          <button class="world-map__close" type="button" aria-label="Закрыть карту">M / ESC</button>
        </header>
        <canvas class="world-map__canvas" aria-label="Иллюстрированная карта игрового мира"></canvas>
        <footer class="world-map__legend">
          <span><i class="world-map__dot world-map__dot--player"></i>ты</span>
          <span>━━ тракт</span>
          <span>══ мост</span>
          <span>▣ крупное строение</span>
          <span>♠ лес</span>
          <span>△ монолит</span>
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
    const size = Math.min(860, Math.max(420, Math.floor(Math.min(window.innerWidth * 0.84, window.innerHeight * 0.76))))
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.floor(size * ratio)
    this.canvas.height = Math.floor(size * ratio)
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size}px`
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.staticLayer = null
  }

  private draw(world: WorldState): void {
    const size = this.canvas.clientWidth
    if (size <= 0) return
    if (!this.staticLayer) this.staticLayer = this.buildStaticLayer(size, world)

    this.ctx.clearRect(0, 0, size, size)
    this.ctx.drawImage(this.staticLayer, 0, 0, size, size)

    const map = (value: number): number => ((value + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * size
    const px = map(world.player.x)
    const py = size - map(world.player.z)

    this.ctx.save()
    this.ctx.translate(px, py)
    this.ctx.rotate(-world.player.facing)
    this.ctx.shadowColor = 'rgba(235,248,232,.72)'
    this.ctx.shadowBlur = 11
    this.ctx.fillStyle = '#edf3ea'
    this.ctx.beginPath()
    this.ctx.moveTo(0, -9)
    this.ctx.lineTo(6, 7)
    this.ctx.lineTo(0, 4)
    this.ctx.lineTo(-6, 7)
    this.ctx.closePath()
    this.ctx.fill()
    this.ctx.restore()
    this.ctx.shadowBlur = 0

    for (const enemy of world.enemies) {
      const ex = map(enemy.x)
      const ey = size - map(enemy.z)
      this.ctx.beginPath()
      this.ctx.arc(ex, ey, 1.8, 0, Math.PI * 2)
      this.ctx.fillStyle = 'rgba(153,63,67,.65)'
      this.ctx.fill()
    }

    this.ctx.fillStyle = 'rgba(231,237,227,.73)'
    this.ctx.font = '11px ui-monospace, monospace'
    this.ctx.textAlign = 'left'
    this.ctx.fillText(`${world.currentZone.name}  ·  ${world.player.x.toFixed(0)}, ${world.player.z.toFixed(0)}`, 16, size - 16)
  }

  private buildStaticLayer(size: number, world: WorldState): HTMLCanvasElement {
    const layer = document.createElement('canvas')
    layer.width = size
    layer.height = size
    const ctx = layer.getContext('2d')
    if (!ctx) return layer

    const random = seeded(0x6d617056)
    const map = (value: number): number => ((value + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * size
    const scale = size / (WORLD_LIMIT * 2)

    const bg = ctx.createRadialGradient(size * 0.48, size * 0.43, 20, size * 0.5, size * 0.5, size * 0.74)
    bg.addColorStop(0, '#18221a')
    bg.addColorStop(0.55, '#111812')
    bg.addColorStop(1, '#080c09')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size, size)

    for (let i = 0; i < 520; i += 1) {
      const alpha = 0.025 + random() * 0.035
      ctx.fillStyle = `rgba(208,218,200,${alpha})`
      const x = random() * size
      const y = random() * size
      ctx.fillRect(x, y, 0.6 + random() * 1.8, 0.5 + random() * 1.2)
    }

    this.drawTerrainWash(ctx, size, map)
    this.drawContours(ctx, size, map)

    const river = new Path2D()
    let first = true
    for (let x = -WORLD_LIMIT - 4; x <= WORLD_LIMIT + 4; x += 1.2) {
      const sx = map(x)
      const sy = size - map(riverCenterZ(x))
      if (first) {
        river.moveTo(sx, sy)
        first = false
      } else river.lineTo(sx, sy)
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(10, 13.5 * scale)
    ctx.strokeStyle = 'rgba(18,45,54,.95)'
    ctx.stroke(river)
    ctx.lineWidth = Math.max(2, 2.5 * scale)
    ctx.strokeStyle = 'rgba(135,176,183,.55)'
    ctx.stroke(river)
    ctx.setLineDash([8, 13])
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(211,232,230,.25)'
    ctx.stroke(river)
    ctx.setLineDash([])

    for (const road of WORLD_ROADS) {
      ctx.beginPath()
      road.points.forEach((point, index) => {
        const x = map(point[0])
        const y = size - map(point[1])
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.lineWidth = Math.max(5, road.width * scale * 1.45)
      ctx.strokeStyle = 'rgba(25,22,18,.88)'
      ctx.stroke()
      ctx.lineWidth = Math.max(2.2, road.width * scale * 0.78)
      ctx.strokeStyle = 'rgba(173,153,115,.76)'
      ctx.stroke()
      ctx.lineWidth = Math.max(0.7, road.width * scale * 0.16)
      ctx.strokeStyle = 'rgba(231,216,179,.42)'
      ctx.stroke()
    }

    this.drawForestMasses(ctx, size, map, world)
    this.drawStructures(ctx, size, map)

    for (const bridge of WORLD_BRIDGES) {
      const x = map(bridge.x)
      const y = size - map(bridge.z)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(-bridge.rotation)
      ctx.fillStyle = bridge.style === 'stone' ? '#c7c0a9' : '#a2744e'
      ctx.strokeStyle = 'rgba(18,18,14,.8)'
      ctx.lineWidth = 2
      ctx.fillRect(-bridge.width * scale * 0.6, -bridge.length * scale * 0.5, bridge.width * scale * 1.2, bridge.length * scale)
      ctx.strokeRect(-bridge.width * scale * 0.6, -bridge.length * scale * 0.5, bridge.width * scale * 1.2, bridge.length * scale)
      ctx.restore()
    }

    for (const landmark of world.trees) {
      if (landmark.kind !== 'monolith') continue
      const x = map(landmark.x)
      const y = size - map(landmark.z)
      ctx.fillStyle = 'rgba(213,213,196,.82)'
      ctx.beginPath()
      ctx.moveTo(x, y - 4.5)
      ctx.lineTo(x + 3.3, y + 3.2)
      ctx.lineTo(x - 3.3, y + 3.2)
      ctx.closePath()
      ctx.fill()
    }

    for (const zone of WORLD_ZONES.slice(1)) {
      const x = map(zone.x)
      const y = size - map(zone.z)
      ctx.fillStyle = 'rgba(230,235,224,.64)'
      ctx.font = `${Math.max(10, Math.floor(size * 0.0145))}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.shadowColor = 'rgba(0,0,0,.85)'
      ctx.shadowBlur = 5
      ctx.fillText(zone.name, x, y - zone.radius * scale * 0.72)
      ctx.shadowBlur = 0
    }

    this.drawCompass(ctx, size)
    this.drawBorder(ctx, size)
    return layer
  }

  private drawTerrainWash(ctx: CanvasRenderingContext2D, size: number, map: (value: number) => number): void {
    const zones = [
      { x: 50, z: 25, r: 43, c: 'rgba(24,62,34,.32)' },
      { x: -10, z: 52, r: 37, c: 'rgba(84,104,58,.22)' },
      { x: -49, z: -15, r: 34, c: 'rgba(75,81,68,.25)' },
      { x: 36, z: -52, r: 38, c: 'rgba(88,87,75,.22)' },
    ]
    for (const zone of zones) {
      const x = map(zone.x)
      const y = size - map(zone.z)
      const radius = (zone.r / (WORLD_LIMIT * 2)) * size
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
      grad.addColorStop(0, zone.c)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
  }

  private drawContours(ctx: CanvasRenderingContext2D, size: number, map: (value: number) => number): void {
    ctx.strokeStyle = 'rgba(194,207,191,.055)'
    ctx.lineWidth = 1
    const levels = [0.2, 0.8, 1.5, 2.3, 3.1]
    const step = 4
    for (const level of levels) {
      for (let z = -WORLD_LIMIT; z < WORLD_LIMIT; z += step) {
        ctx.beginPath()
        let drawing = false
        for (let x = -WORLD_LIMIT; x <= WORLD_LIMIT; x += 2) {
          const h = terrainHeightAt(x, z)
          if (Math.abs(h - level) < 0.11) {
            const sx = map(x)
            const sy = size - map(z)
            if (!drawing) {
              ctx.moveTo(sx, sy)
              drawing = true
            } else ctx.lineTo(sx, sy)
          } else drawing = false
        }
        ctx.stroke()
      }
    }
  }

  private drawForestMasses(
    ctx: CanvasRenderingContext2D,
    size: number,
    map: (value: number) => number,
    world: WorldState,
  ): void {
    const trees = world.trees.filter((item) => item.kind === 'tree')
    for (let index = 0; index < trees.length; index += 1) {
      const tree = trees[index]!
      const x = map(tree.x)
      const y = size - map(tree.z)
      const r = Math.max(1.3, tree.radius * size / 184 * 2.1)
      ctx.fillStyle = index % 3 === 0 ? 'rgba(35,75,44,.72)' : 'rgba(26,59,35,.68)'
      ctx.beginPath()
      ctx.moveTo(x, y - r * 1.5)
      ctx.lineTo(x + r, y + r * 0.9)
      ctx.lineTo(x - r, y + r * 0.9)
      ctx.closePath()
      ctx.fill()
    }
  }

  private drawStructures(ctx: CanvasRenderingContext2D, size: number, map: (value: number) => number): void {
    const scale = size / (WORLD_LIMIT * 2)
    for (const structure of WORLD_STRUCTURES) this.drawStructure(ctx, map, scale, structure)
  }

  private drawStructure(
    ctx: CanvasRenderingContext2D,
    map: (value: number) => number,
    scale: number,
    structure: WorldStructure,
  ): void {
    const x = map(structure.x)
    const y = this.canvas.clientWidth - map(structure.z)
    const w = structure.width * scale
    const d = structure.depth * scale

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-structure.rotation)
    ctx.fillStyle = 'rgba(188,184,165,.74)'
    ctx.strokeStyle = 'rgba(226,220,197,.62)'
    ctx.lineWidth = 1.2

    if (structure.kind === 'abbey' || structure.kind === 'highland-fort') {
      ctx.strokeRect(-w * 0.5, -d * 0.5, w, d)
      ctx.fillRect(-w * 0.5, -d * 0.5, w * 0.08, d)
      ctx.fillRect(w * 0.42, -d * 0.5, w * 0.08, d)
      ctx.fillRect(-w * 0.5, d * 0.42, w, d * 0.08)
      for (const sx of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(sx * w * 0.37, -d * 0.34, Math.max(3, w * 0.1), 0, Math.PI * 2)
        ctx.fill()
      }
      if (structure.kind === 'abbey') {
        ctx.strokeRect(-w * 0.2, -d * 0.08, w * 0.4, d * 0.48)
      } else {
        ctx.beginPath()
        ctx.arc(0, d * 0.3, Math.max(3, w * 0.09), 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (structure.kind === 'forest-shrine') {
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(w, d) * 0.44, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, Math.max(4, w * 0.13), 0, Math.PI * 2)
      ctx.fill()
      for (let i = 0; i < 8; i += 1) {
        const a = i / 8 * Math.PI * 2
        ctx.fillRect(Math.cos(a) * w * 0.32 - 1, Math.sin(a) * d * 0.32 - 1, 2, 2)
      }
    } else {
      ctx.strokeRect(-w * 0.5, -d * 0.5, w, d)
      ctx.fillRect(-w * 0.5, d * 0.4, w, d * 0.1)
      ctx.beginPath()
      ctx.arc(0, d * 0.28, Math.max(2.5, w * 0.1), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    ctx.fillStyle = 'rgba(227,225,208,.8)'
    ctx.font = `600 ${Math.max(9, Math.floor(this.canvas.clientWidth * 0.013))}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.shadowColor = 'rgba(0,0,0,.9)'
    ctx.shadowBlur = 5
    ctx.fillText(structure.name, x, y + d * 0.72 + 12)
    ctx.shadowBlur = 0
  }

  private drawCompass(ctx: CanvasRenderingContext2D, size: number): void {
    const x = size - 33
    const y = 34
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = 'rgba(218,225,214,.38)'
    ctx.fillStyle = 'rgba(230,236,226,.65)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, -13)
    ctx.lineTo(5, 7)
    ctx.lineTo(0, 4)
    ctx.lineTo(-5, 7)
    ctx.closePath()
    ctx.stroke()
    ctx.font = '9px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.fillText('N', 0, -17)
    ctx.restore()
  }

  private drawBorder(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.strokeStyle = 'rgba(221,228,215,.25)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1)

    const m = 13
    const l = 18
    ctx.strokeStyle = 'rgba(226,231,220,.36)'
    const corners = [
      [m, m, 1, 1],
      [size - m, m, -1, 1],
      [m, size - m, 1, -1],
      [size - m, size - m, -1, -1],
    ] as const
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath()
      ctx.moveTo(x, y + sy * l)
      ctx.lineTo(x, y)
      ctx.lineTo(x + sx * l, y)
      ctx.stroke()
    }
  }
}
