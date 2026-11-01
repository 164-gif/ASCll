import * as THREE from 'three'
import type { EnemyState, WorldState } from '../../simulation/WorldState'

const GLYPH_RAMP = ['.', '·', ':', ';', '/', '\\', '|', '+', '*', '%', '#', '@']

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const toDisplayChannel = (value: number): number => {
  const linear = clamp01(value / 255)
  const lifted = Math.pow(linear, 1 / 2.15)
  return Math.round(clamp01(lifted * 1.18 + 0.018) * 255)
}

export class WorldRenderer {
  readonly element: HTMLCanvasElement

  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(49, 1, 0.1, 120)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  private readonly target = new THREE.WebGLRenderTarget(88, 50, {
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  private readonly ctx: CanvasRenderingContext2D
  private readonly resizeObserver: ResizeObserver
  private readonly playerGroup = new THREE.Group()
  private readonly playerLight = new THREE.PointLight(0xc4dfcf, 8.5, 15, 1.55)
  private readonly attackRing: THREE.Mesh
  private readonly enemyMeshes = new Map<number, THREE.Group>()

  private width = 1
  private height = 1
  private dpr = 1
  private cols = 88
  private rows = 50
  private pixels = new Uint8Array(this.cols * this.rows * 4)

  constructor(parent: HTMLElement, world: WorldState) {
    this.element = document.createElement('canvas')
    this.element.className = 'world-glyph-canvas'
    const context = this.element.getContext('2d', { alpha: false })
    if (!context) throw new Error('Glyph canvas is unavailable')
    this.ctx = context
    parent.append(this.element)

    this.scene.background = new THREE.Color(0x020604)
    this.scene.fog = new THREE.FogExp2(0x020604, 0.019)
    this.camera.position.set(7.1, 8.3, 8.9)

    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 2.15
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(16, 16, false)

    const hemi = new THREE.HemisphereLight(0xb7c9c5, 0x15251c, 3.1)
    this.scene.add(hemi)

    const moon = new THREE.DirectionalLight(0xd5e5ee, 4.2)
    moon.position.set(-9, 17, 6)
    this.scene.add(moon)

    const fill = new THREE.DirectionalLight(0x6d8f79, 1.55)
    fill.position.set(10, 7, -12)
    this.scene.add(fill)

    this.playerLight.position.set(0, 2.2, 0)
    this.scene.add(this.playerLight)

    this.buildGround()
    this.buildForest(world)
    this.buildPlayer()

    const ringGeometry = new THREE.RingGeometry(0.8, 1.05, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xe1eee7,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.attackRing = new THREE.Mesh(ringGeometry, ringMaterial)
    this.attackRing.rotation.x = -Math.PI / 2
    this.attackRing.position.y = 0.06
    this.scene.add(this.attackRing)

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(parent)
    this.resize()
  }

  render(world: WorldState, dt: number): void {
    this.syncPlayer(world, dt)
    this.syncEnemies(world.enemies)
    this.syncCamera(world, dt)

    this.renderer.setRenderTarget(this.target)
    this.renderer.render(this.scene, this.camera)
    this.renderer.readRenderTargetPixels(this.target, 0, 0, this.cols, this.rows, this.pixels)
    this.renderer.setRenderTarget(null)

    this.drawGlyphFrame(world.elapsed)
  }

  destroy(): void {
    this.resizeObserver.disconnect()
    this.target.dispose()
    this.renderer.dispose()
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.dispose()
    })
    this.element.remove()
  }

  private resize = (): void => {
    const rect = this.element.parentElement?.getBoundingClientRect()
    if (!rect) return

    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6)

    this.element.width = Math.floor(this.width * this.dpr)
    this.element.height = Math.floor(this.height * this.dpr)
    this.element.style.width = `${this.width}px`
    this.element.style.height = `${this.height}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    this.cols = Math.max(72, Math.min(118, Math.round(this.width / 10.5)))
    this.rows = Math.max(42, Math.min(72, Math.round(this.cols * (this.height / this.width) * 0.59)))
    this.target.setSize(this.cols, this.rows)
    this.pixels = new Uint8Array(this.cols * this.rows * 4)

    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
  }

  private buildGround(): void {
    const geometry = new THREE.PlaneGeometry(56, 56, 36, 36)
    const position = geometry.attributes.position
    if (position) {
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i)
        const y = position.getY(i)
        const height = Math.sin(x * 0.45) * 0.09 + Math.cos(y * 0.37) * 0.07 + Math.sin((x + y) * 0.21) * 0.05
        position.setZ(i, height)
      }
      position.needsUpdate = true
      geometry.computeVertexNormals()
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x314a39,
      emissive: 0x07100a,
      emissiveIntensity: 0.9,
      roughness: 1,
      metalness: 0,
    })
    const ground = new THREE.Mesh(geometry, material)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.1
    this.scene.add(ground)

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2, 48, 1, 24),
      new THREE.MeshStandardMaterial({
        color: 0x526057,
        emissive: 0x101612,
        emissiveIntensity: 0.55,
        roughness: 1,
      }),
    )
    path.rotation.x = -Math.PI / 2
    path.rotation.z = -0.22
    path.position.set(-2.2, -0.065, 0)
    this.scene.add(path)

    const grassMaterial = new THREE.MeshBasicMaterial({ color: 0x446b4c })
    const bladeGeometry = new THREE.ConeGeometry(0.045, 0.38, 3)
    let seed = 0x71a55
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    }
    for (let i = 0; i < 190; i += 1) {
      const blade = new THREE.Mesh(bladeGeometry, grassMaterial)
      blade.position.set((random() * 2 - 1) * 25, 0.1, (random() * 2 - 1) * 25)
      blade.rotation.y = random() * Math.PI
      blade.scale.y = 0.55 + random() * 1.4
      this.scene.add(blade)
    }
  }

  private buildForest(world: WorldState): void {
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x604632,
      emissive: 0x120b06,
      emissiveIntensity: 0.5,
      roughness: 1,
    })
    const crownMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c6544,
      emissive: 0x06150c,
      emissiveIntensity: 0.72,
      roughness: 0.96,
    })

    for (const tree of world.trees) {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(tree.radius * 0.32, tree.radius * 0.48, tree.height * 0.62, 5),
        trunkMaterial,
      )
      trunk.position.set(tree.x, tree.height * 0.31, tree.z)
      trunk.rotation.y = (tree.x * 0.71 + tree.z * 0.37) % Math.PI
      this.scene.add(trunk)

      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(tree.radius * 2.15, tree.height * 0.72, 7),
        crownMaterial,
      )
      crown.position.set(tree.x, tree.height * 0.72, tree.z)
      crown.rotation.y = (tree.x * 0.13 - tree.z * 0.29) % Math.PI
      this.scene.add(crown)
    }

    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x68716d,
      emissive: 0x090b0a,
      emissiveIntensity: 0.55,
      roughness: 0.93,
    })
    for (let i = 0; i < 28; i += 1) {
      const angle = i * 2.399
      const radius = 5 + (i % 8) * 2.15
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.1, 0), stoneMaterial)
      stone.position.set(Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius)
      stone.scale.y = 0.55 + (i % 4) * 0.13
      this.scene.add(stone)
    }
  }

  private buildPlayer(): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xe2ebe6,
      emissive: 0x26352e,
      emissiveIntensity: 0.55,
      roughness: 0.68,
      metalness: 0.08,
    })
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x607168,
      emissive: 0x101813,
      emissiveIntensity: 0.5,
      roughness: 0.9,
    })

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.05, 6), bodyMaterial)
    body.position.y = 0.68
    this.playerGroup.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 7, 6), darkMaterial)
    head.position.y = 1.43
    this.playerGroup.add(head)

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.08), bodyMaterial)
    blade.position.set(0.47, 0.82, 0.2)
    blade.rotation.y = -0.34
    this.playerGroup.add(blade)

    this.scene.add(this.playerGroup)
  }

  private createEnemy(enemy: EnemyState): THREE.Group {
    const group = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({
      color: 0xb03e48,
      emissive: 0x5a1018,
      emissiveIntensity: 1.6,
      roughness: 0.72,
    })
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.45, 5), material)
    body.position.y = 0.72
    group.add(body)

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffaaa3 })
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), eyeMaterial)
    eye.position.set(0, 1.12, 0.29)
    group.add(eye)

    group.userData.bodyMaterial = material
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
      group.position.set(enemy.x, 0, enemy.z)
      const material = group.userData.bodyMaterial as THREE.MeshStandardMaterial | undefined
      if (material) {
        material.emissiveIntensity = enemy.hitFlash > 0 ? 5.5 : 1.6
        material.color.setHex(enemy.hitFlash > 0 ? 0xff9b9b : 0xb03e48)
      }
    }

    for (const [id, group] of this.enemyMeshes) {
      if (alive.has(id)) continue
      this.scene.remove(group)
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) material.dispose()
      })
      this.enemyMeshes.delete(id)
    }
  }

  private syncPlayer(world: WorldState, dt: number): void {
    this.playerGroup.position.set(world.player.x, 0, world.player.z)
    this.playerGroup.rotation.y = world.player.facing
    this.playerLight.position.set(world.player.x, 1.8, world.player.z)
    this.playerLight.intensity = world.player.hurtPulse > 0 ? 12 : 8.5

    this.attackRing.position.set(world.player.x, 0.04, world.player.z)
    const ringMaterial = this.attackRing.material as THREE.MeshBasicMaterial
    if (world.player.attackPulse > 0) {
      const phase = 1 - world.player.attackPulse / 0.34
      const scale = 0.75 + phase * 1.9
      this.attackRing.scale.setScalar(scale)
      ringMaterial.opacity = Math.max(0, (1 - phase) * 0.8)
    } else {
      ringMaterial.opacity = THREE.MathUtils.lerp(ringMaterial.opacity, 0, Math.min(1, dt * 16))
    }
  }

  private syncCamera(world: WorldState, dt: number): void {
    const desired = new THREE.Vector3(world.player.x + 7.1, 8.3, world.player.z + 8.9)
    const smoothing = 1 - Math.exp(-dt * 5.2)
    this.camera.position.lerp(desired, smoothing)
    this.camera.lookAt(world.player.x, 0.68, world.player.z)
  }

  private drawGlyphFrame(seconds: number): void {
    const cellW = this.width / this.cols
    const cellH = this.height / this.rows
    const fontSize = Math.max(9, Math.ceil(cellH * 1.18))

    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.width, this.height)
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

    for (let gy = 0; gy < this.rows; gy += 1) {
      const sourceY = this.rows - 1 - gy
      for (let gx = 0; gx < this.cols; gx += 1) {
        const index = (sourceY * this.cols + gx) * 4
        const rawR = this.pixels[index] ?? 0
        const rawG = this.pixels[index + 1] ?? 0
        const rawB = this.pixels[index + 2] ?? 0

        const r = toDisplayChannel(rawR)
        const g = toDisplayChannel(rawG)
        const b = toDisplayChannel(rawB)
        const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255
        const maxChannel = Math.max(r, g, b) / 255

        if (luminance < 0.018 && maxChannel < 0.035) continue

        const liftedLuminance = clamp01((luminance - 0.012) * 1.55)
        const rampPosition = Math.min(
          GLYPH_RAMP.length - 1,
          Math.max(0, Math.floor(Math.pow(liftedLuminance, 0.78) * GLYPH_RAMP.length)),
        )

        let glyph = GLYPH_RAMP[rampPosition] ?? '.'
        if (rampPosition >= 3 && rampPosition <= 6) {
          const selector = (gx * 17 + gy * 31 + Math.floor(seconds * 0.35)) % 4
          glyph = selector === 0 ? '/' : selector === 1 ? '\\' : selector === 2 ? '|' : ':'
        }

        const floor = 20 + liftedLuminance * 12
        const rr = Math.min(255, Math.round(r * 1.12 + floor))
        const gg = Math.min(255, Math.round(g * 1.16 + floor))
        const bb = Math.min(255, Math.round(b * 1.12 + floor))
        this.ctx.globalAlpha = 0.56 + liftedLuminance * 0.44
        this.ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`
        this.ctx.fillText(glyph, (gx + 0.5) * cellW, (gy + 0.5) * cellH)
      }
    }

    this.ctx.globalAlpha = 1
    const vignette = this.ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.5,
      Math.min(this.width, this.height) * 0.3,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.78,
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(0.78, 'rgba(0,0,0,.025)')
    vignette.addColorStop(1, 'rgba(0,0,0,.26)')
    this.ctx.fillStyle = vignette
    this.ctx.fillRect(0, 0, this.width, this.height)
  }
}
