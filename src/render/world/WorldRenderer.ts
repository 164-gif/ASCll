import * as THREE from 'three'
import type { EnemyState, WorldState } from '../../simulation/WorldState'

const GLYPH_RAMP = [' ', '.', '·', ':', '/', '\\', '|', '+', '*', '%', '#', '@']

export class WorldRenderer {
  readonly element: HTMLCanvasElement

  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120)
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
  private readonly target = new THREE.WebGLRenderTarget(80, 45, {
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  private readonly ctx: CanvasRenderingContext2D
  private readonly resizeObserver: ResizeObserver
  private readonly playerGroup = new THREE.Group()
  private readonly playerLight = new THREE.PointLight(0xa6c8b6, 5.2, 12, 1.8)
  private readonly attackRing: THREE.Mesh
  private readonly enemyMeshes = new Map<number, THREE.Group>()

  private width = 1
  private height = 1
  private dpr = 1
  private cols = 80
  private rows = 45
  private pixels = new Uint8Array(this.cols * this.rows * 4)

  constructor(parent: HTMLElement, world: WorldState) {
    this.element = document.createElement('canvas')
    this.element.className = 'world-glyph-canvas'
    const context = this.element.getContext('2d', { alpha: false })
    if (!context) throw new Error('Glyph canvas is unavailable')
    this.ctx = context
    parent.append(this.element)

    this.scene.background = new THREE.Color(0x000000)
    this.scene.fog = new THREE.FogExp2(0x000000, 0.038)
    this.camera.position.set(7.8, 9.6, 9.8)

    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(16, 16, false)

    const hemi = new THREE.HemisphereLight(0x879b9e, 0x07100d, 1.55)
    this.scene.add(hemi)

    const moon = new THREE.DirectionalLight(0xc8dae5, 2.9)
    moon.position.set(-9, 17, 6)
    this.scene.add(moon)

    this.playerLight.position.set(0, 2.2, 0)
    this.scene.add(this.playerLight)

    this.buildGround()
    this.buildForest(world)
    this.buildPlayer()

    const ringGeometry = new THREE.RingGeometry(0.8, 1.05, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xcad9d1,
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

    this.cols = Math.max(64, Math.min(102, Math.round(this.width / 12)))
    this.rows = Math.max(38, Math.min(64, Math.round(this.cols * (this.height / this.width) * 0.62)))
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
      color: 0x101a15,
      roughness: 1,
      metalness: 0,
    })
    const ground = new THREE.Mesh(geometry, material)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.1
    this.scene.add(ground)

    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2, 48, 1, 24),
      new THREE.MeshStandardMaterial({ color: 0x17201c, roughness: 1 }),
    )
    path.rotation.x = -Math.PI / 2
    path.rotation.z = -0.22
    path.position.set(-2.2, -0.065, 0)
    this.scene.add(path)
  }

  private buildForest(world: WorldState): void {
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x2a241d, roughness: 1 })
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x183126, roughness: 0.96 })

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

    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x343b38, roughness: 0.93 })
    for (let i = 0; i < 22; i += 1) {
      const angle = i * 2.399
      const radius = 6 + (i % 7) * 2.15
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.1, 0), stoneMaterial)
      stone.position.set(Math.cos(angle) * radius, 0.08, Math.sin(angle) * radius)
      stone.scale.y = 0.55 + (i % 4) * 0.13
      this.scene.add(stone)
    }
  }

  private buildPlayer(): void {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xa9b8b0,
      roughness: 0.72,
      metalness: 0.08,
    })
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x202824, roughness: 0.9 })

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.05, 6), bodyMaterial)
    body.position.y = 0.68
    this.playerGroup.add(body)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 7, 6), darkMaterial)
    head.position.y = 1.43
    this.playerGroup.add(head)

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.05), bodyMaterial)
    blade.position.set(0.47, 0.82, 0.2)
    blade.rotation.y = -0.34
    this.playerGroup.add(blade)

    this.scene.add(this.playerGroup)
  }

  private createEnemy(enemy: EnemyState): THREE.Group {
    const group = new THREE.Group()
    const material = new THREE.MeshStandardMaterial({
      color: 0x4c1b20,
      emissive: 0x21070a,
      emissiveIntensity: 0.7,
      roughness: 0.78,
    })
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.45, 5), material)
    body.position.y = 0.72
    group.add(body)

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xc8726f })
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), eyeMaterial)
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
        material.emissiveIntensity = enemy.hitFlash > 0 ? 4.5 : 0.7
        material.color.setHex(enemy.hitFlash > 0 ? 0xb65f62 : 0x4c1b20)
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
    this.playerLight.intensity = world.player.hurtPulse > 0 ? 7.5 : 5.2

    this.attackRing.position.set(world.player.x, 0.04, world.player.z)
    const ringMaterial = this.attackRing.material as THREE.MeshBasicMaterial
    if (world.player.attackPulse > 0) {
      const phase = 1 - world.player.attackPulse / 0.34
      const scale = 0.75 + phase * 1.9
      this.attackRing.scale.setScalar(scale)
      ringMaterial.opacity = Math.max(0, (1 - phase) * 0.55)
    } else {
      ringMaterial.opacity = THREE.MathUtils.lerp(ringMaterial.opacity, 0, Math.min(1, dt * 16))
    }
  }

  private syncCamera(world: WorldState, dt: number): void {
    const desired = new THREE.Vector3(world.player.x + 7.8, 9.7, world.player.z + 9.8)
    const smoothing = 1 - Math.exp(-dt * 4.8)
    this.camera.position.lerp(desired, smoothing)
    this.camera.lookAt(world.player.x, 0.72, world.player.z)
  }

  private drawGlyphFrame(seconds: number): void {
    const cellW = this.width / this.cols
    const cellH = this.height / this.rows
    const fontSize = Math.ceil(cellH * 1.08)

    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.width, this.height)
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

    for (let gy = 0; gy < this.rows; gy += 1) {
      const sourceY = this.rows - 1 - gy
      for (let gx = 0; gx < this.cols; gx += 1) {
        const index = (sourceY * this.cols + gx) * 4
        const r = this.pixels[index] ?? 0
        const g = this.pixels[index + 1] ?? 0
        const b = this.pixels[index + 2] ?? 0
        const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255
        if (luminance < 0.045) continue

        const rampPosition = Math.min(GLYPH_RAMP.length - 1, Math.floor(Math.pow(luminance, 0.72) * GLYPH_RAMP.length))
        let glyph = GLYPH_RAMP[rampPosition] ?? '.'
        if (rampPosition >= 4 && rampPosition <= 6) {
          const selector = (gx * 17 + gy * 31 + Math.floor(seconds * 0.7)) % 3
          glyph = selector === 0 ? '/' : selector === 1 ? '\\' : '|'
        }

        const boost = 1.18 + luminance * 0.3
        const rr = Math.min(255, Math.round(r * boost + 4))
        const gg = Math.min(255, Math.round(g * boost + 6))
        const bb = Math.min(255, Math.round(b * boost + 5))
        this.ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`
        this.ctx.fillText(glyph, (gx + 0.5) * cellW, (gy + 0.5) * cellH)
      }
    }

    const vignette = this.ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.5,
      Math.min(this.width, this.height) * 0.24,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.72,
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(0.72, 'rgba(0,0,0,.08)')
    vignette.addColorStop(1, 'rgba(0,0,0,.72)')
    this.ctx.fillStyle = vignette
    this.ctx.fillRect(0, 0, this.width, this.height)
  }
}
