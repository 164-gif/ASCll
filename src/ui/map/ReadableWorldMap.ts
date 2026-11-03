import { ANOMALY_QUESTS } from '../../world/Anomalies'
import type { WorldState } from '../../simulation/WorldState'
import {
  RIVER_HALF_WIDTH,
  WORLD_BRIDGES,
  WORLD_LIMIT,
  TOWN_BUILDINGS,
  TOWN_CENTER,
  TOWN_WALL,
  TOWN_FIELDS,
  WORLD_ROADS,
  WORLD_STRUCTURES,
  riverCenterZ,
} from '../../world/WorldLayout'
import { FOREST_CAMP_X, FOREST_CAMP_Z } from '../../world/ForestCamp'

type Sector = {
  id: string
  title: string
  subtitle: string
  col: 0 | 1
  row: 0 | 1
}

const SECTORS: readonly Sector[] = [
  { id: 'north', title: 'СЕДОЙ БОР', subtitle: 'город · северные поля', col: 0, row: 0 },
  { id: 'forest', title: 'ТЁМНАЯ ЧАЩА', subtitle: 'лагерь · лес', col: 1, row: 0 },
  { id: 'ruins', title: 'СТАРЫЕ РУИНЫ', subtitle: 'аббатство', col: 0, row: 1 },
  { id: 'highland', title: 'КАМЕННЫЙ ПЕРЕВАЛ', subtitle: 'мост · крепость', col: 1, row: 1 },
]

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
    this.element.className = 'world-map world-map--readable'
    this.element.setAttribute('aria-hidden', 'true')
    this.element.innerHTML = `
      <div class="world-map__frame readable-map__frame">
        <header class="world-map__header readable-map__header">
          <div>
            <span class="world-map__eyebrow">карта мира · северный тракт</span>
            <strong>лесная долина и Седой Бор</strong>
          </div>
          <button class="world-map__close" type="button" aria-label="Закрыть карту">M / ESC</button>
        </header>
        <div class="readable-map__canvas-wrap">
          <canvas class="world-map__canvas readable-map__canvas" aria-label="Карта игрового мира"></canvas>
        </div>
        <footer class="world-map__legend readable-map__legend">
          <span><i class="world-map__dot world-map__dot--player"></i>ты</span>
          <span><i class="readable-map__road-key"></i>дорога</span>
          <span><i class="readable-map__water-key"></i>вода</span>
          <span>△ лагерь</span><span>∴ след / область поиска</span>
          <span>═ мост</span>
          <span>⌂ строение</span><span style="color:#a2b18c">· жители</span>
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
    const available = Math.min(window.innerWidth * 0.88, window.innerHeight * 0.76)
    const size = Math.floor(Math.min(900, Math.max(340, available)))
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
    if (!this.staticLayer) this.staticLayer = this.buildStaticLayer(size)

    this.ctx.clearRect(0, 0, size, size)
    this.ctx.drawImage(this.staticLayer, 0, 0, size, size)
    this.drawActiveSector(world, size)
    this.drawQuests(world, size)
    this.drawActors(world, size)
  }

  private buildStaticLayer(size: number): HTMLCanvasElement {
    const layer = document.createElement('canvas')
    layer.width = size
    layer.height = size
    const ctx = layer.getContext('2d')
    if (!ctx) return layer

    ctx.fillStyle = '#060a08'
    ctx.fillRect(0, 0, size, size)

    this.drawSectorBackgrounds(ctx, size)
    this.drawSparseGlyphTexture(ctx, size)
    this.drawRiver(ctx, size)
    this.drawRoads(ctx, size)
    this.drawBridges(ctx, size)
    this.drawLandmarks(ctx, size)
    this.drawSettlement(ctx, size)
    this.drawSectorLabels(ctx, size)

    ctx.strokeStyle = 'rgba(230,216,166,.26)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1)
    ctx.beginPath()
    ctx.moveTo(size * 0.5, 0)
    ctx.lineTo(size * 0.5, size)
    ctx.moveTo(0, size * 0.5)
    ctx.lineTo(size, size * 0.5)
    ctx.strokeStyle = 'rgba(218,206,164,.12)'
    ctx.stroke()

    return layer
  }

  private drawSectorBackgrounds(ctx: CanvasRenderingContext2D, size: number): void {
    const half = size * 0.5
    const fills = ['#0d1712', '#0a1612', '#14130f', '#101512']
    SECTORS.forEach((sector, index) => {
      const x = sector.col * half
      const y = sector.row * half
      ctx.fillStyle = fills[index] ?? '#0c120f'
      ctx.fillRect(x, y, half, half)

      const gradient = ctx.createRadialGradient(x + half * 0.5, y + half * 0.5, half * 0.05, x + half * 0.5, y + half * 0.5, half * 0.72)
      gradient.addColorStop(0, 'rgba(80,112,86,.08)')
      gradient.addColorStop(1, 'rgba(0,0,0,.2)')
      ctx.fillStyle = gradient
      ctx.fillRect(x, y, half, half)
    })
  }

  private drawSparseGlyphTexture(ctx: CanvasRenderingContext2D, size: number): void {
    let seed = 0x4d415000
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }

    ctx.save()
    ctx.font = `${Math.max(7, Math.floor(size * 0.011))}px ui-monospace, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const glyphs = ['·', '⋀', ':', '˄', '∴']
    for (let i = 0; i < 165; i += 1) {
      const x = random() * size
      const y = random() * size
      const world = this.canvasToWorld(x, y, size)
      if (this.nearMajorRoute(world.x, world.z)) continue
      ctx.fillStyle = random() > 0.3 ? 'rgba(82,122,93,.18)' : 'rgba(133,145,126,.10)'
      ctx.fillText(glyphs[Math.floor(random() * glyphs.length)] ?? '·', x, y)
    }
    ctx.restore()
  }

  private drawRiver(ctx: CanvasRenderingContext2D, size: number): void {
    const path = new Path2D()
    let first = true
    for (let x = -WORLD_LIMIT - 8; x <= WORLD_LIMIT + 8; x += 1.1) {
      const point = this.worldToCanvas(x, riverCenterZ(x), size)
      if (first) {
        path.moveTo(point.x, point.y)
        first = false
      } else path.lineTo(point.x, point.y)
    }

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(12, (RIVER_HALF_WIDTH * 2.1 / (WORLD_LIMIT * 2)) * size)
    ctx.strokeStyle = 'rgba(2,5,6,.92)'
    ctx.stroke(path)
    ctx.lineWidth = Math.max(8, (RIVER_HALF_WIDTH * 1.75 / (WORLD_LIMIT * 2)) * size)
    ctx.strokeStyle = 'rgba(45,83,99,.94)'
    ctx.stroke(path)
    ctx.lineWidth = Math.max(1.4, size * 0.0025)
    ctx.setLineDash([7, 7])
    ctx.strokeStyle = 'rgba(162,202,209,.52)'
    ctx.stroke(path)
    ctx.setLineDash([])
  }

  private drawRoads(ctx: CanvasRenderingContext2D, size: number): void {
    for (const road of WORLD_ROADS) {
      const path = new Path2D()
      road.points.forEach((point, index) => {
        const p = this.worldToCanvas(point[0], point[1], size)
        if (index === 0) path.moveTo(p.x, p.y)
        else path.lineTo(p.x, p.y)
      })

      const roadWidth = Math.max(4.5, (road.width / (WORLD_LIMIT * 2)) * size * 1.35)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = roadWidth + 4
      ctx.strokeStyle = 'rgba(3,4,3,.92)'
      ctx.stroke(path)
      ctx.lineWidth = roadWidth
      ctx.strokeStyle = 'rgba(181,139,76,.93)'
      ctx.stroke(path)
      ctx.lineWidth = Math.max(1, roadWidth * 0.18)
      ctx.setLineDash([6, 9])
      ctx.strokeStyle = 'rgba(248,220,147,.6)'
      ctx.stroke(path)
      ctx.setLineDash([])
    }
  }

  private drawBridges(ctx: CanvasRenderingContext2D, size: number): void {
    const scale = size / (WORLD_LIMIT * 2)
    for (const bridge of WORLD_BRIDGES) {
      const p = this.worldToCanvas(bridge.x, bridge.z, size)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(-bridge.rotation)
      const width = Math.max(7, bridge.width * scale * 1.35)
      const length = Math.max(18, bridge.length * scale)
      ctx.fillStyle = '#090b09'
      ctx.fillRect(-width * 0.72, -length * 0.55, width * 1.44, length * 1.1)
      ctx.fillStyle = bridge.style === 'stone' ? '#c6bfa9' : '#a96e3c'
      ctx.fillRect(-width * 0.5, -length * 0.5, width, length)
      ctx.strokeStyle = 'rgba(246,226,168,.7)'
      ctx.lineWidth = 1
      ctx.strokeRect(-width * 0.5, -length * 0.5, width, length)
      ctx.restore()
    }
  }

  private drawLandmarks(ctx: CanvasRenderingContext2D, size: number): void {
    const camp = this.worldToCanvas(FOREST_CAMP_X, FOREST_CAMP_Z, size)
    this.drawTentIcon(ctx, camp.x, camp.y, size)
    this.drawLabel(ctx, camp.x + 10, camp.y - 17, 'ЛАГЕРЬ', 'костёр · шатёр', 'left')

    for (const structure of WORLD_STRUCTURES) {
      const p = this.worldToCanvas(structure.x, structure.z, size)
      if (structure.kind === 'abbey') this.drawAbbeyIcon(ctx, p.x, p.y, size)
      else if (structure.kind === 'highland-fort') this.drawFortIcon(ctx, p.x, p.y, size)
      else this.drawHouseIcon(ctx, p.x, p.y, size)
      this.drawLabel(ctx, p.x, p.y + 17, structure.name.toUpperCase(), '', 'center')
    }
  }

  private drawSettlement(ctx: CanvasRenderingContext2D, size: number): void {
    const scale = size / (WORLD_LIMIT * 2)
    ctx.save()
    for (const field of TOWN_FIELDS) {
      const p = this.worldToCanvas(field.x, field.z, size)
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(field.rotation)
      ctx.fillStyle = 'rgba(141,123,65,.18)'
      ctx.fillRect(-field.width * scale / 2, -field.depth * scale / 2, field.width * scale, field.depth * scale)
      ctx.strokeStyle = 'rgba(185,156,85,.4)'; ctx.lineWidth = 1
      for (let x = -field.width / 2; x < field.width / 2; x += 3) {
        ctx.beginPath(); ctx.moveTo(x * scale, -field.depth * scale / 2); ctx.lineTo(x * scale, field.depth * scale / 2); ctx.stroke()
      }
      ctx.restore()
    }
    const town = this.worldToCanvas(TOWN_CENTER.x, TOWN_CENTER.z, size)
    ctx.strokeStyle = '#a0aa9b'; ctx.fillStyle = '#121a15'; ctx.lineWidth = 2
    const w = TOWN_WALL.width * scale, d = TOWN_WALL.depth * scale
    ctx.fillRect(town.x - w / 2, town.y - d / 2, w, d)
    ctx.beginPath(); ctx.moveTo(town.x - TOWN_WALL.gateWidth * scale / 2, town.y + d / 2)
    ctx.lineTo(town.x - w / 2, town.y + d / 2); ctx.lineTo(town.x - w / 2, town.y - d / 2)
    ctx.lineTo(town.x + w / 2, town.y - d / 2); ctx.lineTo(town.x + w / 2, town.y + d / 2)
    ctx.lineTo(town.x + TOWN_WALL.gateWidth * scale / 2, town.y + d / 2); ctx.stroke()
    for (const building of TOWN_BUILDINGS) {
      const p = this.worldToCanvas(building.x, building.z, size)
      ctx.fillStyle = building.kind === 'house' ? '#77816e' : '#c0a66c'
      ctx.fillRect(p.x - building.width * scale / 2, p.y - building.depth * scale / 2, building.width * scale, building.depth * scale)
    }
    this.drawLabel(ctx, town.x, town.y + d / 2 + 12, 'СЕДОЙ БОР', 'ворота · трактир · кузница', 'center')
    ctx.restore()
  }

  private drawSectorLabels(ctx: CanvasRenderingContext2D, size: number): void {
    const half = size * 0.5
    for (const sector of SECTORS) {
      const x = sector.col * half + 14
      const y = sector.row * half + 14
      ctx.save()
      ctx.fillStyle = 'rgba(3,6,4,.82)'
      ctx.fillRect(x, y, Math.min(190, half - 28), 42)
      ctx.strokeStyle = 'rgba(220,205,157,.18)'
      ctx.strokeRect(x + 0.5, y + 0.5, Math.min(190, half - 28) - 1, 41)
      ctx.fillStyle = 'rgba(238,225,178,.9)'
      ctx.font = `600 ${Math.max(10, Math.floor(size * 0.015))}px ui-monospace, monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(sector.title, x + 9, y + 8)
      ctx.fillStyle = 'rgba(203,209,194,.48)'
      ctx.font = `${Math.max(8, Math.floor(size * 0.011))}px ui-monospace, monospace`
      ctx.fillText(sector.subtitle, x + 9, y + 24)
      ctx.restore()
    }
  }

  private drawActiveSector(world: WorldState, size: number): void {
    const col = world.mapPosition.x >= 0 ? 1 : 0
    const row = world.mapPosition.z >= 0 ? 0 : 1
    const half = size * 0.5
    this.ctx.save()
    this.ctx.strokeStyle = 'rgba(245,205,104,.7)'
    this.ctx.lineWidth = 2
    this.ctx.shadowColor = 'rgba(244,183,66,.32)'
    this.ctx.shadowBlur = 12
    this.ctx.strokeRect(col * half + 4, row * half + 4, half - 8, half - 8)
    this.ctx.restore()
  }

  private drawQuests(world: WorldState, size: number): void {
    const ctx = this.ctx
    ctx.save()
    for (const quest of ANOMALY_QUESTS) {
      const status = world.quests[quest.id]
      if (!status || status === 'locked' || status === 'available') continue
      const p = this.worldToCanvas(quest.x, quest.z, size)
      ctx.strokeStyle = '#' + quest.color.toString(16); ctx.fillStyle = ctx.strokeStyle
      if (status === 'active') {
        const radius = 8 * size / (WORLD_LIMIT * 2)
        ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      }
      if (status !== 'active' || Math.hypot(world.mapPosition.x - quest.x, world.mapPosition.z - quest.z) < 8) {
        ctx.font = '14px monospace'; ctx.textAlign = 'center'; ctx.fillText(quest.glyph, p.x, p.y + 4)
      }
    }
    if (world.activeQuest && world.quests[world.activeQuest.id] === 'surveyed') {
      const camp = this.worldToCanvas(FOREST_CAMP_X, FOREST_CAMP_Z, size)
      ctx.fillStyle = '#ded1a4'; ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.fillText('ОТЧЁТ', camp.x + 12, camp.y + 6)
    }
    ctx.restore()
  }

  private drawActors(world: WorldState, size: number): void {
    for (const enemy of world.enemies) {
      const p = this.worldToCanvas(enemy.x, enemy.z, size)
      this.ctx.beginPath()
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      this.ctx.fillStyle = 'rgba(188,72,78,.82)'
      this.ctx.fill()
    }

    for (const resident of world.residents) {
      const p = this.worldToCanvas(resident.x, resident.z, size)
      this.ctx.fillStyle = '#a2b18c'; this.ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
    }
    const player = this.worldToCanvas(world.mapPosition.x, world.mapPosition.z, size)
    this.ctx.save()
    this.ctx.translate(player.x, player.y)
    this.ctx.rotate(-world.mapPosition.facing)
    this.ctx.beginPath()
    this.ctx.arc(0, 0, 10, 0, Math.PI * 2)
    this.ctx.strokeStyle = 'rgba(255,205,91,.42)'
    this.ctx.lineWidth = 1.5
    this.ctx.stroke()
    this.ctx.beginPath()
    this.ctx.moveTo(0, -10)
    this.ctx.lineTo(6.5, 7)
    this.ctx.lineTo(0, 4)
    this.ctx.lineTo(-6.5, 7)
    this.ctx.closePath()
    this.ctx.fillStyle = '#ffe092'
    this.ctx.shadowColor = 'rgba(255,185,58,.85)'
    this.ctx.shadowBlur = 12
    this.ctx.fill()
    this.ctx.restore()

    this.ctx.shadowBlur = 0
    this.ctx.fillStyle = 'rgba(236,232,211,.78)'
    this.ctx.font = `${Math.max(9, Math.floor(size * 0.012))}px ui-monospace, monospace`
    this.ctx.textAlign = 'left'
    this.ctx.fillText(`${world.currentZone.name}  ·  ${world.mapPosition.x.toFixed(0)}, ${world.mapPosition.z.toFixed(0)}`, 14, size - 14)
  }

  private drawTentIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const r = Math.max(7, size * 0.012)
    ctx.save()
    ctx.strokeStyle = '#f0c66c'
    ctx.fillStyle = 'rgba(154,91,42,.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y + r * 0.75)
    ctx.lineTo(x - r, y + r * 0.75)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x - r * 1.35, y + r * 0.6, 2.3, 0, Math.PI * 2)
    ctx.fillStyle = '#ffb53e'
    ctx.shadowColor = '#ff9c25'
    ctx.shadowBlur = 8
    ctx.fill()
    ctx.restore()
  }

  private drawAbbeyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const r = Math.max(7, size * 0.011)
    ctx.save()
    ctx.strokeStyle = 'rgba(225,218,191,.88)'
    ctx.lineWidth = 2
    ctx.strokeRect(x - r, y - r * 0.4, r * 2, r * 1.3)
    ctx.beginPath()
    ctx.moveTo(x - r * 1.15, y - r * 0.4)
    ctx.lineTo(x, y - r * 1.25)
    ctx.lineTo(x + r * 1.15, y - r * 0.4)
    ctx.stroke()
    ctx.restore()
  }

  private drawFortIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const r = Math.max(7, size * 0.011)
    ctx.save()
    ctx.strokeStyle = 'rgba(220,216,197,.86)'
    ctx.lineWidth = 2
    ctx.strokeRect(x - r, y - r, r * 2, r * 2)
    for (const side of [-1, 1]) {
      ctx.strokeRect(x + side * r * 0.78 - 3, y - r - 4, 6, 6)
    }
    ctx.restore()
  }

  private drawHouseIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const r = Math.max(6, size * 0.01)
    ctx.save()
    ctx.strokeStyle = 'rgba(215,211,190,.82)'
    ctx.lineWidth = 1.7
    ctx.strokeRect(x - r * 0.7, y - r * 0.15, r * 1.4, r)
    ctx.beginPath()
    ctx.moveTo(x - r, y - r * 0.15)
    ctx.lineTo(x, y - r)
    ctx.lineTo(x + r, y - r * 0.15)
    ctx.stroke()
    ctx.restore()
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    title: string,
    subtitle: string,
    align: CanvasTextAlign,
  ): void {
    const fontSize = Math.max(8, Math.floor(this.canvas.clientWidth * 0.01))
    ctx.save()
    ctx.font = `600 ${fontSize}px ui-monospace, monospace`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(245,232,190,.88)'
    ctx.shadowColor = 'rgba(0,0,0,.95)'
    ctx.shadowBlur = 4
    ctx.fillText(title, x, y)
    if (subtitle) {
      ctx.font = `${Math.max(7, fontSize - 1)}px ui-monospace, monospace`
      ctx.fillStyle = 'rgba(211,214,198,.55)'
      ctx.fillText(subtitle, x, y + fontSize + 3)
    }
    ctx.restore()
  }

  private nearMajorRoute(x: number, z: number): boolean {
    if (Math.abs(z - riverCenterZ(x)) < RIVER_HALF_WIDTH + 5) return true
    for (const road of WORLD_ROADS) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const a = road.points[index]!
        const b = road.points[index + 1]!
        if (this.pointSegmentDistance(x, z, a[0], a[1], b[0], b[1]) < road.width + 4) return true
      }
    }
    return false
  }

  private pointSegmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
    const vx = bx - ax
    const vz = bz - az
    const len2 = vx * vx + vz * vz
    if (len2 < 0.0001) return Math.hypot(x - ax, z - az)
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2))
    return Math.hypot(x - (ax + vx * t), z - (az + vz * t))
  }

  private worldToCanvas(x: number, z: number, size: number): { x: number; y: number } {
    return {
      x: ((x + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * size,
      y: size - ((z + WORLD_LIMIT) / (WORLD_LIMIT * 2)) * size,
    }
  }

  private canvasToWorld(x: number, y: number, size: number): { x: number; z: number } {
    return {
      x: (x / size) * WORLD_LIMIT * 2 - WORLD_LIMIT,
      z: ((size - y) / size) * WORLD_LIMIT * 2 - WORLD_LIMIT,
    }
  }
}
