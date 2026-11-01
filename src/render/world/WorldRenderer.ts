import * as THREE from 'three'
import { type EnemyState, type WorldState } from '../../simulation/WorldState'
import {
  RIVER_HALF_WIDTH,
  isInsideRiver,
  riverSignedDistance,
  terrainHeightAt,
  zoneAt,
  type WorldLandmark,
} from '../../world/WorldLayout'
import { createAsciiAtlas } from './AsciiAtlas'
import {
  grassFragmentShader,
  grassVertexShader,
  groundFragmentShader,
  groundVertexShader,
  objectFragmentShader,
  objectVertexShader,
} from './AsciiShaders'

const BASE_FRUSTUM = 21
const MAX_RIPPLES = 18
const WORLD_RENDER_SIZE = 202

type ObjectMaterial = THREE.ShaderMaterial & {
  uniforms: THREE.ShaderMaterial['uniforms'] & {
    uBaseColor: { value: THREE.Color }
    uDarkColor: { value: THREE.Color }
    uCharOffset: { value: number }
    uEmissive: { value: number }
  }
}

export class WorldRenderer {
  readonly element: HTMLCanvasElement

  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 240)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly resizeObserver: ResizeObserver
  private readonly atlas = createAsciiAtlas()
  private readonly playerGroup = new THREE.Group()
  private readonly enemyMeshes = new Map<number, THREE.Group>()
  private readonly objectMaterials: ObjectMaterial[] = []
  private readonly ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(999, 999, 0, 0))
  private readonly camRight = new THREE.Vector3(1, 0, 0)
  private readonly camUp = new THREE.Vector3(0, 1, 0)
  private readonly torchPos = new THREE.Vector3()

  private readonly shared = {
    uAsciiTex: { value: this.atlas },
    uCamRight: { value: this.camRight },
    uCamUp: { value: this.camUp },
    uTime: { value: 0 },
    uPlayerPos: { value: new THREE.Vector3() },
    uTorchPos: { value: this.torchPos },
    uTorchPower: { value: 0 },
    uRipples: { value: this.ripples },
    uSwingTime: { value: 0 },
  }

  private capeMesh: THREE.Mesh | null = null
  private leftLeg: THREE.Mesh | null = null
  private rightLeg: THREE.Mesh | null = null
  private rightArm: THREE.Group | null = null
  private slashMesh: THREE.Mesh | null = null
  private rippleCursor = 0
  private currentZoom = 1.15
  private targetZoom = 1.15
  private walkCycle = 0
  private lastX = -0.5
  private lastZ = 2.2
  private lastAttackPulse = 0
  private stepDistance = 0
  private disposed = false

  constructor(parent: HTMLElement, world: WorldState) {
    this.scene.background = new THREE.Color(0x050706)

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(16, 16, false)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08

    this.element = this.renderer.domElement
    this.element.className = 'world-glyph-canvas'
    parent.append(this.element)

    this.camera.position.set(0, 26, 22)
    this.camera.lookAt(0, 0, 0)
    this.camera.zoom = this.currentZoom
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()

    this.buildGround()
    this.buildLandmarks(world)
    this.buildGrass(world)
    this.buildKnight()

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(parent)
    this.resize()
  }

  render(world: WorldState, dt: number): void {
    if (this.disposed) return

    const playerY = terrainHeightAt(world.player.x, world.player.z)
    this.shared.uTime.value = world.elapsed
    this.shared.uPlayerPos.value.set(world.player.x, playerY, world.player.z)

    const torchTarget = world.torchOn ? 1 : 0
    this.shared.uTorchPower.value += (torchTarget - this.shared.uTorchPower.value) * Math.min(1, dt * 4.5)
    this.torchPos.set(
      world.player.x + Math.sin(world.player.facing) * 0.45,
      playerY + 1.45,
      world.player.z + Math.cos(world.player.facing) * 0.45,
    )

    this.updateRipples(world, dt)
    this.syncPlayer(world, dt)
    this.syncEnemies(world.enemies)
    this.syncCamera(world, dt)
    this.renderer.render(this.scene, this.camera)
  }

  adjustZoom(delta: number): void {
    if (delta === 0) return
    const factor = delta > 0 ? Math.pow(1.16, delta) : Math.pow(0.86, -delta)
    this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * factor, 0.75, 5.2)
  }

  toggleMacroZoom(): void {
    this.targetZoom = this.targetZoom < 2.4 ? 3.6 : 1.15
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.resizeObserver.disconnect()
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.dispose()
    })
    this.atlas.dispose()
    this.renderer.dispose()
    this.element.remove()
  }

  private createAsciiMaterial(base: number, dark: number, charOffset = 0, emissive = 0): ObjectMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: objectVertexShader,
      fragmentShader: objectFragmentShader,
      uniforms: {
        uAsciiTex: this.shared.uAsciiTex,
        uCamRight: this.shared.uCamRight,
        uCamUp: this.shared.uCamUp,
        uTime: this.shared.uTime,
        uPlayerPos: this.shared.uPlayerPos,
        uTorchPos: this.shared.uTorchPos,
        uTorchPower: this.shared.uTorchPower,
        uBaseColor: { value: new THREE.Color(base) },
        uDarkColor: { value: new THREE.Color(dark) },
        uCharOffset: { value: charOffset },
        uEmissive: { value: emissive },
      },
    }) as ObjectMaterial
    this.objectMaterials.push(material)
    return material
  }

  private buildGround(): void {
    const geometry = new THREE.PlaneGeometry(WORLD_RENDER_SIZE, WORLD_RENDER_SIZE, 88, 88)
    geometry.rotateX(-Math.PI / 2)
    const position = geometry.attributes.position
    if (position) {
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i)
        const z = position.getZ(i)
        position.setY(i, terrainHeightAt(x, z))
      }
      position.needsUpdate = true
      geometry.computeVertexNormals()
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: groundVertexShader,
      fragmentShader: groundFragmentShader,
      uniforms: this.shared,
    })
    this.scene.add(new THREE.Mesh(geometry, material))
  }

  private buildLandmarks(world: WorldState): void {
    const stone = this.createAsciiMaterial(0x7c858e, 0x161a1e, 1.3)
    const mossStone = this.createAsciiMaterial(0x68766c, 0x141916, 4.7)
    const ruinStone = this.createAsciiMaterial(0x8a8174, 0x211e1a, 7.1)
    const bark = this.createAsciiMaterial(0x72513a, 0x17100b, 3.8)
    const pine = this.createAsciiMaterial(0x315f42, 0x08140d, 9.6)

    world.trees.forEach((landmark, index) => {
      const baseY = terrainHeightAt(landmark.x, landmark.z)
      if (landmark.kind === 'tree') {
        this.buildTree(landmark, baseY, bark, pine, index)
        return
      }
      if (landmark.kind === 'ruin') {
        this.buildRuin(landmark, baseY, ruinStone, index)
        return
      }
      if (landmark.kind === 'monolith') {
        const group = new THREE.Group()
        group.position.set(landmark.x, baseY, landmark.z)
        group.rotation.y = landmark.rotation ?? 0

        const base = new THREE.Mesh(
          new THREE.BoxGeometry(landmark.radius * 2.15, 0.8, landmark.radius * 1.65),
          stone,
        )
        base.position.y = 0.4
        group.add(base)

        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(landmark.radius * 1.45, landmark.height, landmark.radius * 1.15),
          stone,
        )
        pillar.position.y = landmark.height * 0.5
        pillar.rotation.z = Math.sin(index * 1.73) * 0.025
        group.add(pillar)
        this.scene.add(group)
        return
      }

      const geometry = new THREE.DodecahedronGeometry(1, 1)
      geometry.scale(landmark.radius, landmark.height, landmark.radius * (0.72 + (index % 3) * 0.1))
      const mesh = new THREE.Mesh(geometry, index % 2 === 0 ? stone : mossStone)
      mesh.position.set(landmark.x, baseY + landmark.height * 0.34, landmark.z)
      mesh.rotation.set(0.08 * (index % 2), landmark.rotation ?? index * 1.1, 0.04 * (index % 3))
      this.scene.add(mesh)
    })
  }

  private buildTree(
    landmark: WorldLandmark,
    baseY: number,
    bark: ObjectMaterial,
    pine: ObjectMaterial,
    index: number,
  ): void {
    const group = new THREE.Group()
    group.position.set(landmark.x, baseY, landmark.z)
    group.rotation.y = landmark.rotation ?? index * 0.71

    const trunkHeight = landmark.height * 0.58
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(landmark.radius * 0.18, landmark.radius * 0.31, trunkHeight, 6),
      bark,
    )
    trunk.position.y = trunkHeight * 0.5
    group.add(trunk)

    const crown1 = new THREE.Mesh(
      new THREE.ConeGeometry(landmark.radius * 2.25, landmark.height * 0.45, 7),
      pine,
    )
    crown1.position.y = landmark.height * 0.55
    crown1.rotation.y = index * 0.43
    group.add(crown1)

    const crown2 = new THREE.Mesh(
      new THREE.ConeGeometry(landmark.radius * 1.72, landmark.height * 0.39, 7),
      pine,
    )
    crown2.position.y = landmark.height * 0.73
    crown2.rotation.y = index * 0.67
    group.add(crown2)

    const crown3 = new THREE.Mesh(
      new THREE.ConeGeometry(landmark.radius * 1.12, landmark.height * 0.31, 7),
      pine,
    )
    crown3.position.y = landmark.height * 0.88
    group.add(crown3)

    this.scene.add(group)
  }

  private buildRuin(landmark: WorldLandmark, baseY: number, material: ObjectMaterial, index: number): void {
    const group = new THREE.Group()
    group.position.set(landmark.x, baseY, landmark.z)
    group.rotation.y = landmark.rotation ?? 0

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(landmark.radius * 2.3, landmark.height, 0.42),
      material,
    )
    wall.position.y = landmark.height * 0.5
    group.add(wall)

    const broken = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, landmark.height * 0.72, landmark.radius * 1.7),
      material,
    )
    broken.position.set(landmark.radius * 0.58, landmark.height * 0.36, 0.2)
    broken.rotation.y = 0.06 * ((index % 3) - 1)
    group.add(broken)

    const fallen = new THREE.Mesh(
      new THREE.BoxGeometry(landmark.radius * 1.15, 0.34, 0.52),
      material,
    )
    fallen.position.set(-landmark.radius * 0.55, 0.2, landmark.radius * 0.72)
    fallen.rotation.y = 0.6
    group.add(fallen)

    this.scene.add(group)
  }

  private buildGrass(world: WorldState): void {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const bladeCount = coarse ? 52000 : 118000
    const spread = 178

    const base = new THREE.BufferGeometry()
    base.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-0.05, 0, 0, 0.05, 0, 0, 0, 1, 0]), 3),
    )

    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('position', base.getAttribute('position'))

    const offsets = new Float32Array(bladeCount * 3)
    const scaleRot = new Float32Array(bladeCount * 3)
    let valid = 0
    let attempts = 0
    let seed = 0x41534349
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }

    while (valid < bladeCount && attempts < bladeCount * 4) {
      attempts += 1
      const x = (random() - 0.5) * spread
      const z = (random() - 0.5) * spread
      const riverDist = Math.abs(riverSignedDistance(x, z))
      if (riverDist < RIVER_HALF_WIDTH + 0.15) continue

      let blocked = false
      for (const obstacle of world.trees) {
        const dx = x - obstacle.x
        const dz = z - obstacle.z
        const radius = obstacle.radius * (obstacle.kind === 'tree' ? 0.72 : 1.08)
        if (dx * dx + dz * dz < radius * radius) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      const zone = zoneAt(x, z)
      offsets[valid * 3] = x
      offsets[valid * 3 + 1] = terrainHeightAt(x, z)
      offsets[valid * 3 + 2] = z

      const bank = Math.min(1, Math.max(0, (riverDist - RIVER_HALF_WIDTH) * 0.45))
      let height = 0.34 + random() * 0.46
      let flowerChance = 0.028
      if (zone.id === 'meadow') {
        height *= 1.18
        flowerChance = 0.09
      } else if (zone.id === 'forest') {
        height *= 0.82
        flowerChance = 0.012
      } else if (zone.id === 'highland') {
        height *= 0.66
        flowerChance = 0.018
      } else if (zone.id === 'ruins') {
        height *= 0.76
        flowerChance = 0.022
      }
      height *= 0.52 + 0.48 * bank

      const flowerRoll = random()
      scaleRot[valid * 3] = height
      scaleRot[valid * 3 + 1] = random()
      scaleRot[valid * 3 + 2] = flowerRoll > 1 - flowerChance ? (flowerRoll > 0.992 ? 2 : 1) : 0
      valid += 1
    }

    geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets.subarray(0, valid * 3), 3))
    geometry.setAttribute('aScaleRot', new THREE.InstancedBufferAttribute(scaleRot.subarray(0, valid * 3), 3))
    geometry.instanceCount = valid

    const material = new THREE.ShaderMaterial({
      vertexShader: grassVertexShader,
      fragmentShader: grassFragmentShader,
      uniforms: {
        uTime: this.shared.uTime,
        uPlayerPos: this.shared.uPlayerPos,
        uTorchPos: this.shared.uTorchPos,
        uTorchPower: this.shared.uTorchPower,
        uSwingTime: this.shared.uSwingTime,
      },
      side: THREE.DoubleSide,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    base.dispose()
  }

  private buildKnight(): void {
    const hair = this.createAsciiMaterial(0xf2f5f8, 0x5c6670, 2.1, 0.22)
    const armor = this.createAsciiMaterial(0x9aa4b0, 0x22262c, 5.4, 0.05)
    const cloak = this.createAsciiMaterial(0xd92626, 0x3b0709, 8.2, 0.08)
    const boot = this.createAsciiMaterial(0x453832, 0x120e0c, 3)
    const sword = this.createAsciiMaterial(0xffffff, 0x778899, 11, 0.35)
    const slash = this.createAsciiMaterial(0xffe57f, 0xb26a00, 15, 0.8)

    const legGeometry = new THREE.BoxGeometry(0.24, 0.72, 0.24)
    this.leftLeg = new THREE.Mesh(legGeometry, boot)
    this.leftLeg.position.set(-0.16, 0.38, 0)
    this.rightLeg = new THREE.Mesh(legGeometry, boot)
    this.rightLeg.position.set(0.16, 0.38, 0)
    this.playerGroup.add(this.leftLeg, this.rightLeg)

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.82, 0.42), armor)
    torso.position.y = 1.12
    this.playerGroup.add(torso)

    const shoulderGeometry = new THREE.SphereGeometry(0.26, 8, 8)
    const shoulderLeft = new THREE.Mesh(shoulderGeometry, armor)
    shoulderLeft.position.set(-0.36, 1.42, 0)
    const shoulderRight = new THREE.Mesh(shoulderGeometry, armor)
    shoulderRight.position.set(0.36, 1.42, 0)
    this.playerGroup.add(shoulderLeft, shoulderRight)

    this.capeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.38, 0.18), cloak)
    this.capeMesh.position.set(0, 0.82, -0.24)
    this.capeMesh.rotation.x = 0.18
    this.playerGroup.add(this.capeMesh)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 10), hair)
    head.position.set(0, 1.76, 0.02)
    this.playerGroup.add(head)

    this.rightArm = new THREE.Group()
    this.rightArm.position.set(0.42, 1.36, 0.05)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.45), sword)
    blade.position.z = 0.72
    this.rightArm.add(blade)
    this.playerGroup.add(this.rightArm)

    const slashGeometry = new THREE.RingGeometry(0.85, 1.65, 18, 1, -Math.PI * 0.45, Math.PI * 0.9)
    slashGeometry.rotateX(-Math.PI / 2)
    this.slashMesh = new THREE.Mesh(slashGeometry, slash)
    this.slashMesh.position.y = 1.05
    this.slashMesh.visible = false
    this.playerGroup.add(this.slashMesh)

    this.scene.add(this.playerGroup)
  }

  private syncPlayer(world: WorldState, dt: number): void {
    const dx = world.player.x - this.lastX
    const dz = world.player.z - this.lastZ
    const moved = Math.hypot(dx, dz)
    const moving = moved > 0.0003
    if (moving) this.walkCycle += dt * (isInsideRiver(world.player.x, world.player.z) ? 9.5 : 12)

    const riverDistance = Math.abs(riverSignedDistance(world.player.x, world.player.z))
    const sink = isInsideRiver(world.player.x, world.player.z)
      ? -0.28 * Math.min(1, (RIVER_HALF_WIDTH - riverDistance) * 0.6)
      : 0
    const baseY = terrainHeightAt(world.player.x, world.player.z)

    this.playerGroup.position.set(world.player.x, baseY + sink, world.player.z)
    this.playerGroup.rotation.y = world.player.facing

    if (this.leftLeg && this.rightLeg) {
      const swing = moving ? Math.sin(this.walkCycle) * 0.55 : 0
      this.leftLeg.rotation.x = swing
      this.rightLeg.rotation.x = -swing
    }

    if (this.capeMesh) {
      this.capeMesh.rotation.x = 0.2 + (moving ? 0.24 : 0.04) + Math.sin(world.elapsed * 4.5) * 0.055
      this.capeMesh.rotation.z = Math.cos(world.elapsed * 3.2) * 0.04
    }

    if (this.rightArm && this.slashMesh) {
      if (world.player.attackPulse > 0) {
        const p = 1 - world.player.attackPulse / 0.34
        this.rightArm.rotation.y = -1.15 + p * 2.4
        this.rightArm.rotation.x = 0.34
        this.slashMesh.visible = true
        this.slashMesh.rotation.y = p * 1.35
        this.shared.uSwingTime.value = Math.sin(Math.max(0, Math.min(1, p)) * Math.PI)
      } else {
        this.rightArm.rotation.y = Math.sin(world.elapsed * 2) * 0.07
        this.rightArm.rotation.x = 0.15 + (moving ? Math.cos(this.walkCycle) * 0.22 : 0)
        this.slashMesh.visible = false
        this.shared.uSwingTime.value = 0
      }
    }

    this.lastX = world.player.x
    this.lastZ = world.player.z
  }

  private createEnemy(enemy: EnemyState): THREE.Group {
    const group = new THREE.Group()
    const bodyMaterial = this.createAsciiMaterial(0x8f2833, 0x220609, 17 + enemy.id * 0.37, 0.08)
    const boneMaterial = this.createAsciiMaterial(0xd3c8af, 0x302b23, 12 + enemy.id * 0.21, 0.02)

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.28, 5), bodyMaterial)
    body.position.y = 0.68
    group.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 7, 6), boneMaterial)
    head.position.y = 1.42
    group.add(head)

    group.userData.bodyMaterial = bodyMaterial
    this.scene.add(group)
    this.enemyMeshes.set(enemy.id, group)
    return group
  }

  private syncEnemies(enemies: EnemyState[]): void {
    const alive = new Set<number>()
    for (const enemy of enemies) {
      alive.add(enemy.id)
      const group = this.enemyMeshes.get(enemy.id) ?? this.createEnemy(enemy)
      const baseY = terrainHeightAt(enemy.x, enemy.z)
      group.position.set(enemy.x, baseY + (isInsideRiver(enemy.x, enemy.z) ? -0.2 : 0), enemy.z)
      const dx = this.shared.uPlayerPos.value.x - enemy.x
      const dz = this.shared.uPlayerPos.value.z - enemy.z
      group.rotation.y = Math.atan2(dx, dz)
      const material = group.userData.bodyMaterial as ObjectMaterial | undefined
      if (material) material.uniforms.uEmissive.value = enemy.hitFlash > 0 ? 0.75 : 0.08
    }

    for (const [id, group] of this.enemyMeshes) {
      if (alive.has(id)) continue
      this.scene.remove(group)
      this.enemyMeshes.delete(id)
    }
  }

  private updateRipples(world: WorldState, dt: number): void {
    const moved = Math.hypot(world.player.x - this.lastX, world.player.z - this.lastZ)
    if (isInsideRiver(world.player.x, world.player.z) && moved > 0.002) {
      this.stepDistance += moved
      if (this.stepDistance > 0.8) {
        this.stepDistance = 0
        this.spawnRipple(world.player.x, world.player.z, 0.9, 0.22)
      }
    }

    if (world.player.attackPulse > this.lastAttackPulse + 0.08) {
      const x = world.player.x + Math.sin(world.player.facing) * 1.1
      const z = world.player.z + Math.cos(world.player.facing) * 1.1
      if (isInsideRiver(x, z) || isInsideRiver(world.player.x, world.player.z)) this.spawnRipple(x, z, 1.35, 0.4)
    }
    this.lastAttackPulse = world.player.attackPulse

    for (const ripple of this.ripples) {
      if (ripple.w <= 0.005) continue
      ripple.x += -0.86 * dt * 1.65
      ripple.y += 0.5 * dt * 1.65
      ripple.z += dt * 2.35
      ripple.w = Math.max(0, ripple.w - dt * 0.52)
    }
  }

  private spawnRipple(x: number, z: number, strength: number, radius: number): void {
    this.ripples[this.rippleCursor]?.set(x, z, radius, strength)
    this.rippleCursor = (this.rippleCursor + 1) % MAX_RIPPLES
  }

  private syncCamera(world: WorldState, dt: number): void {
    this.currentZoom += (this.targetZoom - this.currentZoom) * Math.min(1, dt * 7.5)
    this.camera.zoom = this.currentZoom

    const targetX = world.player.x
    const targetY = terrainHeightAt(world.player.x, world.player.z)
    const targetZ = world.player.z + 22
    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, dt * 6)
    this.camera.position.y += (targetY + 26 - this.camera.position.y) * Math.min(1, dt * 4.5)
    this.camera.position.z += (targetZ - this.camera.position.z) * Math.min(1, dt * 6)
    this.camera.lookAt(world.player.x, targetY, world.player.z)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()

    this.camRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize()
    this.camUp.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize()
  }

  private resize = (): void => {
    const parent = this.element.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    const aspect = width / height

    this.camera.left = -BASE_FRUSTUM * aspect * 0.5
    this.camera.right = BASE_FRUSTUM * aspect * 0.5
    this.camera.top = BASE_FRUSTUM * 0.5
    this.camera.bottom = -BASE_FRUSTUM * 0.5
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }
}
