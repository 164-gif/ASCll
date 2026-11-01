import * as THREE from 'three'
import { type EnemyState, type WorldState } from '../../simulation/WorldState'
import {
  RIVER_HALF_WIDTH,
  WORLD_BRIDGES,
  WORLD_FIRES,
  WORLD_ROAD_SEGMENTS,
  bridgeDeckHeightAt,
  isInsideRiver,
  riverSignedDistance,
  roadDistanceAt,
  terrainHeightAt,
  walkHeightAt,
  zoneAt,
  type WorldBridge,
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
const MAX_ROAD_SEGMENTS = 32
const WORLD_RENDER_SIZE = 202
const FOREST_CAMP_X = 55
const FOREST_CAMP_Z = 29

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
  private readonly fireFlames: THREE.Mesh[] = []
  private readonly ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(999, 999, 0, 0))
  private readonly camRight = new THREE.Vector3(1, 0, 0)
  private readonly camUp = new THREE.Vector3(0, 1, 0)
  private readonly torchPos = new THREE.Vector3()
  private readonly roadSegments = Array.from({ length: MAX_ROAD_SEGMENTS }, (_, index) => {
    const segment = WORLD_ROAD_SEGMENTS[index]
    return segment
      ? new THREE.Vector4(segment[0], segment[1], segment[2], segment[3])
      : new THREE.Vector4(999, 999, 999, 999)
  })
  private readonly worldLights = Array.from({ length: 8 }, (_, index) => {
    const light = WORLD_FIRES[index]
    return light
      ? new THREE.Vector4(light.x, light.z, light.strength, light.radius)
      : new THREE.Vector4(999, 999, 0, 1)
  })

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
    uWorldLights: { value: this.worldLights },
    uRoadSegments: { value: this.roadSegments },
    uRoadCount: { value: Math.min(MAX_ROAD_SEGMENTS, WORLD_ROAD_SEGMENTS.length) },
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
    this.buildBridges()
    this.buildLandmarks(world)
    this.buildFires()
    this.buildForestCamp()
    this.buildGrass(world)
    this.buildKnight()

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(parent)
    this.resize()
  }

  render(world: WorldState, dt: number): void {
    if (this.disposed) return

    const playerY = walkHeightAt(world.player.x, world.player.z)
    this.shared.uTime.value = world.elapsed
    this.shared.uPlayerPos.value.set(world.player.x, playerY, world.player.z)

    const torchTarget = world.torchOn ? 1 : 0
    this.shared.uTorchPower.value += (torchTarget - this.shared.uTorchPower.value) * Math.min(1, dt * 4.5)
    this.torchPos.set(
      world.player.x + Math.sin(world.player.facing) * 0.45,
      playerY + 1.45,
      world.player.z + Math.cos(world.player.facing) * 0.45,
    )

    for (let index = 0; index < this.fireFlames.length; index += 1) {
      const flame = this.fireFlames[index]!
      const phase = index * 1.73
      flame.scale.y = 0.86 + Math.sin(world.elapsed * 8.4 + phase) * 0.14
      flame.scale.x = 0.92 + Math.sin(world.elapsed * 6.1 + phase) * 0.08
      flame.rotation.y += dt * (0.7 + (index % 3) * 0.14)
    }

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
        uWorldLights: this.shared.uWorldLights,
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
    const geometry = new THREE.PlaneGeometry(WORLD_RENDER_SIZE, WORLD_RENDER_SIZE, 96, 96)
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

  private buildBridges(): void {
    const stone = this.createAsciiMaterial(0x8a8880, 0x171817, 5.2)
    const stoneDark = this.createAsciiMaterial(0x4e514f, 0x0b0d0c, 3.3)
    const wood = this.createAsciiMaterial(0x86613f, 0x1d1209, 6.4)

    for (const bridge of WORLD_BRIDGES) {
      if (bridge.style === 'stone') this.buildStoneBridge(bridge, stone, stoneDark)
      else this.buildWoodBridge(bridge, wood, stoneDark)
    }
  }

  private buildStoneBridge(bridge: WorldBridge, stone: ObjectMaterial, dark: ObjectMaterial): void {
    const deckHeight = terrainHeightAt(bridge.x, bridge.z) + bridge.deckOffset
    const group = new THREE.Group()
    group.position.set(bridge.x, deckHeight - 0.18, bridge.z)
    group.rotation.y = bridge.rotation

    const deck = new THREE.Mesh(new THREE.BoxGeometry(bridge.width, 0.36, bridge.length), stone)
    group.add(deck)

    const parapetGeometry = new THREE.BoxGeometry(0.28, 0.58, bridge.length * 0.98)
    const left = new THREE.Mesh(parapetGeometry, stone)
    left.position.set(-bridge.width * 0.48, 0.42, 0)
    const right = new THREE.Mesh(parapetGeometry.clone(), stone)
    right.position.set(bridge.width * 0.48, 0.42, 0)
    group.add(left, right)

    for (const z of [-bridge.length * 0.32, 0, bridge.length * 0.32]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(bridge.width * 0.72, 2.25, 0.72), dark)
      pier.position.set(0, -1.05, z)
      group.add(pier)
    }

    for (const z of [-bridge.length * 0.45, bridge.length * 0.45]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(bridge.width * 1.18, 0.48, 1.2), stone)
      cap.position.set(0, 0.05, z)
      group.add(cap)
    }

    this.scene.add(group)
  }

  private buildWoodBridge(bridge: WorldBridge, wood: ObjectMaterial, support: ObjectMaterial): void {
    const deckHeight = terrainHeightAt(bridge.x, bridge.z) + bridge.deckOffset
    const group = new THREE.Group()
    group.position.set(bridge.x, deckHeight, bridge.z)
    group.rotation.y = bridge.rotation

    const plankCount = 20
    const step = bridge.length / plankCount
    for (let i = 0; i < plankCount; i += 1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(bridge.width, 0.18, step * 0.82), wood)
      plank.position.set(0, -0.09 + Math.sin(i * 1.9) * 0.025, -bridge.length * 0.5 + step * (i + 0.5))
      plank.rotation.y = Math.sin(i * 2.3) * 0.018
      group.add(plank)
    }

    for (const side of [-1, 1]) {
      for (let i = 1; i < 6; i += 1) {
        const z = -bridge.length * 0.5 + (bridge.length / 6) * i
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), support)
        post.position.set(side * bridge.width * 0.48, 0.42, z)
        group.add(post)
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, bridge.length * 0.9), wood)
      rail.position.set(side * bridge.width * 0.48, 0.75, 0)
      group.add(rail)
    }

    this.scene.add(group)
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
      if (landmark.kind === 'gate') {
        this.buildGate(landmark, baseY, ruinStone, index)
        return
      }
      if (landmark.kind === 'tower') {
        this.buildTower(landmark, baseY, ruinStone, stone, index)
        return
      }
      if (landmark.kind === 'monolith') {
        const group = new THREE.Group()
        group.position.set(landmark.x, baseY, landmark.z)
        group.rotation.y = landmark.rotation ?? 0

        const base = new THREE.Mesh(new THREE.BoxGeometry(landmark.radius * 2.15, 0.8, landmark.radius * 1.65), stone)
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

    const trunkHeight = landmark.height * 0.78
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(landmark.radius * 0.2, landmark.radius * 0.32, trunkHeight, 8),
      bark,
    )
    trunk.position.y = trunkHeight * 0.5
    group.add(trunk)

    const crown = [
      { y: 0.4, radius: 2.35, height: 0.32 },
      { y: 0.54, radius: 2.08, height: 0.3 },
      { y: 0.68, radius: 1.7, height: 0.27 },
      { y: 0.81, radius: 1.3, height: 0.23 },
      { y: 0.91, radius: 0.84, height: 0.18 },
    ] as const

    crown.forEach((tier, tierIndex) => {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(
          landmark.radius * tier.radius * (0.93 + ((index + tierIndex) % 4) * 0.035),
          landmark.height * tier.height,
          9,
        ),
        pine,
      )
      mesh.position.set(
        Math.sin(index * 1.7 + tierIndex) * landmark.radius * 0.08,
        landmark.height * tier.y,
        Math.cos(index * 1.3 + tierIndex) * landmark.radius * 0.07,
      )
      mesh.rotation.y = index * 0.37 + tierIndex * 0.69
      group.add(mesh)
    })

    const branchGeometry = new THREE.CylinderGeometry(
      landmark.radius * 0.055,
      landmark.radius * 0.075,
      landmark.radius * 1.7,
      5,
    )
    for (let branchIndex = 0; branchIndex < 3; branchIndex += 1) {
      const branch = new THREE.Mesh(branchGeometry.clone(), bark)
      const side = branchIndex % 2 === 0 ? 1 : -1
      branch.position.set(side * landmark.radius * (0.38 + branchIndex * 0.08), landmark.height * (0.33 + branchIndex * 0.07), 0)
      branch.rotation.z = side * Math.PI * (0.36 + branchIndex * 0.035)
      branch.rotation.y = index * 0.37 + branchIndex * 1.8
      group.add(branch)
    }

    this.scene.add(group)
  }

  private buildRuin(landmark: WorldLandmark, baseY: number, material: ObjectMaterial, index: number): void {
    const group = new THREE.Group()
    group.position.set(landmark.x, baseY, landmark.z)
    group.rotation.y = landmark.rotation ?? 0

    const wallWidth = landmark.radius * 2.45
    const opening = landmark.radius * 0.72
    const sideWidth = Math.max(0.36, (wallWidth - opening) * 0.5)
    const left = new THREE.Mesh(new THREE.BoxGeometry(sideWidth, landmark.height, 0.46), material)
    left.position.set(-(opening + sideWidth) * 0.5, landmark.height * 0.5, 0)
    const right = new THREE.Mesh(new THREE.BoxGeometry(sideWidth * 0.88, landmark.height * 0.82, 0.46), material)
    right.position.set((opening + sideWidth) * 0.5, landmark.height * 0.41, 0)
    right.rotation.z = ((index % 3) - 1) * 0.035
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(wallWidth, 0.42, 0.52), material)
    lintel.position.set(0, landmark.height * 0.86, 0)
    lintel.rotation.z = 0.025 * ((index % 2) * 2 - 1)
    group.add(left, right, lintel)

    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.46, landmark.height * 0.72, landmark.radius * 1.9), material)
    sideWall.position.set(landmark.radius * 0.82, landmark.height * 0.36, landmark.radius * 0.3)
    sideWall.rotation.y = 0.05
    group.add(sideWall)

    const fallen = new THREE.Mesh(new THREE.BoxGeometry(landmark.radius * 1.35, 0.34, 0.52), material)
    fallen.position.set(-landmark.radius * 0.55, 0.2, landmark.radius * 0.8)
    fallen.rotation.y = 0.6
    fallen.rotation.z = 0.08
    group.add(fallen)

    this.scene.add(group)
  }

  private buildGate(landmark: WorldLandmark, baseY: number, material: ObjectMaterial, index: number): void {
    const group = new THREE.Group()
    group.position.set(landmark.x, baseY, landmark.z)
    group.rotation.y = landmark.rotation ?? 0

    const opening = landmark.radius * 1.25
    const pillarWidth = landmark.radius * 0.46
    const pillarHeight = landmark.height * 0.9
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(pillarWidth, pillarHeight, landmark.radius * 0.65), material)
      pillar.position.set(side * (opening * 0.5 + pillarWidth * 0.5), pillarHeight * 0.5, 0)
      pillar.rotation.z = side * Math.sin(index * 1.9) * 0.018
      group.add(pillar)

      const cap = new THREE.Mesh(new THREE.BoxGeometry(pillarWidth * 1.35, 0.34, landmark.radius * 0.82), material)
      cap.position.set(side * (opening * 0.5 + pillarWidth * 0.5), pillarHeight + 0.12, 0)
      group.add(cap)
    }

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(opening + pillarWidth * 2.2, 0.5, landmark.radius * 0.72), material)
    lintel.position.y = landmark.height
    group.add(lintel)

    const brokenTop = new THREE.Mesh(new THREE.BoxGeometry(landmark.radius * 0.7, 0.42, landmark.radius * 0.6), material)
    brokenTop.position.set(landmark.radius * 0.52, landmark.height + 0.42, 0)
    brokenTop.rotation.z = 0.11
    group.add(brokenTop)

    this.scene.add(group)
  }

  private buildTower(
    landmark: WorldLandmark,
    baseY: number,
    material: ObjectMaterial,
    trim: ObjectMaterial,
    index: number,
  ): void {
    const group = new THREE.Group()
    group.position.set(landmark.x, baseY, landmark.z)
    group.rotation.y = landmark.rotation ?? 0

    const bodyHeight = landmark.height * 0.83
    const body = new THREE.Mesh(new THREE.BoxGeometry(landmark.radius * 1.75, bodyHeight, landmark.radius * 1.75), material)
    body.position.y = bodyHeight * 0.5
    group.add(body)

    const crownY = bodyHeight + 0.36
    const battlementSize = landmark.radius * 0.42
    const battlementPositions = [
      [-0.56, -0.56], [0, -0.56], [0.56, -0.56],
      [-0.56, 0.56], [0, 0.56], [0.56, 0.56],
      [-0.56, 0], [0.56, 0],
    ] as const
    for (const [x, z] of battlementPositions) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(battlementSize, 0.72, battlementSize), trim)
      block.position.set(x * landmark.radius * 1.45, crownY, z * landmark.radius * 1.45)
      group.add(block)
    }

    const fallen = new THREE.Mesh(new THREE.BoxGeometry(landmark.radius * 1.4, 0.34, 0.45), trim)
    fallen.position.set(landmark.radius * 0.82, 0.2, landmark.radius * 0.95)
    fallen.rotation.y = index * 0.9
    group.add(fallen)

    this.scene.add(group)
  }

  private buildFires(): void {
    const stone = this.createAsciiMaterial(0x635e55, 0x151310, 8.1)
    const ember = this.createAsciiMaterial(0xffb229, 0x5b1700, 19.2, 0.92)

    WORLD_FIRES.forEach((fire, index) => {
      const group = new THREE.Group()
      group.position.set(fire.x, terrainHeightAt(fire.x, fire.z), fire.z)

      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (i % 2) * 0.04, 0), stone)
        rock.position.set(Math.cos(angle) * 0.48, 0.15, Math.sin(angle) * 0.48)
        group.add(rock)
      }

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.08, 7), ember)
      flame.position.y = 0.62
      flame.rotation.y = index * 0.7
      group.add(flame)
      this.fireFlames.push(flame)

      const flameCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), ember)
      flameCore.position.y = 0.42
      group.add(flameCore)
      this.scene.add(group)
    })
  }

  private buildForestCamp(): void {
    const baseY = terrainHeightAt(FOREST_CAMP_X, FOREST_CAMP_Z)
    const camp = new THREE.Group()
    camp.position.set(FOREST_CAMP_X, baseY, FOREST_CAMP_Z)
    camp.rotation.y = -0.22

    const canvas = this.createAsciiMaterial(0xa79b7d, 0x29271f, 6.8)
    const canvasDark = this.createAsciiMaterial(0x6f6b58, 0x171713, 4.2)
    const wood = this.createAsciiMaterial(0x775035, 0x170e08, 3.8)
    const rope = this.createAsciiMaterial(0xbca777, 0x332719, 10.4)
    const clothPale = this.createAsciiMaterial(0xc4bda5, 0x3a342b, 12.3)
    const clothRed = this.createAsciiMaterial(0x87483b, 0x230d0c, 14.2)
    const cloak = this.createAsciiMaterial(0x51483f, 0x100d0b, 8.6)
    const hair = this.createAsciiMaterial(0xd6d8d1, 0x5d615c, 2.4, 0.08)

    const addTent = (x: number, z: number, width: number, depth: number, height: number, yaw: number): void => {
      const tent = new THREE.Group()
      tent.position.set(x, 0.04, z)
      tent.rotation.y = yaw
      const slope = Math.hypot(width * 0.5, height)
      const angle = Math.atan2(height, width * 0.5)
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.09, depth), side === -1 ? canvas : canvasDark)
        panel.position.set(side * width * 0.25, height * 0.5, 0)
        panel.rotation.z = -side * angle
        tent.add(panel)
      }
      for (const end of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, height + 0.3, 6), wood)
        pole.position.set(0, (height + 0.3) * 0.5, end * depth * 0.5)
        tent.add(pole)
      }
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, depth + 0.35), wood)
      ridge.position.y = height
      tent.add(ridge)
      const back = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, height * 0.72, 0.08), canvasDark)
      back.position.set(0, height * 0.36, depth * 0.5 - 0.04)
      tent.add(back)
      camp.add(tent)
    }

    addTent(2.8, 2.4, 4.8, 5.5, 2.7, 0.2)
    addTent(-4.5, 2.5, 2.7, 3.1, 1.65, -0.45)

    const crateGeometry = new THREE.BoxGeometry(0.8, 0.65, 0.8)
    for (const [x, z, r] of [[0.7, 3.6, 0.1], [1.6, 3.8, -0.2], [-2.2, 2.8, 0.25]] as const) {
      const crate = new THREE.Mesh(crateGeometry.clone(), wood)
      crate.position.set(x, 0.34, z)
      crate.rotation.y = r
      camp.add(crate)
    }

    const postHeight = 2.35
    for (const x of [-0.6, 4.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, postHeight, 6), wood)
      post.position.set(x, postHeight * 0.5, 5.3)
      camp.add(post)
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.035, 0.035), rope)
    line.position.set(1.8, 1.95, 5.3)
    camp.add(line)

    const hanging = [
      { x: 0.25, width: 0.9, height: 0.72, mat: clothPale },
      { x: 1.55, width: 1.05, height: 0.82, mat: clothRed },
      { x: 2.95, width: 0.82, height: 0.64, mat: clothPale },
    ]
    for (const cloth of hanging) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(cloth.width, cloth.height, 0.045), cloth.mat)
      mesh.position.set(cloth.x, 1.58, 5.3)
      mesh.rotation.z = Math.sin(cloth.x * 2.1) * 0.04
      camp.add(mesh)
    }

    const oldMan = new THREE.Group()
    oldMan.position.set(-1.3, 0, -1.3)
    oldMan.rotation.y = 0.65
    const stool = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.34, 0.72), wood)
    stool.position.y = 0.17
    oldMan.add(stool)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.84, 0.52), cloak)
    torso.position.set(0, 0.86, 0)
    torso.rotation.x = 0.18
    oldMan.add(torso)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 8, 7), hair)
    head.position.set(0, 1.46, -0.08)
    oldMan.add(head)
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.48, 6), hair)
    beard.position.set(0, 1.19, -0.19)
    beard.rotation.x = 0.18
    oldMan.add(beard)
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.2), cloak)
      leg.position.set(side * 0.2, 0.48, -0.34)
      leg.rotation.x = -0.62
      oldMan.add(leg)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.58, 0.16), cloak)
      arm.position.set(side * 0.38, 0.88, -0.2)
      arm.rotation.x = -0.7
      arm.rotation.z = side * 0.28
      oldMan.add(arm)
    }
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.55, 5), wood)
    staff.position.set(0.52, 0.78, -0.52)
    staff.rotation.z = 0.12
    oldMan.add(staff)
    camp.add(oldMan)

    for (let i = 0; i < 3; i += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.55 + i * 0.18, 7), wood)
      log.position.set(-4.5 + i * 0.42, 0.22, -1.6 + i * 0.18)
      log.rotation.z = Math.PI * 0.5
      log.rotation.y = 0.15 * i
      camp.add(log)
    }

    this.scene.add(camp)
  }

  private buildGrass(world: WorldState): void {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const bladeCount = coarse ? 76000 : 164000
    const spread = 182

    const base = new THREE.BufferGeometry()
    base.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([
          -0.045, 0, 0, 0.045, 0, 0, 0, 1, 0,
          0, 0, -0.045, 0, 0, 0.045, 0, 1, 0,
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

    while (valid < bladeCount && attempts < bladeCount * 8) {
      attempts += 1
      const x = (random() - 0.5) * spread
      const z = (random() - 0.5) * spread
      const riverDist = Math.abs(riverSignedDistance(x, z))
      if (riverDist < RIVER_HALF_WIDTH + 0.08) continue
      if (roadDistanceAt(x, z) < 0.72) continue
      if (Math.hypot(x - FOREST_CAMP_X, z - FOREST_CAMP_Z) < 6.3) continue

      const zone = zoneAt(x, z)
      const density =
        zone.id === 'meadow' ? 1 :
        zone.id === 'forest' ? 0.985 :
        zone.id === 'ruins' ? 0.94 :
        zone.id === 'river' ? 0.9 :
        zone.id === 'wilds' ? 0.88 :
        0.76
      if (random() > density) continue

      let blocked = false
      for (const obstacle of world.trees) {
        const dx = x - obstacle.x
        const dz = z - obstacle.z
        const radius = obstacle.radius * (obstacle.kind === 'tree' ? 0.5 : 0.8)
        if (dx * dx + dz * dz < radius * radius) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      offsets[valid * 3] = x
      offsets[valid * 3 + 1] = terrainHeightAt(x, z)
      offsets[valid * 3 + 2] = z

      const bank = Math.min(1, Math.max(0, (riverDist - RIVER_HALF_WIDTH) * 0.42))
      let height = 0.4 + random() * 0.53
      let flowerChance = 0.04
      if (zone.id === 'meadow') {
        height *= 1.34
        flowerChance = 0.125
      } else if (zone.id === 'forest') {
        height *= 1.02
        flowerChance = 0.022
      } else if (zone.id === 'highland') {
        height *= 0.72
        flowerChance = 0.018
      } else if (zone.id === 'ruins') {
        height *= 0.94
        flowerChance = 0.035
      }
      height *= 0.8 + 0.2 * bank

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
        uWorldLights: this.shared.uWorldLights,
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
    const onBridge = bridgeDeckHeightAt(world.player.x, world.player.z) !== null
    const sink = isInsideRiver(world.player.x, world.player.z) && !onBridge
      ? -0.28 * Math.min(1, (RIVER_HALF_WIDTH - riverDistance) * 0.6)
      : 0
    const baseY = walkHeightAt(world.player.x, world.player.z)

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
      const onBridge = bridgeDeckHeightAt(enemy.x, enemy.z) !== null
      const baseY = walkHeightAt(enemy.x, enemy.z)
      group.position.set(enemy.x, baseY + (isInsideRiver(enemy.x, enemy.z) && !onBridge ? -0.2 : 0), enemy.z)
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
    const onBridge = bridgeDeckHeightAt(world.player.x, world.player.z) !== null
    if (isInsideRiver(world.player.x, world.player.z) && !onBridge && moved > 0.002) {
      this.stepDistance += moved
      if (this.stepDistance > 0.8) {
        this.stepDistance = 0
        this.spawnRipple(world.player.x, world.player.z, 0.9, 0.22)
      }
    }

    if (world.player.attackPulse > this.lastAttackPulse + 0.08) {
      const x = world.player.x + Math.sin(world.player.facing) * 1.1
      const z = world.player.z + Math.cos(world.player.facing) * 1.1
      if ((isInsideRiver(x, z) || isInsideRiver(world.player.x, world.player.z)) && bridgeDeckHeightAt(x, z) === null) {
        this.spawnRipple(x, z, 1.35, 0.4)
      }
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
    const targetY = walkHeightAt(world.player.x, world.player.z)
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
