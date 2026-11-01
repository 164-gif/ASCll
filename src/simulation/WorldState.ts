import type { MovementInput } from '../input/InputController'

export type TreeObstacle = {
  x: number
  z: number
  radius: number
  height: number
}

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

const WORLD_LIMIT = 24
const PLAYER_RADIUS = 0.42
const TREE_CLEARANCE = 0.08

export class WorldState {
  readonly player: PlayerState = {
    x: 0,
    z: 0,
    facing: 0,
    hp: 100,
    stamina: 100,
    attackPulse: 0,
    hurtPulse: 0,
  }

  readonly trees: TreeObstacle[] = []
  readonly enemies: EnemyState[] = []
  elapsed = 0
  kills = 0

  private deathTimer = 0

  constructor() {
    this.generateForest()
    this.spawnEnemies()
  }

  update(dt: number, input: MovementInput, attack: boolean): void {
    this.elapsed += dt
    this.player.attackPulse = Math.max(0, this.player.attackPulse - dt)
    this.player.hurtPulse = Math.max(0, this.player.hurtPulse - dt)

    if (this.player.hp <= 0) {
      this.deathTimer += dt
      if (this.deathTimer >= 1.7) this.respawn()
      return
    }

    const moving = Math.abs(input.x) + Math.abs(input.z) > 0.001
    const canRun = input.running && moving && this.player.stamina > 1
    const speed = canRun ? 7.1 : 4.25

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
    const nx = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, this.player.x + dx))
    if (!this.collidesTree(nx, this.player.z, PLAYER_RADIUS)) this.player.x = nx

    const nz = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, this.player.z + dz))
    if (!this.collidesTree(this.player.x, nz, PLAYER_RADIUS)) this.player.z = nz
  }

  private collidesTree(x: number, z: number, radius: number): boolean {
    for (const tree of this.trees) {
      const minDistance = radius + tree.radius + TREE_CLEARANCE
      const dx = x - tree.x
      const dz = z - tree.z
      if (dx * dx + dz * dz < minDistance * minDistance) return true
    }
    return false
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
      if (distance > 8.5 || distance < 0.001) continue

      if (distance > 1.15) {
        const speed = distance < 3.4 ? 1.65 : 1.1
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
    this.player.x = 0
    this.player.z = 0
    this.player.hp = 100
    this.player.stamina = 100
    this.player.attackPulse = 0
    this.player.hurtPulse = 0
    this.deathTimer = 0
    if (this.enemies.length < 3) this.spawnEnemies()
  }

  private generateForest(): void {
    let seed = 0x5a17c11
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }

    let attempts = 0
    while (this.trees.length < 62 && attempts < 600) {
      attempts += 1
      const x = (random() * 2 - 1) * (WORLD_LIMIT - 1)
      const z = (random() * 2 - 1) * (WORLD_LIMIT - 1)
      const radius = 0.45 + random() * 0.48
      if (Math.hypot(x, z) < 4.2) continue
      if (this.trees.some((tree) => Math.hypot(tree.x - x, tree.z - z) < tree.radius + radius + 0.9)) continue

      this.trees.push({
        x,
        z,
        radius,
        height: 3.7 + random() * 4.8,
      })
    }
  }

  private spawnEnemies(): void {
    const base = this.kills + this.enemies.length + 1
    const positions = [
      [7, -5],
      [-8, -7],
      [10, 8],
      [-11, 6],
      [2, -13],
      [-4, 14],
    ] as const

    for (let i = 0; i < positions.length; i += 1) {
      const [x, z] = positions[i]
      this.enemies.push({
        id: base + i,
        x,
        z,
        hp: 100,
        hitFlash: 0,
        attackCooldown: 0.5 + i * 0.12,
      })
    }
  }
}
