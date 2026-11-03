import { HOUSE_TV_CHANNELS } from '../../audio/HouseMedia'
import * as THREE from 'three'
import type { WorldState } from '../../simulation/WorldState'
import { HOUSE_FURNITURE, HOUSE_WALLS } from '../../world/WakingHouse'

const asciiFragment = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uResolution;
uniform vec2 uCell;
uniform float uPeeking;
varying vec2 vUv;
void main() {
  vec2 pixel = vUv * uResolution;
  vec2 cell = floor(pixel / uCell);
  vec2 center = (cell + 0.5) * uCell / uResolution;
  vec3 color = pow(clamp(texture2D(uScene, center).rgb * 2.4, 0.0, 1.0), vec3(0.55));
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  float hash = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.54);
  float index = clamp(floor(pow(luminance, 0.72) * 57.0 + hash * 4.0), 1.0, 63.0);
  vec2 uv = (vec2(mod(index, 8.0), 7.0 - floor(index / 8.0)) + fract(pixel / uCell)) / 8.0;
  float glyph = texture2D(uAtlas, uv).r;
  vec3 paper = vec3(0.009, 0.012, 0.011) + color * 0.045;
  vec3 result = mix(paper, color * 1.35, glyph);
  vec2 lens = (vUv - 0.5) * uResolution / min(uResolution.x, uResolution.y);
  float aperture = 1.0 - smoothstep(0.31, 0.36, length(lens));
  result *= mix(1.0, aperture, uPeeking);
  gl_FragColor = vec4(result, 1.0);
}
`

export class AwakeningRenderer {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(67, 1, 0.05, 90)
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true })
  private readonly screenScene = new THREE.Scene()
  private readonly screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly materials = new Set<THREE.Material>()
  private readonly canvas = document.createElement('canvas')
  private readonly televisionTexture: THREE.CanvasTexture
  private readonly televisionScreen: THREE.Mesh
  private readonly televisionLight = new THREE.PointLight(0x9db8ab, 0, 5)
  private readonly tableLamp = new THREE.PointLight(0xe8cba3, 10, 11, 2)
  private readonly roomLights = [new THREE.PointLight(0xe1d6b8, 5, 7, 2), new THREE.PointLight(0xd0dbd5, 4, 7, 2)]
  private readonly radioLight: THREE.Mesh
  private readonly door = new THREE.Group()
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private readonly video = document.createElement('video')
  private videoTexture: THREE.VideoTexture | null = null
  private playRequested = false
  private videoChannel = -1
  private readonly fridgeDoor = new THREE.Group()
  private readonly bottles: THREE.Group[] = []
  private readonly handleVisibility = (): void => { if (document.hidden) { this.video.pause(); this.playRequested = false } }
  private lastBroadcastFrame = -1
  private readonly post: THREE.ShaderMaterial

  constructor(atlas: THREE.Texture) {
    this.scene.background = new THREE.Color(0x101514)
    this.scene.fog = new THREE.FogExp2(0x101514, 0.038)
    this.scene.add(new THREE.HemisphereLight(0x9ea9ac, 0x302c23, 1.05))
    const dawn = new THREE.DirectionalLight(0xa0b2ba, 1.6)
    dawn.position.set(-10, 8, 4); dawn.castShadow = true
    dawn.shadow.mapSize.set(1024, 1024); dawn.shadow.camera.left = -14; dawn.shadow.camera.right = 14
    dawn.shadow.camera.top = 14; dawn.shadow.camera.bottom = -14; dawn.shadow.bias = -0.001
    this.scene.add(dawn)
    const wall = this.material(0x77776a), wood = this.material(0x4e4538), dark = this.material(0x222a28)
    const fabric = this.material(0x515a52), metal = this.material(0x59615e), pale = this.material(0xa8a893)
    this.buildShell(wall, wood, dark)
    this.buildFurniture(wood, dark, fabric, metal, pale)
    this.buildStreet(wall, wood, dark)

    // Radio: housing, speaker slats, glass dial and two knobs.
    this.box(this.scene, wood, 0.8, 1.17, -5.48, 0.9, 0.48, 0.35)
    this.box(this.scene, dark, 0.8, 1.17, -5.285, 0.8, 0.36, 0.035)
    for (let i = 0; i < 8; i++) this.box(this.scene, metal, 0.46 + i * 0.055, 1.17, -5.26, 0.018, 0.29, 0.025)
    const radioDial = this.material(0xc6bd8f, 0x6a6039)
    this.radioLight = this.box(this.scene, radioDial, 1.08, 1.24, -5.255, 0.24, 0.09, 0.025)
    for (const x of [1, 1.19]) this.box(this.scene, metal, x, 1.07, -5.23, 0.065, 0.065, 0.06)
    this.box(this.scene, metal, 1.14, 1.73, -5.52, 0.018, 0.68, 0.018)

    const tv = new THREE.Group(); tv.position.set(5.65, 0.73, 1.5); tv.rotation.y = -Math.PI / 2
    this.box(tv, wood, 0, 0.47, 0, 1.28, 0.94, 0.85)
    this.box(tv, dark, -0.08, 0.48, 0.44, 1.05, 0.76, 0.04)
    this.canvas.width = 512; this.canvas.height = 384
    this.televisionTexture = new THREE.CanvasTexture(this.canvas)
    this.video.loop = true; this.video.playsInline = true; this.video.preload = 'none'; this.video.muted = true
    this.videoTexture = new THREE.VideoTexture(this.video); this.videoTexture.colorSpace = THREE.SRGBColorSpace
    window.dispatchEvent(new CustomEvent('ascii:house-video', { detail: this.video }))
    document.addEventListener('visibilitychange', this.handleVisibility)
    const screenMaterial = new THREE.MeshBasicMaterial({ map: this.televisionTexture, color: 0xc5d6ce }); this.materials.add(screenMaterial)
    this.televisionScreen = this.box(tv, screenMaterial, -0.08, 0.49, 0.47, 0.9, 0.63, 0.012)
    for (const height of [0.29, 0.66]) this.box(tv, metal, 0.52, height, 0.46, 0.09, 0.09, 0.06)
    for (const side of [-1, 1]) {
      const antenna = this.box(tv, metal, side * 0.22, 1.18, -0.1, 0.02, 0.67, 0.02)
      antenna.rotation.z = -side * 0.55
    }
    this.scene.add(tv)
    this.televisionLight.position.set(4.85, 1.3, 1.5); this.scene.add(this.televisionLight)
    this.tableLamp.position.set(4.6, 1.6, 5.3); this.scene.add(this.tableLamp)
    this.box(this.scene, metal, 4.6, 1.12, 5.35, 0.06, 0.52, 0.06)
    this.box(this.scene, pale, 4.6, 0.89, 5.35, 0.42, 0.07, 0.3)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.45, 12, 1, true), this.material(0xafa78b, 0x332b1d))
    shade.position.set(4.6, 1.53, 5.35); this.scene.add(shade)
    this.roomLights[0]!.position.set(-2.8, 1.25, 1.7)
    this.roomLights[1]!.position.set(-3.7, 2.45, -3.3)
    this.scene.add(...this.roomLights)
    this.box(this.scene, metal, -2.8, 0.87, 1.7, 0.035, 0.44, 0.035)
    const bedsideShade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.26, 10, 1, true), pale)
    bedsideShade.position.set(-2.8, 1.16, 1.7); this.scene.add(bedsideShade)
    this.box(this.scene, dark, -3.7, 2.69, -3.3, 0.04, 0.4, 0.04)
    const kitchenShade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 12, 1, true), pale)
    kitchenShade.position.set(-3.7, 2.45, -3.3); this.scene.add(kitchenShade)
    this.buildNote()
    this.post = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: asciiFragment,
      uniforms: { uScene: { value: this.target.texture }, uAtlas: { value: atlas }, uResolution: { value: new THREE.Vector2(1, 1) }, uCell: { value: new THREE.Vector2(7, 11) }, uPeeking: { value: 0 } },
      depthTest: false, depthWrite: false,
    })
    this.screenScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post))
  }

  resize(width: number, height: number, dpr: number): void {
    this.target.setSize(Math.round(width * dpr), Math.round(height * dpr))
    this.post.uniforms.uResolution!.value.set(width * dpr, height * dpr)
    this.post.uniforms.uCell!.value.set(7 * dpr, 11 * dpr)
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix()
  }

  render(renderer: THREE.WebGLRenderer, world: WorldState, dt: number): void {
    const house = world.house
    const progress = this.reducedMotion ? 1 : Math.min(1, house.elapsed / 2.6)
    const eased = progress * progress * (3 - 2 * progress)
    this.camera.position.set(world.player.x, 0.72 + eased * 0.9, world.player.z)
    this.camera.rotation.set(house.pitch - (1 - eased) * 0.26, -house.yaw, 0, 'YXZ')
    if (house.peeking) {
      this.camera.position.set(3.5, 1.65, -6.7); this.camera.rotation.set(0, 0, 0, 'YXZ')
    }
    const fov = house.peeking ? 100 : 67
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix() }
    this.post.uniforms.uPeeking!.value = house.peeking ? 1 : 0
    this.fridgeDoor.rotation.y += ((house.fridgeOpen ? -Math.PI * 0.62 : 0) - this.fridgeDoor.rotation.y) * (this.reducedMotion ? 1 : Math.min(1, dt * 7))
    this.bottles.forEach((bottle, index) => { bottle.visible = index < house.beer })
    this.tableLamp.intensity = house.lampOn ? 10 : 0
    this.roomLights.forEach((light, index) => { light.intensity = house.lampOn ? index === 0 ? 5 : 4 : 0 })
    this.radioLight.visible = house.radioOn
    this.televisionScreen.visible = house.tvOn
    this.televisionLight.intensity = house.tvOn ? 3.5 : 0
    this.syncTelevision(world)
    const screenMaterial = this.televisionScreen.material as THREE.MeshBasicMaterial
    const map = HOUSE_TV_CHANNELS[house.tvChannel] && this.video.readyState >= 2 && !this.video.error ? this.videoTexture : this.televisionTexture
    if (screenMaterial.map !== map) { screenMaterial.map = map; screenMaterial.needsUpdate = true }
    const frame = Math.floor(house.elapsed * 8)
    if (house.tvOn && (frame !== this.lastBroadcastFrame || this.videoChannel !== house.tvChannel)) { this.lastBroadcastFrame = frame; this.drawBroadcast(house.elapsed) }
    renderer.shadowMap.enabled = true
    const previousTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target); renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(previousTarget); renderer.render(this.screenScene, this.screenCamera)
  }

  syncTelevision(world: WorldState, fromGesture = false): void {
    const house = world.house
    if (this.videoChannel !== house.tvChannel) {
      this.video.pause(); this.playRequested = false; this.videoChannel = house.tvChannel
      const url = HOUSE_TV_CHANNELS[house.tvChannel]
      if (url) this.video.src = url
      else this.video.removeAttribute('src')
      this.video.load()
    }
    const shouldPlay = !!HOUSE_TV_CHANNELS[house.tvChannel] && house.tvOn && !document.hidden
    if (fromGesture && shouldPlay && this.video.paused) this.playRequested = false
    if (shouldPlay && !this.playRequested) {
      this.playRequested = true
      void this.video.play().catch(() => { /* A later user interaction can retry playback. */ })
    } else if (!shouldPlay && this.playRequested) { this.video.pause(); this.playRequested = false }
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.videoTexture?.dispose()
    window.dispatchEvent(new CustomEvent('ascii:house-video', { detail: null }))
    this.scene.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
    this.screenScene.traverse((object) => { if (object instanceof THREE.Mesh) object.geometry.dispose() })
    this.materials.forEach((material) => material.dispose()); this.post.dispose(); this.target.dispose(); this.televisionTexture.dispose()
  }

  private material(color: number, emissive = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.88 }); this.materials.add(material); return material
  }

  private box(group: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh
  }

  private buildShell(wall: THREE.Material, wood: THREE.Material, dark: THREE.Material): void {
    this.box(this.scene, wood, 0, -0.12, 0, 13.2, 0.24, 13.2)
    this.box(this.scene, wall, 0, 2.98, 0, 13.2, 0.16, 13.2)
    for (const part of HOUSE_WALLS) {
      if (Math.abs(part.x) === 6.5) {
        const windowZ = part.x < 0 ? 3.2 : -2.5
        const lowEnd = windowZ - 1.2, highEnd = windowZ + 1.2
        this.box(this.scene, wall, part.x, 1.45, (-6.5 + lowEnd) / 2, 0.22, 2.9, lowEnd + 6.5)
        this.box(this.scene, wall, part.x, 1.45, (6.5 + highEnd) / 2, 0.22, 2.9, 6.5 - highEnd)
        this.box(this.scene, wall, part.x, 0.48, windowZ, 0.22, 0.96, 2.4)
        this.box(this.scene, wall, part.x, 2.63, windowZ, 0.22, 0.54, 2.4)
        for (const offset of [-1.2, 0, 1.2]) this.box(this.scene, wood, part.x, 1.65, windowZ + offset, 0.28, 1.5, 0.065)
        for (const y of [0.98, 1.65, 2.35]) this.box(this.scene, wood, part.x, y, windowZ, 0.28, 0.065, 2.4)
        const glass = new THREE.MeshStandardMaterial({ color: 0x9daeb1, transparent: true, opacity: 0.16, roughness: 0.35 }); this.materials.add(glass)
        this.box(this.scene, glass, part.x, 1.65, windowZ, 0.025, 1.3, 2.3)
        for (const side of [-1, 1]) this.box(this.scene, dark, part.x * 0.98, 1.65, windowZ + side * 1.36, 0.12, 1.85, 0.4)
      } else this.box(this.scene, wall, part.x, part.height / 2, part.z, part.width, part.height, part.depth)
    }
    for (const z of [-3.45, 3.05]) {
      this.box(this.scene, wood, -0.6, 2.47, z, 0.28, 0.18, 1.5)
      for (const side of [-1, 1]) this.box(this.scene, wood, -0.6, 1.2, z + side * 0.69, 0.28, 2.4, 0.09)
      this.box(this.scene, wall, -0.6, 2.75, z, 0.16, 0.3, 1.4)
    }
    this.door.position.set(2.6, 0, -6.5)
    this.box(this.door, wood, 0.9, 1.18, 0, 1.8, 2.36, 0.16)
    const peephole = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 12), this.material(0x9b9e86))
    peephole.position.set(0.9, 1.65, 0.1); this.door.add(peephole)
    this.box(this.door, dark, 0.9, 1.65, 0.089, 0.06, 0.06, 0.015)
    this.box(this.door, dark, 1.57, 1.05, 0.12, 0.1, 0.06, 0.1); this.scene.add(this.door)
    this.box(this.scene, wall, 3.5, 2.64, -6.5, 1.8, 0.52, 0.22)
    for (let x = -6.3; x < 6.5; x += 0.6) this.box(this.scene, dark, x, 0.008, 0, 0.015, 0.01, 13)
    for (const z of [-6.35, 6.35]) this.box(this.scene, wood, 0, 0.065, z, 13, 0.13, 0.04)
    this.box(this.scene, this.material(0x504941), 3.35, 0.025, 2.3, 3.7, 0.04, 5)
  }

  private buildFurniture(wood: THREE.Material, dark: THREE.Material, fabric: THREE.Material, metal: THREE.Material, pale: THREE.Material): void {
    for (const item of HOUSE_FURNITURE) {
      const y = item.height
      if (item.kind === 'table') {
        this.box(this.scene, wood, item.x, y - 0.06, item.z, item.width, 0.12, item.depth)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(this.scene, wood, item.x + sx * (item.width / 2 - 0.08), y / 2, item.z + sz * (item.depth / 2 - 0.08), 0.08, y, 0.08)
      } else if (item.kind === 'bed') {
        this.box(this.scene, wood, item.x, 0.2, item.z, item.width, 0.4, item.depth)
        this.box(this.scene, pale, item.x, 0.45, item.z, item.width - 0.1, 0.2, item.depth - 0.1)
        this.box(this.scene, fabric, item.x, 0.57, item.z + 0.48, item.width - 0.08, 0.15, 1.95)
        this.box(this.scene, pale, item.x, 0.62, item.z - 1.02, 1.2, 0.2, 0.54)
        this.box(this.scene, wood, item.x, 0.67, item.z - 1.5, item.width, 1.3, 0.15)
      } else if (item.kind === 'fridge') {
        // An actual hollow cabinet, shelves and a hinged door; the collision stays closed.
        const x = item.x, z = item.z
        this.box(this.scene, pale, x, 0.95, z - 0.49, 1.1, 1.9, 0.12)
        for (const side of [-1, 1]) this.box(this.scene, pale, x + side * 0.5, 0.95, z, 0.1, 1.9, 1.1)
        for (const y of [0.08, 0.55, 1.12, 1.84]) this.box(this.scene, pale, x, y, z, 1.1, 0.1, 1.1)
        this.fridgeDoor.position.set(x - 0.55, 0, z + 0.55)
        this.box(this.fridgeDoor, pale, 0.55, 0.95, 0, 1.1, 1.9, 0.1)
        this.box(this.fridgeDoor, dark, 0.97, 1.05, 0.09, 0.045, 0.3, 0.08)
        this.box(this.fridgeDoor, dark, 0.55, 1.4, 0.06, 1.05, 0.015, 0.025)
        this.scene.add(this.fridgeDoor)
        const brown = this.material(0x5b4228), label = this.material(0xb4b18c)
        for (let i = 0; i < 4; i++) {
          const bottle = new THREE.Group(); bottle.position.set(x - 0.34 + i * 0.22, 0.61, z + 0.15)
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.29, 10), brown); body.position.y = 0.145; bottle.add(body)
          this.box(bottle, brown, 0, 0.33, 0, 0.07, 0.15, 0.07)
          this.box(bottle, metal, 0, 0.41, 0, 0.09, 0.025, 0.09)
          this.box(bottle, label, 0, 0.16, 0.073, 0.12, 0.12, 0.015)
          this.bottles.push(bottle); this.scene.add(bottle)
        }
      } else if (item.kind === 'sofa') {
        this.box(this.scene, fabric, item.x, 0.4, item.z, item.width, 0.65, item.depth)
        this.box(this.scene, fabric, item.x - 0.48, 0.76, item.z, 0.22, 1.1, item.depth)
        for (const side of [-1, 1]) this.box(this.scene, fabric, item.x, 0.7, item.z + side * 1.2, item.width, 0.35, 0.24)
      } else {
        this.box(this.scene, item.kind === 'sink' ? pale : wood, item.x, y / 2, item.z, item.width, y, item.depth)
        if (item.kind === 'wardrobe') {
          this.box(this.scene, dark, item.x + item.width / 2 - 0.13, y * 0.55, item.z + item.depth / 2 + 0.04, 0.04, 0.22, 0.05)
          this.box(this.scene, dark, item.x, y * 0.72, item.z + item.depth / 2 + 0.015, item.width, 0.015, 0.025)
        }
        if (item.kind === 'chair') this.box(this.scene, wood, item.x, 0.75, item.z + 0.25, 0.55, 0.6, 0.07)
        if (item.kind === 'sink') {
          this.box(this.scene, metal, item.x, 0.91, item.z, 1, 0.035, 0.55)
          this.box(this.scene, dark, item.x, 0.93, item.z, 0.75, 0.035, 0.38)
          this.box(this.scene, metal, item.x, 1.1, item.z - 0.25, 0.04, 0.35, 0.04)
          this.box(this.scene, metal, item.x, 1.27, item.z - 0.15, 0.04, 0.035, 0.22)
        }
      }
    }
    // Mundane details make the rooms feel inhabited, even through a glyph grid.
    for (const [x, z, y] of [[-4.3, -2.2, 0.85], [3.35, 2.3, 0.54]] as const) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.19, 12, 1, true), pale)
      cup.position.set(x, y, z); this.scene.add(cup)
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 5, 12), pale); handle.position.set(x + 0.1, y, z); this.scene.add(handle)
    }
    this.box(this.scene, pale, 3.35, 0.51, 2.8, 0.5, 0.045, 0.7)
    this.box(this.scene, dark, 3.35, 0.53, 2.8, 0.44, 0.012, 0.62)
    const pictureFrame = this.box(this.scene, wood, 6.34, 1.8, 4.5, 0.08, 0.8, 1.1)
    pictureFrame.rotation.z = 0.015
    this.box(this.scene, this.material(0x77867c), 6.29, 1.8, 4.5, 0.025, 0.65, 0.95)
    this.box(this.scene, pale, -6.33, 1.6, -1.5, 0.045, 0.9, 0.55)
    for (let i = 0; i < 5; i++) this.box(this.scene, dark, -6.3, 1.8 - i * 0.13, -1.5, 0.015, 0.035, 0.35)
  }

  private buildStreet(wall: THREE.Material, wood: THREE.Material, dark: THREE.Material): void {
    this.box(this.scene, this.material(0x303b33), 0, -0.23, -1, 34, 0.2, 34)
    this.box(this.scene, dark, 0, -0.11, -11.5, 34, 0.04, 3.6)
    for (let x = -15; x < 16; x += 4) this.box(this.scene, wall, x, -0.08, -11.5, 1.5, 0.025, 0.08)
    this.box(this.scene, wood, 3.5, -0.04, -7.7, 3.5, 0.08, 2.4)
    // The house opposite sits in the peephole's limited view.
    this.box(this.scene, wall, 3.5, 1.8, -18, 7, 3.6, 4)
    for (const side of [-1, 1]) {
      const roof = this.box(this.scene, dark, 3.5 + side * 1.8, 4.1, -18, 4.1, 0.18, 4.6)
      roof.rotation.z = -side * 0.42
    }
    this.box(this.scene, wood, 3.5, 1.1, -15.96, 1.2, 2.2, 0.08)
    for (const x of [1.3, 5.7]) {
      this.box(this.scene, this.material(0x899383, 0x384333), x, 1.8, -15.95, 1.1, 1.2, 0.08)
      this.box(this.scene, wood, x, 1.8, -15.88, 0.06, 1.2, 0.08)
    }
    for (const side of [-1, 1]) {
      const group = new THREE.Group(); group.position.set(side * 10, 0, -15)
      this.box(group, wall, 0, 1.8, 0, 5, 3.6, 4)
      for (const roofSide of [-1, 1]) { const roof = this.box(group, dark, roofSide * 1.3, 4, 0, 3.1, 0.16, 4.5); roof.rotation.z = -roofSide * 0.45 }
      this.box(group, this.material(0x748786, 0x172727), 0.8, 1.8, 2.03, 1, 1.2, 0.04)
      this.scene.add(group)
      for (let z = -8; z < 10; z += 2) this.box(this.scene, wood, side * 13, 0.6, z, 0.12, 1.2, 0.12)
      this.box(this.scene, wood, side * 13, 0.8, 1, 0.08, 0.12, 18)
    }
  }

  private buildNote(): void {
    const paper = this.material(0xb9b9a4), ink = this.material(0x242b27)
    this.box(this.scene, paper, -2.8, 0.66, 1.88, 0.45, 0.015, 0.5)
    for (let i = 0; i < 3; i++) this.box(this.scene, ink, -2.8 + (i - 1) * 0.12, 0.671, 1.83, 0.055, 0.004, 0.055)
    this.box(this.scene, ink, -2.8, 0.672, 2.01, 0.27, 0.004, 0.012)
  }

  private drawBroadcast(time: number): void {
    const ctx = this.canvas.getContext('2d')!
    ctx.fillStyle = '#172520'; ctx.fillRect(0, 0, 512, 384)
    ctx.fillStyle = '#9aafa0'; ctx.textAlign = 'center'; ctx.font = '30px monospace'
    ctx.fillText('ОСТАВАЙТЕСЬ', 256, 130); ctx.fillText('ДОМА', 256, 175)
    ctx.font = '80px monospace'; ctx.fillText('◌ ⋮ ∴', 256, 275)
    ctx.fillStyle = '#0a100c55'
    for (let y = (time * 15) % 6; y < 384; y += 6) ctx.fillRect(0, y, 512, 2)
    ctx.strokeStyle = '#b5c4b3'; ctx.strokeRect(25, 25, 462, 334)
    this.televisionTexture.needsUpdate = true
  }
}
