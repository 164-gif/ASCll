import type { MovementInput } from '../input/InputController'
import {
  WORLD_LIMIT,
  type TownBuilding,
  bridgeDeckHeightAt,
  createWorldLandmarks,
  isInsideRiver,
  walkHeightAt,
  zoneAt,
  type WorldLandmark,
  type WorldZone,
} from '../world/WorldLayout'

export {
  bridgeDeckHeightAt,
  isInsideRiver,
  riverCenterZ,
  riverSignedDistance,
  terrainHeightAt,
  walkHeightAt,
  zoneAt,
} from '../world/WorldLayout'
export type TreeObstacle = WorldLandmark

export type EnemyState = {
  id: number
  x: number
  z: number
  hp: number
  hitFlash: number
  attackCooldown: number
}

export type PlayerState = {
  x: number
  z: number
  facing: number
  hp: number
  stamina: number
  attackPulse: number
  hurtPulse: number
}

import { FOREST_CAMP_OLD_MAN } from '../world/ForestCamp'
import { ANOMALY_QUESTS, type QuestStatus } from '../world/Anomalies'
import { HOUSE_SPAWN, HOUSE_OBJECTS, houseSightClear, houseBlocked, houseRoomAt, type HouseObjectId } from '../world/WakingHouse'
import { environmentAt } from './EnvironmentState'
import { ENTERABLE_BUILDINGS, buildingEntrance, TENT_ELDER, TENT_BED, INTERIOR_DEPTH, INTERIOR_WIDTH, INTERIOR_EXIT, INTERIOR_FURNITURE, RESIDENTS, pointInRect, settlementBlocked, type Resident } from '../world/Settlement'

export type ResidentState = Resident & { x: number; z: number; facing: number; waypoint: number; pause: number; walking: boolean }
export type GameChapter = 'valley' | 'awakening'

const PLAYER_RADIUS = 0.42
const TREE_CLEARANCE = 0.08

export class WorldState {
  readonly player: PlayerState = {
    x: -0.5,
    z: 2.2,
    facing: -Math.PI * 0.75,
    hp: 100,
    stamina: 100,
    attackPulse: 0,
    hurtPulse: 0,
  }

  readonly trees: WorldLandmark[] = []
  readonly enemies: EnemyState[] = []
  readonly residents: ResidentState[] = RESIDENTS.map((resident) => ({ ...resident, x: resident.route[0]![0], z: resident.route[0]![1], facing: 0, waypoint: 1, pause: 1, walking: false }))
  chapter: GameChapter = 'valley'
  awakeningPending = false
  readonly house = { yaw: 0, pitch: -0.08, elapsed: 0, radioOn: true, tvOn: false, lampOn: true, doorOpen: false, noteRead: false }
  interior: TownBuilding | null = null
  private exterior = { x: -0.5, z: 2.2, facing: 0 }
  elapsed = 0
  kills = 0
  torchOn = true
  readonly quests: Record<string, QuestStatus> = Object.fromEntries(ANOMALY_QUESTS.map((quest, index) => [quest.id, index === 0 ? 'available' : 'locked']))
  notice = ''
  noticeUntil = 0
  get lanternPower(): number { return this.quests['broken-trace'] === 'completed' ? 1.3 : 1 }
  get activeQuest() { return ANOMALY_QUESTS.find((quest) => ['active', 'surveyed'].includes(this.quests[quest.id]!)) }
  get canTalkToElder(): boolean {
    if (this.chapter !== 'valley') return false
    const location = this.interior?.kind === 'tent' ? TENT_ELDER : !this.interior ? FOREST_CAMP_OLD_MAN : null
    return !!location && Math.hypot(this.player.x - location.x, this.player.z - location.z) < 2.4
  }
  get canRest(): boolean { return this.interior?.kind === 'tent' && Math.hypot(this.player.x - TENT_BED.x, this.player.z - TENT_BED.z) < 2.7 }

  notify(text: string): void { this.notice = text; this.noticeUntil = this.elapsed + 6 }

  acceptQuest(id: string): boolean {
    if (!this.canTalkToElder || this.quests[id] !== 'available' || this.activeQuest) return false
    this.quests[id] = 'active'
    this.notify('Новое исследование · ' + ANOMALY_QUESTS.find((quest) => quest.id === id)!.title)
    return true
  }

  inspectAnomaly(id: string): boolean {
    const quest = ANOMALY_QUESTS.find((item) => item.id === id)
    if (!quest || this.interior || this.player.hp <= 0 || this.quests[id] !== 'active' || Math.hypot(this.player.x - quest.x, this.player.z - quest.z) > 2.7) return false
    this.quests[id] = 'surveyed'; this.notify('Наблюдение записано · вернись к страннику')
    return true
  }

  completeQuest(id: string): boolean {
    if (!this.canTalkToElder || this.quests[id] !== 'surveyed') return false
    this.quests[id] = 'completed'
    const index = ANOMALY_QUESTS.findIndex((quest) => quest.id === id)
    const next = ANOMALY_QUESTS[index + 1]
    if (!next) this.awakeningPending = true
    if (next) this.quests[next.id] = 'available'
    this.player.hp = 100; this.player.stamina = 100
    this.notify('Исследование завершено · ' + ANOMALY_QUESTS[index]!.title)
    return true
  }

  beginAwakening(skipIntro = false): boolean {
    if (this.chapter !== 'valley' || !ANOMALY_QUESTS.every((quest) => this.quests[quest.id] === 'completed')) return false
    this.chapter = 'awakening'; this.awakeningPending = false; this.interior = null
    Object.assign(this.player, HOUSE_SPAWN, { hp: 100, stamina: 100, attackPulse: 0, hurtPulse: 0, facing: Math.PI })
    this.house.elapsed = skipIntro ? 3 : 0
    this.notice = ''; this.noticeUntil = 0
    return true
  }

  lookInHouse(dx: number, dy: number): void {
    if (this.chapter !== 'awakening') return
    this.house.yaw = (this.house.yaw + dx * 0.0025) % (Math.PI * 2)
    this.house.pitch = Math.max(-1.15, Math.min(1.15, this.house.pitch - dy * 0.0025))
  }

  get houseTarget() {
    if (this.chapter !== 'awakening') return undefined
    return HOUSE_OBJECTS.map((object) => ({ object, dx: object.x - this.player.x, dz: object.z - this.player.z }))
      .filter(({ object, dx, dz }) => {
        const dy = object.y - 1.62, distance = Math.hypot(dx, dy, dz)
        const pitch = this.house.pitch, yaw = this.house.yaw
        const alignment = (dx * Math.sin(yaw) * Math.cos(pitch) + dy * Math.sin(pitch) - dz * Math.cos(yaw) * Math.cos(pitch)) / distance
        return distance < 2.1 && houseSightClear(this.player.x, this.player.z, object.x, object.z) && (distance < 0.55 || alignment > 0.55)
      })
      .sort((a, b) => Math.hypot(a.dx, a.dz) - Math.hypot(b.dx, b.dz))[0]?.object
  }

  useHouseObject(id: HouseObjectId): boolean {
    if (this.houseTarget?.id !== id) return false
    if (id === 'radio') this.house.radioOn = !this.house.radioOn
    if (id === 'television') this.house.tvOn = !this.house.tvOn
    if (id === 'lamp') this.house.lampOn = !this.house.lampOn
    if (id === 'door') this.house.doorOpen = !this.house.doorOpen
    if (id === 'note') this.house.noteRead = true
    return true
  }

  restInTent(): boolean {
    if (!this.canRest) return false
    this.player.hp = 100; this.player.stamina = 100; this.elapsed += 180
    this.notify('Ты отдохнул · прошло три часа')
    return true
  }

  private deathTimer = 0

  constructor(initialChapter: GameChapter = 'valley', skipIntro = false) {
    this.trees.push(...createWorldLandmarks())
    this.spawnEnemies()
    if (initialChapter === 'awakening') {
      for (const quest of ANOMALY_QUESTS) this.quests[quest.id] = 'completed'
      this.beginAwakening(skipIntro)
    }
  }

  get currentZone(): WorldZone {
    if (this.chapter === 'awakening') return { id: 'wilds', name: houseRoomAt(this.player.x, this.player.z), x: 0, z: 0, radius: 15 }
    return this.interior ? { id: this.interior.kind === 'tent' ? 'forest' : 'town', name: this.interior.name, x: 0, z: 0, radius: 10 } : zoneAt(this.player.x, this.player.z)
  }

  get environment() { return environmentAt(this.elapsed) }
  get mapPosition() { return this.interior ? this.exterior : this.player }
  get canExitInterior(): boolean { return !!this.interior && Math.hypot(this.player.x - INTERIOR_EXIT.x, this.player.z - INTERIOR_EXIT.z) < 2 }

  enterBuilding(id: string): boolean {
    if (this.interior || this.chapter !== 'valley') return false
    const building = ENTERABLE_BUILDINGS.find((item) => item.id === id)
    if (!building) return false
    const door = buildingEntrance(building)
    if (Math.hypot(this.player.x - door[0], this.player.z - door[1]) > 2.6) return false
    this.exterior = { x: this.player.x, z: this.player.z, facing: this.player.facing }
    this.interior = building
    Object.assign(this.player, { x: 0, z: 4.7, facing: Math.PI, attackPulse: 0, hurtPulse: 0 })
    return true
  }

  exitInterior(): boolean {
    if (!this.canExitInterior) return false
    this.interior = null
    Object.assign(this.player, this.exterior)
    return true
  }

  toggleTorch(): void {
    if (this.chapter === 'awakening') { this.house.lampOn = !this.house.lampOn; return }
    this.torchOn = !this.torchOn
  }

  update(dt: number, input: MovementInput, attack: boolean): void {
    this.elapsed += dt
    if (this.chapter === 'awakening') {
      this.house.elapsed += dt
      if (this.house.elapsed < 1.6) return
      const speed = input.running ? 3.2 : 2.25
      const c = Math.cos(this.house.yaw), s = Math.sin(this.house.yaw)
      const dx = (input.x * c - input.z * s) * speed * dt
      const dz = (input.x * s + input.z * c) * speed * dt
      if (!houseBlocked(this.player.x + dx, this.player.z, this.house.doorOpen)) this.player.x += dx
      if (!houseBlocked(this.player.x, this.player.z + dz, this.house.doorOpen)) this.player.z += dz
      this.player.facing = Math.PI - this.house.yaw
      return
    }
    this.updateResidents(dt)
    this.player.attackPulse = Math.max(0, this.player.attackPulse - dt)
    this.player.hurtPulse = Math.max(0, this.player.hurtPulse - dt)

    if (this.player.hp <= 0) {
      this.deathTimer += dt
      if (this.deathTimer >= 1.7) this.respawn()
      return
    }

    if (this.interior) {
      const speed = input.running && this.player.stamina > 1 ? 5.4 : 3.8
      if (input.x || input.z) {
        this.player.facing = Math.atan2(input.x, input.z)
        const clear = (x: number, z: number): boolean => {
          if (Math.abs(x) > INTERIOR_WIDTH / 2 - 0.7 || Math.abs(z) > INTERIOR_DEPTH / 2 - 0.7) return false
          const kind = this.interior!.kind
          if (kind === 'tent' && Math.hypot(x - TENT_ELDER.x, z - TENT_ELDER.z) < 0.8) return false
          return kind === 'house' || !INTERIOR_FURNITURE[kind].some((rect) => pointInRect(x, z, rect, PLAYER_RADIUS))
        }
        const nx = this.player.x + input.x * speed * dt
        if (clear(nx, this.player.z)) this.player.x = nx
        const nz = this.player.z + input.z * speed * dt
        if (clear(this.player.x, nz)) this.player.z = nz
      }
      this.player.stamina = Math.min(100, this.player.stamina + dt * 15)
      return
    }

    const moving = Math.abs(input.x) + Math.abs(input.z) > 0.001
    const canRun = input.running && moving && this.player.stamina > 1
    const onBridge = bridgeDeckHeightAt(this.player.x, this.player.z) !== null
    const waterFactor = isInsideRiver(this.player.x, this.player.z) && !onBridge ? 0.76 : 1
    const zoneFactor = this.currentZone.id === 'highland' ? 0.92 : this.currentZone.id === 'forest' ? 0.96 : 1
    const speed = (canRun ? 7.1 : 4.25) * waterFactor * zoneFactor

    if (canRun) this.player.stamina = Math.max(0, this.player.stamina - dt * 23)
    else this.player.stamina = Math.min(100, this.player.stamina + dt * 15)

    if (moving) {
      this.player.facing = Math.atan2(input.x, input.z)
      this.tryMove(input.x * speed * dt, input.z * speed * dt)
    }

    if (attack && this.player.attackPulse <= 0) {
      this.player.attackPulse = 0.34
      this.resolveAttack()
    }

    this.updateEnemies(dt)
  }

  private tryMove(dx: number, dz: number): void {
    const currentHeight = walkHeightAt(this.player.x, this.player.z)
    const nx = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, this.player.x + dx))
    const xSlope = Math.abs(walkHeightAt(nx, this.player.z) - currentHeight)
    if (xSlope < 0.92 && !this.collidesTree(nx, this.player.z, PLAYER_RADIUS)) this.player.x = nx

    const nz = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, this.player.z + dz))
    const zSlope = Math.abs(walkHeightAt(this.player.x, nz) - walkHeightAt(this.player.x, this.player.z))
    if (zSlope < 0.92 && !this.collidesTree(this.player.x, nz, PLAYER_RADIUS)) this.player.z = nz
  }

  private collidesTree(x: number, z: number, radius: number): boolean {
    if (settlementBlocked(x, z, radius)) return true
    for (const tree of this.trees) {
      const minDistance = radius + tree.radius + TREE_CLEARANCE
      const dx = x - tree.x
      const dz = z - tree.z
      if (dx * dx + dz * dz < minDistance * minDistance) return true
    }
    return false
  }

  private updateResidents(dt: number): void {
    for (const resident of this.residents) {
      resident.walking = false
      if (!this.interior && Math.hypot(resident.x - this.player.x, resident.z - this.player.z) < 2.5) {
        resident.facing = Math.atan2(this.player.x - resident.x, this.player.z - resident.z)
        continue
      }
      resident.pause = Math.max(0, resident.pause - dt)
      if (resident.pause > 0) continue
      const goal = resident.route[resident.waypoint]!
      const dx = goal[0] - resident.x, dz = goal[1] - resident.z
      const distance = Math.hypot(dx, dz)
      if (distance < 0.08) {
        resident.waypoint = (resident.waypoint + 1) % resident.route.length
        resident.pause = resident.farmer ? 5 : 3
        continue
      }
      const step = Math.min(distance, dt * (resident.farmer ? 0.55 : 0.72))
      const nx = resident.x + dx / distance * step, nz = resident.z + dz / distance * step
      if (!settlementBlocked(nx, nz, 0.3)) {
        resident.x = nx; resident.z = nz; resident.walking = true
        resident.facing = Math.atan2(dx, dz)
      } else { resident.waypoint = (resident.waypoint + 1) % resident.route.length; resident.pause = 2 }
    }
  }

  private resolveAttack(): void {
    const range = 2.15
    const forwardX = Math.sin(this.player.facing)
    const forwardZ = Math.cos(this.player.facing)

    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index]
      if (!enemy) continue

      const dx = enemy.x - this.player.x
      const dz = enemy.z - this.player.z
      const distance = Math.hypot(dx, dz)
      if (distance > range || distance < 0.001) continue

      const dot = (dx / distance) * forwardX + (dz / distance) * forwardZ
      if (dot < -0.05) continue

      enemy.hp -= 34
      enemy.hitFlash = 0.16
      enemy.x += (dx / distance) * 0.55
      enemy.z += (dz / distance) * 0.55

      if (enemy.hp <= 0) {
        this.enemies.splice(index, 1)
        this.kills += 1
      }
    }

    if (this.enemies.length === 0) this.spawnEnemies()
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt)
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)

      const dx = this.player.x - enemy.x
      const dz = this.player.z - enemy.z
      const distance = Math.hypot(dx, dz)
      if (distance > 10.5 || distance < 0.001) continue

      if (distance > 1.15) {
        const onBridge = bridgeDeckHeightAt(enemy.x, enemy.z) !== null
        const speed = (distance < 3.4 ? 1.65 : 1.1) * (isInsideRiver(enemy.x, enemy.z) && !onBridge ? 0.72 : 1)
        const nx = enemy.x + (dx / distance) * speed * dt
        const nz = enemy.z + (dz / distance) * speed * dt
        if (!this.collidesTree(nx, enemy.z, 0.36)) enemy.x = nx
        if (!this.collidesTree(enemy.x, nz, 0.36)) enemy.z = nz
      } else if (enemy.attackCooldown <= 0) {
        enemy.attackCooldown = 1.1
        this.player.hp = Math.max(0, this.player.hp - 11)
        this.player.hurtPulse = 0.28
      }
    }
  }

  private respawn(): void {
    this.player.x = -0.5
    this.player.z = 2.2
    this.player.hp = 100
    this.player.stamina = 100
    this.player.attackPulse = 0
    this.player.hurtPulse = 0
    this.deathTimer = 0
    if (this.enemies.length < 4) this.spawnEnemies()
  }

  private spawnEnemies(): void {
    const base = this.kills + this.enemies.length + 1
    const positions = [
      [12, -7],
      [-13, -8],
      [12, 11],
      [-14, 8],
      [-42, -8],
      [-54, -23],
      [-18, 48],
      [4, 58],
      [41, 18],
      [59, 31],
      [31, -43],
      [50, -59],
      [-70, 28],
      [68, -10],
    ] as const

    for (let i = 0; i < positions.length; i += 1) {
      const [x, z] = positions[i]
      this.enemies.push({
        id: base + i,
        x,
        z,
        hp: 100,
        hitFlash: 0,
        attackCooldown: 0.5 + (i % 5) * 0.12,
      })
    }
  }
}
