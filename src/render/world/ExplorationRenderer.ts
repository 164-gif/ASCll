import * as THREE from 'three'
import type { WorldState } from '../../simulation/WorldState'
import { ANOMALY_QUESTS } from '../../world/Anomalies'
import { TOWN_BUILDINGS, terrainHeightAt } from '../../world/WorldLayout'
import { TENT_BUILDING, buildingEntrance } from '../../world/Settlement'

type MaterialFactory = (base: number, dark: number, offset?: number, emissive?: number) => THREE.ShaderMaterial

export class ExplorationRenderer {
  private readonly sites: THREE.Group[] = []
  private readonly doorLabels: { sprite: THREE.Sprite; x: number; z: number; open: boolean }[] = []
  private readonly textures: THREE.Texture[] = []
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(scene: THREE.Scene, make: MaterialFactory) {
    const timber = make(0x8f7c52, 0x1c1c11, 9)
    const lamp = make(0xdfce98, 0x574321, 12, 0.9)
    for (const building of [...TOWN_BUILDINGS, TENT_BUILDING]) {
      const [x, z] = buildingEntrance(building), y = terrainHeightAt(x, z)
      const open = building.kind !== 'house'
      const label = this.label(open ? `[ E ] ${building.kind === 'tent' ? 'ПАЛАТКА' : building.kind === 'inn' ? 'ТРАКТИР' : building.name.toLocaleUpperCase('ru')}` : '× ЗАКРЫТО', open ? '#dfd2a7' : '#87927f')
      label.position.set(x, y + 2.9, z); label.scale.set(4.6, 0.66, 1); label.renderOrder = 30
      scene.add(label); this.doorLabels.push({ sprite: label, x, z, open })
      if (!open) continue
      const threshold = new THREE.Group(); threshold.position.set(x, y + 0.1, z); threshold.rotation.y = building.rotation
      for (let i = 0; i < 3; i++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.6 - i * 0.25, 0.055, 0.14), lamp)
        step.position.set(0, i * 0.025, -0.5 + i * 0.42); threshold.add(step)
      }
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), timber)
        pole.position.set(side * 1.1, 0.9, 0.25); threshold.add(pole)
        const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), lamp)
        light.position.set(side * 1.1, 1.65, 0.25); threshold.add(light)
      }
      scene.add(threshold)
    }
    ANOMALY_QUESTS.forEach((quest, index) => {
      const group = new THREE.Group(); group.position.set(quest.x, terrainHeightAt(quest.x, quest.z), quest.z)
      const material = make(quest.color, 0x171b20, 15 + index, 0.65)
      if (index === 0) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 5, 32), material)
        ring.position.y = 1.9; group.add(ring)
      } else if (index === 1) {
        for (let i = 0; i < 15; i++) {
          const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.09 + i % 3 * 0.025), material)
          drop.position.set(Math.sin(i * 2.4) * 0.95, i / 5, Math.cos(i * 2.4) * 0.95); group.add(drop)
        }
      } else {
        for (let i = 0; i < 10; i++) {
          const piece = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.1), material)
          const angle = i / 10 * Math.PI * 2
          piece.position.set(Math.cos(angle) * 1.2, 2 + Math.sin(angle) * 1.2, 0)
          piece.rotation.z = angle + Math.PI / 2; group.add(piece)
        }
      }
      for (let i = 0; i < 7; i++) {
        const glyph = this.label(['∴', ':', '/', '|', '+', '0', '·'][i]!, '#' + quest.color.toString(16))
        glyph.scale.set(0.45, 0.45, 1)
        const angle = i / 7 * Math.PI * 2
        glyph.position.set(Math.cos(angle) * 1.5, 1.8 + Math.sin(angle) * 0.45, Math.sin(angle) * 1.2)
        group.add(glyph)
      }
      scene.add(group); this.sites.push(group)
    })
  }

  update(world: WorldState, dt: number): void {
    for (const door of this.doorLabels) {
      const distance = Math.hypot(world.player.x - door.x, world.player.z - door.z)
      const target = world.interior ? 0 : Math.min(1, Math.max(0, (14 - distance) / 6)) * (door.open ? 1 : 0.6)
      door.sprite.material.opacity += (target - door.sprite.material.opacity) * Math.min(1, dt * 8)
      door.sprite.visible = door.sprite.material.opacity > 0.01
    }
    this.sites.forEach((group, index) => {
      const quest = ANOMALY_QUESTS[index]!
      group.visible = !world.interior && Math.hypot(world.player.x - quest.x, world.player.z - quest.z) < 45
      const studied = ['surveyed', 'completed'].includes(world.quests[quest.id]!)
      const time = this.reducedMotion ? 0 : world.elapsed
      group.rotation.y = time * (studied ? 0.04 : 0.15)
      group.position.y = terrainHeightAt(quest.x, quest.z) + Math.sin(time * 0.8 + index) * 0.1
      if (index === 1) group.children.slice(0, 15).forEach((drop, i) => { drop.position.y = (i / 5 + time * 0.6) % 3.2 })
    })
  }

  destroy(): void { this.textures.forEach((texture) => texture.dispose()); this.doorLabels.forEach(({ sprite }) => sprite.material.dispose()); this.sites.forEach((site) => site.traverse((object) => { if (object instanceof THREE.Sprite) object.material.dispose() })) }

  private label(text: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas'); canvas.width = text.length > 3 ? 512 : 64; canvas.height = text.length > 3 ? 80 : 64
    const context = canvas.getContext('2d')!
    if (text.length > 3) { context.fillStyle = '#060c08e8'; context.fillRect(0, 0, canvas.width, canvas.height) }
    context.fillStyle = color; context.font = `${text.length > 3 ? 23 : 42}px monospace`; context.textAlign = 'center'; context.textBaseline = 'middle'
    context.fillText(text, canvas.width / 2, canvas.height / 2)
    const map = new THREE.CanvasTexture(canvas); this.textures.push(map)
    return new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: text.length > 3 ? 0 : 0.8, depthTest: text.length <= 3, depthWrite: false }))
  }
}
