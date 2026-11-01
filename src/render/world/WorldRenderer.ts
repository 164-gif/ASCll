import * as THREE from 'three'
import { isInsideRiver, riverSignedDistance, type EnemyState, type WorldState } from '../../simulation/WorldState'
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
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 200)
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

    this.shared.uTime.value = world.elapsed
    this.shared.uPlayerPos.value.set(world.player.x, 0, world.player.z)
    const torchTarget = world.torchOn ? 1 : 0
    this.shared.uTorchPower.value += (torchTarget - this.shared.uTorchPower.value) * Math.min(1, dt * 4.5)
    this.torchPos.set(
      world.player.x + Math.sin(world.player.facing) * 0.45,
      1.45,
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
    const geometry = new THREE.PlaneGeometry(110, 110, 1, 1)
    geometry.rotateX(-Math.PI / 2)
    const material = new THREE.ShaderMaterial({
      vertexShader: groundVertexShader,
      fragmentShader: groundFragmentShader,
      uniforms: this.shared,
    })
    this.scene.add(new THREE.Mesh(geometry, material))
  }

  private buildLandmarks(world: WorldState): void {
    const stone = this.createAsciiMaterial(0x7c858e, 0x161a1e, 1.3)
    const moss = this.createAsciiMaterial(0x68766c, 0x141916, 4.7)

    world.trees.forEach((landmark, index) => {
      if (landmark.height > 3.5) {
        const group = new THREE.Group()
        group.position.set(landmark.x, 0, landmark.z)

        const base = new THREE.Mesh(
          new THREE.BoxGeometry(landmark.radius * 2.1, 0.8, landmark.radius * 1.6),
          stone,
        )
        base.position.y = 0.4
        group.add(base)

        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(landmark.radius * 1.45, landmark.height, landmark.radius * 1.15),
          stone,
        )
        pillar.position.y = landmark.height * 0.5
        group.add(pillar)
        this.scene.add(group)
        return
      }

      const geometry = new THREE.DodecahedronGeometry(1, 1)
      geometry.scale(landmark.radius, landmark.height, landmark.radius * (0.72 + (index % 3) * 0.1))
      const mesh = new THREE.Mesh(geometry, index % 2 === 0 ? stone : moss)
      mesh.position.set(landmark.x, landmark.height * 0.34, landmark.z)
      mesh.rotation.set(0.08 * (index % 2), index * 1.1, 0.04 * (index % 3))
      this.scene.add(mesh)
    })
  }

  private buildGrass(world: WorldState): void {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const bladeCount = coarse ? 24000 : 48000
    const spread = 54
    const base = new THREE.BufferGeometry()
    base.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          -0.042, 0, 0,
          0.042, 0, 0,
          0, 1, 0,
        ]),
        3,
      ),
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

    while (valid < bladeCount && attempts < bladeCount * 3) {
      attempts += 1
      const x = (random() - 0.5) * spread
      const z = (random() - 0.5) * spread
      const riverDist = Math.abs(riverSignedDistance(x, z))
      if (riverDist < 6.95) continue

      let blocked = false
      for (const obstacle of world.trees) {
        const dx = x - obstacle.x
        const dz = z - obstacle.z
        const radius = obstacle.radius * 1.05
        if (dx * dx + dz * dz < radius * radius) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      offsets[valid * 3] = x
      offsets[valid * 3 + 1] = 0
      offsets[valid * 3 + 2] = z

      const bank = Math.min(1, (riverDist - 6.8) * 0.5)
      const height = (0.38 + random() * 0.42) * (0.45 + 0.55 * bank)
      const flowerRoll = random()
      scaleRot[valid * 3] = height
      scaleRot[valid * 3 + 1] = random()
      scaleRot[valid * 3 + 2] = flowerRoll > 0.962 ? (flowerRoll > 0.992 ? 2 : 1) : 0
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

    const sink = isInsideRiver(world.player.x, world.player.z)
      ? -0.28 * Math.min(1, (6.8 - Math.abs(riverSignedDistance(world.player.x, world.player.z))) * 0.6)
      : 0

    this.playerGroup.position.set(world.player.x, sink, world.player.z)
    this.playerGroup.rotation.y = world.player.facing

    const legSwing = moving ? Math.sin(this.walkCycle) * 0.55 : 0
    if (this.leftLeg) this.leftLeg.rotation.x = legSwing
    if (this.rightLeg) this.rightLeg.rotation.x = -legSwing

    if (this.capeMesh) {
      this.capeMesh.rotation.x = 0.2 + (moving ? 0.28 : 0.04) + Math.sin(world.elapsed * 4.5) * 0.07
      this.capeMesh.rotation.z = Math.cos(world.elapsed * 3.2) * 0.05
    }

    const attacking = world.player.attackPulse > 0
    if (attacking) {
      const phase = 1 - world.player.attackPulse / 0.34
      if (this.rightArm) {
        this.rightArm.rotation.y = -1.2 + phase * 2.5
        this.rightArm.rotation.x = 0.35
      }
      if (this.slashMesh) {
        this.slashMesh.visible = true
        this.slashMesh.rotation.y = phase * 1.4
      }
      this.shared.uSwingTime.value = Math.sin(phase * Math.PI)
    } else {
      if (this.rightArm) {
        this.rightArm.rotation.y = Math.sin(world.elapsed * 2) * 0.08
        this.rightArm.rotation.x = 0.15 + (moving ? Math.cos(this.walkCycle) * 0.25 : 0)
      }
      if (this.slashMesh) this.slashMesh.visible = false
      this.shared.uSwingTime.value = 0
    }

    this.lastX = world.player.x
    this.lastZ = world.player.z
  }

  private createEnemy(enemy: EnemyState): THREE.Group {
    const group = new THREE.Group()
    const bodyMaterial = this.createAsciiMaterial(0x9b343d, 0x24070b, 19 + enemy.id, 0.08)
    const eyeMaterial = this.createAsciiMaterial(0xffb09c, 0x5a1513, 27 + enemy.id, 0.45)

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.5, 6), bodyMaterial)
    body.position.y = 0.75
    group.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 6), bodyMaterial)
    head.position.y = 1.48
    group.add(head)

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), eyeMaterial)
    eye.position.set(0, 1.5, 0.2)
    group.add(eye)

    group.userData.bodyMaterial = bodyMaterial
    group.position.set(enemy.x, 0, enemy.z)
    this.scene.add(group)
    this.enemyMeshes.set(enemy.id, group)
    return group
  }

  private syncEnemies(enemies: EnemyState[]): void {
    const alive = new Set<number>()
    for (const enemy of enemies) {
      alive.add(enemy.id)
      const group = this.enemyMeshes.get(enemy.id) ?? this.createEnemy(enemy)
      group.position.set(enemy.x, isInsideRiver(enemy.x, enemy.z) ? -0.2 : 0, enemy.z)
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
    const targetZ = world.player.z + 22
    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1, dt * 6)
    this.camera.position.z += (targetZ - this.camera.position.z) * Math.min(1, dt * 6)
    this.camera.lookAt(world.player.x, 0, world.player.z)
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
