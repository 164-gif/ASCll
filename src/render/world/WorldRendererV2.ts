import * as THREE from 'three'
import { type EnemyState, type WorldState } from '../../simulation/WorldState'
import {
  RIVER_HALF_WIDTH,
  WORLD_BRIDGES,
  WORLD_FIRES,
  WORLD_ROADS,
  WORLD_STRUCTURES,
  bridgeDeckHeightAt,
  isInsideRiver,
  riverCenterZ,
  riverSignedDistance,
  roadDistanceAt,
  terrainHeightAt,
  walkHeightAt,
  zoneAt,
  type WorldBridge,
  type WorldLandmark,
  type WorldStructure,
} from '../../world/WorldLayout'

const BASE_FRUSTUM = 21
const WORLD_RENDER_SIZE = 202

type SurfaceKind = 'ground' | 'road' | 'stone' | 'moss-stone' | 'wood' | 'water'

function seeded(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

function makePatternTexture(kind: SurfaceKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = kind === 'road' ? 512 : 384
  canvas.height = kind === 'road' ? 768 : 384
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D texture context unavailable')
  const random = seeded(kind.split('').reduce((sum, char) => sum + char.charCodeAt(0) * 997, 17))

  const fillNoise = (base: string, dots: string[], count: number): void => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < count; i += 1) {
      const x = random() * canvas.width
      const y = random() * canvas.height
      const r = 2 + random() * 11
      ctx.globalAlpha = 0.06 + random() * 0.08
      ctx.fillStyle = dots[Math.floor(random() * dots.length)]!
      ctx.beginPath()
      ctx.ellipse(x, y, r * (0.7 + random()), r * (0.35 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  if (kind === 'ground') {
    fillNoise('#243126', ['#40543e', '#17251c', '#52604b'], 115)
    ctx.font = '12px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(184,205,177,.16)'
    for (let i = 0; i < 46; i += 1) ctx.fillText(i % 3 === 0 ? "'" : '·', random() * canvas.width, random() * canvas.height)
  } else if (kind === 'road') {
    ctx.fillStyle = '#4a4235'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const center = canvas.width * 0.5
    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0)
    grad.addColorStop(0, '#342f28')
    grad.addColorStop(0.18, '#514a3d')
    grad.addColorStop(0.5, '#625847')
    grad.addColorStop(0.82, '#514a3d')
    grad.addColorStop(1, '#342f28')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(30,26,22,.26)'
    ctx.fillRect(center - 116, 0, 28, canvas.height)
    ctx.fillRect(center + 88, 0, 28, canvas.height)
    ctx.strokeStyle = 'rgba(210,196,158,.16)'
    ctx.lineWidth = 3
    for (let y = 18; y < canvas.height; y += 54) {
      ctx.beginPath()
      ctx.moveTo(34 + Math.sin(y * 0.02) * 8, y)
      ctx.bezierCurveTo(150, y - 7, 360, y + 6, canvas.width - 34, y - 2)
      ctx.stroke()
    }
    ctx.font = '18px ui-monospace, monospace'
    const marks = ['-', '—', '.', ':']
    for (let i = 0; i < 78; i += 1) {
      ctx.globalAlpha = 0.12 + random() * 0.12
      ctx.fillStyle = i % 5 === 0 ? '#d5c49a' : '#29261f'
      ctx.fillText(marks[i % marks.length]!, 28 + random() * (canvas.width - 56), random() * canvas.height)
    }
    ctx.globalAlpha = 1
  } else if (kind === 'stone' || kind === 'moss-stone') {
    ctx.fillStyle = kind === 'stone' ? '#686b67' : '#59645b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const rowH = 48
    ctx.lineWidth = 5
    ctx.strokeStyle = '#222824'
    for (let row = 0; row <= canvas.height / rowH; row += 1) {
      const y = row * rowH
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
      const offset = row % 2 === 0 ? 0 : 52
      for (let x = -offset; x < canvas.width; x += 104) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + rowH)
        ctx.stroke()
      }
    }
    for (let i = 0; i < 55; i += 1) {
      ctx.globalAlpha = 0.07 + random() * 0.08
      ctx.fillStyle = random() > 0.5 ? '#d0cec1' : '#141815'
      ctx.fillRect(random() * canvas.width, random() * canvas.height, 10 + random() * 42, 3 + random() * 9)
    }
    if (kind === 'moss-stone') {
      ctx.globalAlpha = 0.38
      ctx.fillStyle = '#334b35'
      for (let i = 0; i < 32; i += 1) {
        ctx.beginPath()
        ctx.ellipse(random() * canvas.width, random() * canvas.height, 10 + random() * 32, 4 + random() * 12, random() * Math.PI, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    ctx.font = '13px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(238,236,221,.18)'
    for (let i = 0; i < 28; i += 1) ctx.fillText(i % 2 ? '#' : '+', random() * canvas.width, random() * canvas.height)
  } else if (kind === 'wood') {
    ctx.fillStyle = '#6d4c32'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#29180e'
    ctx.lineWidth = 5
    const plankH = 44
    for (let y = 0; y <= canvas.height; y += plankH) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(230,185,126,.2)'
    for (let i = 0; i < 80; i += 1) {
      const y = random() * canvas.height
      ctx.beginPath()
      ctx.moveTo(random() * 80, y)
      ctx.bezierCurveTo(140, y + random() * 12 - 6, 330, y + random() * 12 - 6, canvas.width - random() * 80, y)
      ctx.stroke()
    }
  } else {
    ctx.fillStyle = '#102630'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
    grad.addColorStop(0, '#18333d')
    grad.addColorStop(0.5, '#0d242d')
    grad.addColorStop(1, '#17313b')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = 'rgba(190,221,228,.26)'
    ctx.lineWidth = 2
    for (let y = 12; y < canvas.height; y += 22) {
      ctx.beginPath()
      for (let x = 0; x <= canvas.width; x += 16) {
        const py = y + Math.sin(x * 0.055 + y * 0.02) * 3
        if (x === 0) ctx.moveTo(x, py)
        else ctx.lineTo(x, py)
      }
      ctx.stroke()
    }
    ctx.font = '14px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(221,240,243,.28)'
    for (let i = 0; i < 42; i += 1) ctx.fillText(i % 3 === 0 ? '~' : '=', random() * canvas.width, random() * canvas.height)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function colorForZone(id: string): THREE.Color {
  if (id === 'forest') return new THREE.Color(0x36543b)
  if (id === 'meadow') return new THREE.Color(0x65784e)
  if (id === 'highland') return new THREE.Color(0x55594e)
  if (id === 'ruins') return new THREE.Color(0x4c5748)
  if (id === 'river') return new THREE.Color(0x344b42)
  return new THREE.Color(0x41553e)
}

export class WorldRenderer {
  readonly element: HTMLCanvasElement

  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 260)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private readonly resizeObserver: ResizeObserver
  private readonly playerGroup = new THREE.Group()
  private readonly enemyMeshes = new Map<number, THREE.Group>()
  private readonly textures: THREE.Texture[] = []
  private readonly waterTexture = makePatternTexture('water')
  private readonly fireLights: THREE.PointLight[] = []

  private capeMesh: THREE.Mesh | null = null
  private leftLeg: THREE.Mesh | null = null
  private rightLeg: THREE.Mesh | null = null
  private rightArm: THREE.Group | null = null
  private slashMesh: THREE.Mesh | null = null
  private currentZoom = 1.12
  private targetZoom = 1.12
  private walkCycle = 0
  private lastX = -0.5
  private lastZ = 2.2
  private disposed = false

  constructor(parent: HTMLElement, world: WorldState) {
    this.scene.background = new THREE.Color(0x070a08)
    this.scene.fog = new THREE.FogExp2(0x090d0a, 0.0095)

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(16, 16, false)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.element = this.renderer.domElement
    this.element.className = 'world-glyph-canvas'
    parent.append(this.element)

    this.camera.position.set(0, 27, 23)
    this.camera.lookAt(0, 0, 0)
    this.camera.zoom = this.currentZoom
    this.camera.updateProjectionMatrix()

    const ambient = new THREE.HemisphereLight(0xaebdb2, 0x101710, 1.55)
    this.scene.add(ambient)
    const moon = new THREE.DirectionalLight(0xc4d4df, 2.4)
    moon.position.set(-28, 42, 18)
    moon.castShadow = true
    moon.shadow.mapSize.set(1024, 1024)
    moon.shadow.camera.left = -38
    moon.shadow.camera.right = 38
    moon.shadow.camera.top = 38
    moon.shadow.camera.bottom = -38
    this.scene.add(moon)

    this.textures.push(this.waterTexture)
    this.buildGround()
    this.buildRiver()
    this.buildRoads()
    this.buildBridges()
    this.buildStructures()
    this.buildLandmarks(world)
    this.buildFires()
    this.buildGrass(world)
    this.buildKnight()

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(parent)
    this.resize()
  }

  render(world: WorldState, dt: number): void {
    if (this.disposed) return
    this.waterTexture.offset.y -= dt * 0.035
    this.waterTexture.offset.x += dt * 0.008

    for (let index = 0; index < this.fireLights.length; index += 1) {
      const light = this.fireLights[index]!
      light.intensity = 18 + Math.sin(world.elapsed * 8.2 + index * 1.7) * 4
    }

    this.syncPlayer(world, dt)
    this.syncEnemies(world.enemies)
    this.syncCamera(world, dt)
    this.renderer.render(this.scene, this.camera)
  }

  adjustZoom(delta: number): void {
    if (delta === 0) return
    const factor = delta > 0 ? Math.pow(1.16, delta) : Math.pow(0.86, -delta)
    this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * factor, 0.75, 4.8)
  }

  toggleMacroZoom(): void {
    this.targetZoom = this.targetZoom < 2.2 ? 3.25 : 1.12
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
    for (const texture of this.textures) texture.dispose()
    this.renderer.dispose()
    this.element.remove()
  }

  private material(kind: SurfaceKind, repeatX: number, repeatY: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const texture = makePatternTexture(kind)
    texture.repeat.set(repeatX, repeatY)
    this.textures.push(texture)
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0.01,
      ...options,
    })
  }

  private buildGround(): void {
    const geometry = new THREE.PlaneGeometry(WORLD_RENDER_SIZE, WORLD_RENDER_SIZE, 128, 128)
    geometry.rotateX(-Math.PI / 2)
    const position = geometry.attributes.position
    const colors = new Float32Array(position.count * 3)

    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i)
      const z = position.getZ(i)
      position.setY(i, terrainHeightAt(x, z))
      const color = colorForZone(zoneAt(x, z).id)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    position.needsUpdate = true
    geometry.computeVertexNormals()

    const texture = makePatternTexture('ground')
    texture.repeat.set(22, 22)
    this.textures.push(texture)
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    this.scene.add(mesh)
  }

  private buildRiver(): void {
    const samples = 180
    const vertices: number[] = []
    const uvs: number[] = []
    const indices: number[] = []

    for (let i = 0; i <= samples; i += 1) {
      const x = -101 + (202 * i) / samples
      const z = riverCenterZ(x)
      const zNext = riverCenterZ(x + 0.2)
      const tx = 1
      const tz = (zNext - z) / 0.2
      const length = Math.hypot(tx, tz)
      const nx = -tz / length
      const nz = tx / length
      const centerY = terrainHeightAt(x, z) + 0.08

      for (const side of [-1, 1]) {
        const px = x + nx * RIVER_HALF_WIDTH * side
        const pz = z + nz * RIVER_HALF_WIDTH * side
        vertices.push(px, centerY, pz)
        uvs.push(side < 0 ? 0 : 1, i / 4)
      }
      if (i < samples) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    this.waterTexture.repeat.set(2.6, 1.0)
    const material = new THREE.MeshStandardMaterial({
      map: this.waterTexture,
      color: 0x8eb6bd,
      emissive: 0x0b1c22,
      emissiveIntensity: 0.55,
      roughness: 0.42,
      metalness: 0.08,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
    const river = new THREE.Mesh(geometry, material)
    river.receiveShadow = true
    this.scene.add(river)
  }

  private buildRoads(): void {
    const roadMaterial = this.material('road', 1.2, 4.5, { color: 0xd0c2a1, roughness: 1 })

    for (const road of WORLD_ROADS) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const a = road.points[index]!
        const b = road.points[index + 1]!
        const dx = b[0] - a[0]
        const dz = b[1] - a[1]
        const length = Math.hypot(dx, dz)
        const parts = Math.max(1, Math.ceil(length / 4))
        const angle = Math.atan2(dx, dz)

        for (let part = 0; part < parts; part += 1) {
          const t0 = part / parts
          const t1 = (part + 1) / parts
          const mx = a[0] + dx * (t0 + t1) * 0.5
          const mz = a[1] + dz * (t0 + t1) * 0.5
          const segmentLength = length / parts + 0.18
          const geometry = new THREE.BoxGeometry(road.width, 0.09, segmentLength)
          const mesh = new THREE.Mesh(geometry, roadMaterial)
          mesh.position.set(mx, terrainHeightAt(mx, mz) + 0.045, mz)
          mesh.rotation.y = angle
          mesh.receiveShadow = true
          this.scene.add(mesh)
        }
      }
    }
  }

  private buildBridges(): void {
    const stone = this.material('stone', 1.8, 2.8, { color: 0xd0cbbd })
    const darkStone = this.material('moss-stone', 1.5, 2.5, { color: 0x80867c })
    const wood = this.material('wood', 1.5, 5.5, { color: 0xd0a16f })

    for (const bridge of WORLD_BRIDGES) {
      if (bridge.style === 'stone') this.buildStoneBridge(bridge, stone, darkStone)
      else this.buildWoodBridge(bridge, wood, darkStone)
    }
  }

  private buildStoneBridge(bridge: WorldBridge, stone: THREE.Material, dark: THREE.Material): void {
    const deckHeight = terrainHeightAt(bridge.x, bridge.z) + bridge.deckOffset
    const group = new THREE.Group()
    group.position.set(bridge.x, deckHeight, bridge.z)
    group.rotation.y = bridge.rotation

    const deck = new THREE.Mesh(new THREE.BoxGeometry(bridge.width, 0.45, bridge.length), stone)
    deck.position.y = -0.12
    deck.castShadow = true
    deck.receiveShadow = true
    group.add(deck)

    for (const side of [-1, 1]) {
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, bridge.length), stone)
      parapet.position.set(side * bridge.width * 0.48, 0.34, 0)
      parapet.castShadow = true
      group.add(parapet)
    }

    for (const z of [-bridge.length * 0.34, 0, bridge.length * 0.34]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(bridge.width * 0.74, 2.8, 1.0), dark)
      pier.position.set(0, -1.6, z)
      pier.castShadow = true
      group.add(pier)
    }

    for (const z of [-bridge.length * 0.48, bridge.length * 0.48]) {
      const towerLeft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.45, 0.9), stone)
      towerLeft.position.set(-bridge.width * 0.48, 0.62, z)
      const towerRight = towerLeft.clone()
      towerRight.position.x = bridge.width * 0.48
      group.add(towerLeft, towerRight)
    }

    this.scene.add(group)
  }

  private buildWoodBridge(bridge: WorldBridge, wood: THREE.Material, support: THREE.Material): void {
    const deckHeight = terrainHeightAt(bridge.x, bridge.z) + bridge.deckOffset
    const group = new THREE.Group()
    group.position.set(bridge.x, deckHeight, bridge.z)
    group.rotation.y = bridge.rotation

    const count = 24
    const step = bridge.length / count
    for (let i = 0; i < count; i += 1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(bridge.width, 0.18, step * 0.88), wood)
      plank.position.set(0, Math.sin(i * 1.4) * 0.025, -bridge.length * 0.5 + step * (i + 0.5))
      plank.rotation.y = Math.sin(i * 2.1) * 0.01
      plank.castShadow = true
      group.add(plank)
    }

    for (const side of [-1, 1]) {
      for (let i = 0; i <= 8; i += 1) {
        const z = -bridge.length * 0.5 + (bridge.length / 8) * i
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), support)
        post.position.set(side * bridge.width * 0.48, 0.45, z)
        group.add(post)
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, bridge.length), wood)
      rail.position.set(side * bridge.width * 0.48, 0.84, 0)
      group.add(rail)
    }
    this.scene.add(group)
  }

  private buildStructures(): void {
    const stone = this.material('stone', 2.2, 2.2, { color: 0xc0bcae })
    const moss = this.material('moss-stone', 2.2, 2.2, { color: 0x849085 })
    const wood = this.material('wood', 1.5, 3.5, { color: 0x9c714e })

    for (const structure of WORLD_STRUCTURES) {
      if (structure.kind === 'abbey') this.buildAbbey(structure, stone, moss, wood)
      else if (structure.kind === 'forest-shrine') this.buildShrine(structure, moss, stone)
      else if (structure.kind === 'highland-fort') this.buildFortress(structure, stone, moss)
      else this.buildChapel(structure, stone, moss, wood)
    }
  }

  private addBox(
    group: THREE.Group,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    rotationY = 0,
    rotationZ = 0,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z)
    mesh.rotation.y = rotationY
    mesh.rotation.z = rotationZ
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  private addTower(group: THREE.Group, material: THREE.Material, trim: THREE.Material, x: number, z: number, radius: number, height: number): void {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius, height, 8), material)
    body.position.set(x, height * 0.5, z)
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.48, 8), trim)
    rim.position.set(x, height + 0.12, z)
    rim.castShadow = true
    group.add(rim)

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.62), trim)
      block.position.set(x + Math.cos(angle) * radius * 0.88, height + 0.62, z + Math.sin(angle) * radius * 0.88)
      block.castShadow = true
      group.add(block)
    }
  }

  private buildAbbey(s: WorldStructure, stone: THREE.Material, moss: THREE.Material, wood: THREE.Material): void {
    const group = new THREE.Group()
    group.position.set(s.x, terrainHeightAt(s.x, s.z), s.z)
    group.rotation.y = s.rotation

    this.addBox(group, moss, 0, 0.18, 0, s.width, 0.36, s.depth)
    const wallH = 5.4
    this.addBox(group, stone, -s.width * 0.5, wallH * 0.5, 0, 0.85, wallH, s.depth)
    this.addBox(group, stone, s.width * 0.5, wallH * 0.5, 0, 0.85, wallH, s.depth)
    this.addBox(group, stone, 0, wallH * 0.5, s.depth * 0.5, s.width, wallH, 0.85)

    const gate = 5.4
    const side = (s.width - gate) * 0.5
    this.addBox(group, stone, -(gate + side) * 0.5, wallH * 0.5, -s.depth * 0.5, side, wallH, 0.85)
    this.addBox(group, stone, (gate + side) * 0.5, wallH * 0.5, -s.depth * 0.5, side, wallH, 0.85)
    this.addBox(group, stone, 0, wallH - 0.2, -s.depth * 0.5, gate + 1.2, 1.0, 1.0)

    this.addTower(group, stone, moss, -s.width * 0.5 + 2.6, -s.depth * 0.5 + 2.7, 2.5, 9.5)
    this.addTower(group, stone, moss, s.width * 0.5 - 2.6, -s.depth * 0.5 + 2.7, 2.4, 8.7)

    const naveW = 9.6
    const naveD = 12
    this.addBox(group, moss, -naveW * 0.5, 3.0, 1.8, 0.65, 6.0, naveD)
    this.addBox(group, moss, naveW * 0.5, 3.0, 1.8, 0.65, 6.0, naveD)
    this.addBox(group, moss, 0, 3.0, 1.8 + naveD * 0.5, naveW, 6.0, 0.65)
    for (const x of [-3.1, 3.1]) {
      for (const z of [-2.2, 1.6, 5.2]) {
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 4.7, 8), stone)
        column.position.set(x, 2.35, z)
        column.castShadow = true
        group.add(column)
      }
    }
    this.addBox(group, wood, -2.6, 6.25, 2.6, 4.9, 0.32, 11.2, 0, 0.2)
    this.addBox(group, wood, 2.6, 6.25, 2.6, 4.9, 0.32, 11.2, 0, -0.2)

    this.scene.add(group)
  }

  private buildShrine(s: WorldStructure, moss: THREE.Material, stone: THREE.Material): void {
    const group = new THREE.Group()
    group.position.set(s.x, terrainHeightAt(s.x, s.z), s.z)
    group.rotation.y = s.rotation

    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.2, 7.8, 0.55, 10), moss)
    base.position.y = 0.25
    base.receiveShadow = true
    group.add(base)

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.44, 5.8, 7), stone)
      column.position.set(Math.cos(angle) * 5.5, 3.0, Math.sin(angle) * 5.5)
      column.castShadow = true
      group.add(column)
    }
    const crown = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.38, 6, 24), stone)
    crown.rotation.x = Math.PI / 2
    crown.position.y = 5.8
    group.add(crown)

    this.addTower(group, moss, stone, 0, 0, 2.1, 8.3)
    this.addBox(group, stone, 0, 4.7, -6.2, 5.4, 0.7, 0.8)
    this.addBox(group, stone, -2.2, 2.4, -6.2, 0.75, 4.8, 0.8)
    this.addBox(group, stone, 2.2, 2.4, -6.2, 0.75, 4.8, 0.8)
    this.scene.add(group)
  }

  private buildFortress(s: WorldStructure, stone: THREE.Material, moss: THREE.Material): void {
    const group = new THREE.Group()
    group.position.set(s.x, terrainHeightAt(s.x, s.z), s.z)
    group.rotation.y = s.rotation

    this.addBox(group, moss, 0, 0.25, 0, s.width, 0.5, s.depth)
    const wallH = 5.8
    this.addBox(group, stone, -s.width * 0.5, wallH * 0.5, 0, 1.0, wallH, s.depth)
    this.addBox(group, stone, s.width * 0.5, wallH * 0.5, 0, 1.0, wallH, s.depth)
    this.addBox(group, stone, 0, wallH * 0.5, s.depth * 0.5, s.width, wallH, 1.0)

    const gate = 5
    const side = (s.width - gate) * 0.5
    this.addBox(group, stone, -(gate + side) * 0.5, wallH * 0.5, -s.depth * 0.5, side, wallH, 1.0)
    this.addBox(group, stone, (gate + side) * 0.5, wallH * 0.5, -s.depth * 0.5, side, wallH, 1.0)
    this.addBox(group, stone, 0, 5.5, -s.depth * 0.5, gate + 1.4, 1.0, 1.15)

    this.addTower(group, stone, moss, -s.width * 0.5 + 2.7, -s.depth * 0.5 + 2.6, 2.6, 10.2)
    this.addTower(group, stone, moss, s.width * 0.5 - 2.7, -s.depth * 0.5 + 2.6, 2.6, 10.2)
    this.addTower(group, stone, moss, 0, s.depth * 0.5 - 2.5, 2.4, 8.4)

    this.scene.add(group)
  }

  private buildChapel(s: WorldStructure, stone: THREE.Material, moss: THREE.Material, wood: THREE.Material): void {
    const group = new THREE.Group()
    group.position.set(s.x, terrainHeightAt(s.x, s.z), s.z)
    group.rotation.y = s.rotation

    this.addBox(group, moss, 0, 0.2, 0, s.width, 0.4, s.depth)
    this.addBox(group, stone, -s.width * 0.5, 2.7, 0, 0.7, 5.4, s.depth)
    this.addBox(group, stone, s.width * 0.5, 2.7, 0, 0.7, 5.4, s.depth)
    this.addBox(group, stone, 0, 2.7, s.depth * 0.5, s.width, 5.4, 0.7)
    const opening = 3.4
    const side = (s.width - opening) * 0.5
    this.addBox(group, stone, -(opening + side) * 0.5, 2.7, -s.depth * 0.5, side, 5.4, 0.7)
    this.addBox(group, stone, (opening + side) * 0.5, 2.7, -s.depth * 0.5, side, 5.4, 0.7)
    this.addBox(group, stone, 0, 5.0, -s.depth * 0.5, opening + 0.8, 0.8, 0.8)
    this.addBox(group, wood, -3.0, 6.1, 0, 6.0, 0.35, s.depth, 0, 0.23)
    this.addBox(group, wood, 3.0, 6.1, 0, 6.0, 0.35, s.depth, 0, -0.23)
    this.addTower(group, stone, moss, 0, 4.7, 1.65, 7.3)

    this.scene.add(group)
  }

  private buildLandmarks(world: WorldState): void {
    const stone = this.material('stone', 1.6, 2.2, { color: 0xa8aba3 })
    const moss = this.material('moss-stone', 1.5, 2.0, { color: 0x79877b })
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a321f, roughness: 1 })
    const foliageA = new THREE.MeshStandardMaterial({ color: 0x183c25, roughness: 1 })
    const foliageB = new THREE.MeshStandardMaterial({ color: 0x285235, roughness: 1 })

    let treeIndex = 0
    for (const landmark of world.trees) {
      if (landmark.kind === 'tree') {
        this.buildTree(landmark, treeIndex++, bark, foliageA, foliageB)
      } else if (landmark.kind === 'monolith') {
        const group = new THREE.Group()
        group.position.set(landmark.x, terrainHeightAt(landmark.x, landmark.z), landmark.z)
        group.rotation.y = landmark.rotation ?? 0
        const base = new THREE.Mesh(new THREE.CylinderGeometry(landmark.radius * 1.2, landmark.radius * 1.35, 0.6, 6), moss)
        base.position.y = 0.3
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(landmark.radius * 0.58, landmark.radius * 0.82, landmark.height, 5), stone)
        pillar.position.y = landmark.height * 0.5 + 0.45
        pillar.rotation.z = Math.sin(landmark.x * 1.7) * 0.03
        pillar.castShadow = true
        group.add(base, pillar)
        this.scene.add(group)
      } else if (landmark.kind === 'rock') {
        const geometry = new THREE.DodecahedronGeometry(1, 1)
        geometry.scale(landmark.radius, landmark.height, landmark.radius * 0.82)
        const rock = new THREE.Mesh(geometry, landmark.x % 2 > 0 ? stone : moss)
        rock.position.set(landmark.x, terrainHeightAt(landmark.x, landmark.z) + landmark.height * 0.42, landmark.z)
        rock.rotation.set(0.08, landmark.rotation ?? 0, 0.04)
        rock.castShadow = true
        rock.receiveShadow = true
        this.scene.add(rock)
      }
    }
  }

  private buildTree(
    tree: WorldLandmark,
    index: number,
    bark: THREE.Material,
    foliageA: THREE.Material,
    foliageB: THREE.Material,
  ): void {
    const group = new THREE.Group()
    group.position.set(tree.x, terrainHeightAt(tree.x, tree.z), tree.z)
    group.rotation.y = tree.rotation ?? 0

    const trunkHeight = tree.height * 0.72
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(tree.radius * 0.2, tree.radius * 0.34, trunkHeight, 7), bark)
    trunk.position.y = trunkHeight * 0.5
    trunk.castShadow = true
    group.add(trunk)

    const clumps = [
      { y: 0.42, sx: 2.2, sy: 0.2, sz: 1.65 },
      { y: 0.56, sx: 1.95, sy: 0.2, sz: 1.5 },
      { y: 0.7, sx: 1.6, sy: 0.18, sz: 1.25 },
      { y: 0.82, sx: 1.25, sy: 0.17, sz: 1.0 },
      { y: 0.92, sx: 0.84, sy: 0.14, sz: 0.75 },
    ]
    for (let i = 0; i < clumps.length; i += 1) {
      const c = clumps[i]!
      const geometry = new THREE.DodecahedronGeometry(1, 0)
      geometry.scale(tree.radius * c.sx, tree.height * c.sy, tree.radius * c.sz)
      const mesh = new THREE.Mesh(geometry, (index + i) % 2 === 0 ? foliageA : foliageB)
      mesh.position.set(
        Math.sin(index * 0.9 + i * 1.7) * tree.radius * 0.22,
        tree.height * c.y,
        Math.cos(index * 1.2 + i * 1.4) * tree.radius * 0.18,
      )
      mesh.rotation.set(i * 0.08, index * 0.33 + i * 0.7, i * 0.05)
      mesh.castShadow = i < 3
      group.add(mesh)
    }
    this.scene.add(group)
  }

  private buildFires(): void {
    const stone = this.material('stone', 1, 1, { color: 0x7d7568 })
    const ember = new THREE.MeshStandardMaterial({ color: 0xff9d2f, emissive: 0xff6a12, emissiveIntensity: 3, roughness: 0.5 })

    WORLD_FIRES.forEach((fire, index) => {
      const y = terrainHeightAt(fire.x, fire.z)
      const group = new THREE.Group()
      group.position.set(fire.x, y, fire.z)
      for (let i = 0; i < 7; i += 1) {
        const angle = (i / 7) * Math.PI * 2
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), stone)
        rock.position.set(Math.cos(angle) * 0.5, 0.15, Math.sin(angle) * 0.5)
        group.add(rock)
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.15, 7), ember)
      flame.position.y = 0.68
      flame.rotation.y = index
      group.add(flame)
      this.scene.add(group)

      const light = new THREE.PointLight(0xff9f45, 20, fire.radius * 1.7, 2)
      light.position.set(fire.x, y + 2.1, fire.z)
      this.scene.add(light)
      this.fireLights.push(light)
    })
  }

  private insideStructure(x: number, z: number, padding = 0): boolean {
    for (const structure of WORLD_STRUCTURES) {
      const dx = x - structure.x
      const dz = z - structure.z
      const c = Math.cos(structure.rotation)
      const s = Math.sin(structure.rotation)
      const lx = c * dx - s * dz
      const lz = s * dx + c * dz
      if (Math.abs(lx) < structure.width * 0.58 + padding && Math.abs(lz) < structure.depth * 0.58 + padding) return true
    }
    return false
  }

  private buildGrass(world: WorldState): void {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const count = coarse ? 42000 : 92000
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.055, 0, 0, 0.055, 0, 0, 0.035, 1, 0,
      -0.055, 0, 0, 0.035, 1, 0, -0.035, 1, 0,
      0, 0, -0.055, 0, 0, 0.055, 0, 1, 0.035,
      0, 0, -0.055, 0, 1, 0.035, 0, 1, -0.035,
    ], 3))

    const material = new THREE.MeshStandardMaterial({
      color: 0x53724a,
      roughness: 1,
      side: THREE.DoubleSide,
      vertexColors: true,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    mesh.receiveShadow = true

    const random = seeded(0x41534349)
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const color = new THREE.Color()
    const up = new THREE.Vector3(0, 1, 0)
    let valid = 0
    let attempts = 0

    while (valid < count && attempts < count * 8) {
      attempts += 1
      const x = (random() - 0.5) * 180
      const z = (random() - 0.5) * 180
      if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 0.5) continue
      if (roadDistanceAt(x, z) < 1.6) continue
      if (this.insideStructure(x, z, 1.2)) continue

      let blocked = false
      for (const obstacle of world.trees) {
        if (obstacle.kind !== 'tree') continue
        const dx = x - obstacle.x
        const dz = z - obstacle.z
        if (dx * dx + dz * dz < obstacle.radius * obstacle.radius * 0.34) {
          blocked = true
          break
        }
      }
      if (blocked) continue

      const zone = zoneAt(x, z)
      const density = zone.id === 'meadow' ? 1 : zone.id === 'forest' ? 0.96 : zone.id === 'highland' ? 0.58 : 0.82
      if (random() > density) continue

      position.set(x, terrainHeightAt(x, z), z)
      quaternion.setFromAxisAngle(up, random() * Math.PI)
      let h = 0.52 + random() * 0.58
      if (zone.id === 'meadow') h *= 1.25
      if (zone.id === 'forest') h *= 0.92
      if (zone.id === 'highland') h *= 0.72
      scale.set(0.9 + random() * 0.55, h, 0.9 + random() * 0.55)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(valid, matrix)

      const base = colorForZone(zone.id)
      color.copy(base).offsetHSL((random() - 0.5) * 0.025, 0.04, (random() - 0.5) * 0.08)
      mesh.setColorAt(valid, color)
      valid += 1
    }

    mesh.count = valid
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    this.scene.add(mesh)
  }

  private buildKnight(): void {
    const hair = new THREE.MeshStandardMaterial({ color: 0xe8edf0, roughness: 0.75 })
    const armor = new THREE.MeshStandardMaterial({ color: 0x9aa6b0, metalness: 0.42, roughness: 0.38 })
    const cloak = new THREE.MeshStandardMaterial({ color: 0xb91f26, roughness: 0.82 })
    const boot = new THREE.MeshStandardMaterial({ color: 0x3a302a, roughness: 1 })
    const sword = new THREE.MeshStandardMaterial({ color: 0xe9f0f4, metalness: 0.72, roughness: 0.24 })

    const legGeometry = new THREE.BoxGeometry(0.24, 0.72, 0.24)
    this.leftLeg = new THREE.Mesh(legGeometry, boot)
    this.leftLeg.position.set(-0.16, 0.38, 0)
    this.rightLeg = new THREE.Mesh(legGeometry, boot)
    this.rightLeg.position.set(0.16, 0.38, 0)
    this.playerGroup.add(this.leftLeg, this.rightLeg)

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.86, 0.44), armor)
    torso.position.y = 1.12
    this.playerGroup.add(torso)

    this.capeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.38, 0.16), cloak)
    this.capeMesh.position.set(0, 0.82, -0.25)
    this.capeMesh.rotation.x = 0.18
    this.playerGroup.add(this.capeMesh)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 10), hair)
    head.position.set(0, 1.76, 0.02)
    this.playerGroup.add(head)

    this.rightArm = new THREE.Group()
    this.rightArm.position.set(0.42, 1.35, 0.05)
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.5), sword)
    blade.position.z = 0.74
    this.rightArm.add(blade)
    this.playerGroup.add(this.rightArm)

    const slashMaterial = new THREE.MeshBasicMaterial({ color: 0xffe596, transparent: true, opacity: 0.58, side: THREE.DoubleSide })
    const slashGeometry = new THREE.RingGeometry(0.85, 1.6, 18, 1, -Math.PI * 0.45, Math.PI * 0.9)
    slashGeometry.rotateX(-Math.PI / 2)
    this.slashMesh = new THREE.Mesh(slashGeometry, slashMaterial)
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
    if (moving) this.walkCycle += dt * 11

    const riverDistance = Math.abs(riverSignedDistance(world.player.x, world.player.z))
    const onBridge = bridgeDeckHeightAt(world.player.x, world.player.z) !== null
    const sink = isInsideRiver(world.player.x, world.player.z) && !onBridge
      ? -0.26 * Math.min(1, (RIVER_HALF_WIDTH - riverDistance) * 0.6)
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
      this.capeMesh.rotation.x = 0.22 + (moving ? 0.22 : 0.04) + Math.sin(world.elapsed * 4.5) * 0.045
    }
    if (this.rightArm && this.slashMesh) {
      if (world.player.attackPulse > 0) {
        const p = 1 - world.player.attackPulse / 0.34
        this.rightArm.rotation.y = -1.15 + p * 2.4
        this.rightArm.rotation.x = 0.34
        this.slashMesh.visible = true
        this.slashMesh.rotation.y = p * 1.35
      } else {
        this.rightArm.rotation.y = Math.sin(world.elapsed * 2) * 0.07
        this.rightArm.rotation.x = 0.15 + (moving ? Math.cos(this.walkCycle) * 0.22 : 0)
        this.slashMesh.visible = false
      }
    }

    this.lastX = world.player.x
    this.lastZ = world.player.z
  }

  private createEnemy(enemy: EnemyState): THREE.Group {
    const group = new THREE.Group()
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x7f2630, emissive: 0x220407, roughness: 0.8 })
    const boneMaterial = new THREE.MeshStandardMaterial({ color: 0xc9c0a9, roughness: 0.9 })
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.28, 6), bodyMaterial)
    body.position.y = 0.68
    group.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 7), boneMaterial)
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
      const material = group.userData.bodyMaterial as THREE.MeshStandardMaterial | undefined
      if (material) material.emissiveIntensity = enemy.hitFlash > 0 ? 2.4 : 0.5
    }

    for (const [id, group] of this.enemyMeshes) {
      if (alive.has(id)) continue
      this.scene.remove(group)
      this.enemyMeshes.delete(id)
    }
  }

  private syncCamera(world: WorldState, dt: number): void {
    this.currentZoom += (this.targetZoom - this.currentZoom) * Math.min(1, dt * 7.5)
    this.camera.zoom = this.currentZoom
    const targetY = walkHeightAt(world.player.x, world.player.z)
    this.camera.position.x += (world.player.x - this.camera.position.x) * Math.min(1, dt * 6)
    this.camera.position.y += (targetY + 27 - this.camera.position.y) * Math.min(1, dt * 4.5)
    this.camera.position.z += (world.player.z + 23 - this.camera.position.z) * Math.min(1, dt * 6)
    this.camera.lookAt(world.player.x, targetY, world.player.z)
    this.camera.updateProjectionMatrix()
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
