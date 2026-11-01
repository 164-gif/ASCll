import * as THREE from 'three'
import { terrainHeightAt } from '../../world/WorldLayout'
import {
  FOREST_CAMP_X,
  FOREST_CAMP_Z,
  FOREST_CAMP_ROTATION,
} from '../../world/ForestCamp'
import type { WorldRenderer } from './WorldRenderer'

type RendererInternals = {
  scene: THREE.Scene
  createAsciiMaterial: (base: number, dark: number, charOffset?: number, emissive?: number) => THREE.ShaderMaterial
}

export class ForestCampEnhancer {
  private readonly scene: THREE.Scene
  private readonly group = new THREE.Group()
  private legacyCamp: THREE.Object3D | null = null

  constructor(renderer: WorldRenderer) {
    const internal = renderer as unknown as RendererInternals
    this.scene = internal.scene
    this.hideLegacyCamp()
    this.build(internal.createAsciiMaterial.bind(renderer))
  }

  destroy(): void {
    if (this.legacyCamp) this.legacyCamp.visible = true
    this.scene.remove(this.group)
  }

  private hideLegacyCamp(): void {
    for (const child of this.scene.children) {
      if (!(child instanceof THREE.Group)) continue
      if (
        Math.abs(child.position.x - FOREST_CAMP_X) < 0.08 &&
        Math.abs(child.position.z - FOREST_CAMP_Z) < 0.08 &&
        Math.abs(child.rotation.y - FOREST_CAMP_ROTATION) < 0.08
      ) {
        child.visible = false
        this.legacyCamp = child
        break
      }
    }
  }

  private build(makeMaterial: RendererInternals['createAsciiMaterial']): void {
    const baseY = terrainHeightAt(FOREST_CAMP_X, FOREST_CAMP_Z)
    this.group.name = 'forest-camp-enhanced'
    this.group.position.set(FOREST_CAMP_X, baseY, FOREST_CAMP_Z)
    this.group.rotation.y = FOREST_CAMP_ROTATION

    const canvas = makeMaterial(0xb4aa8d, 0x25231b, 6.8)
    const canvasShadow = makeMaterial(0x6d6958, 0x14140f, 4.3)
    const canvasInside = makeMaterial(0x3a352c, 0x090908, 1.8)
    const wood = makeMaterial(0x805536, 0x160d08, 3.9)
    const woodDark = makeMaterial(0x503620, 0x0c0805, 6.1)
    const rope = makeMaterial(0xc2ab78, 0x342719, 10.5)
    const metal = makeMaterial(0x929a96, 0x242826, 5.6)
    const clothPale = makeMaterial(0xc9c1aa, 0x383228, 12.1)
    const clothRed = makeMaterial(0x995040, 0x260e0b, 14.4)
    const cloak = makeMaterial(0x5e5145, 0x100d0b, 8.7)
    const cloakLight = makeMaterial(0x756557, 0x18130f, 9.4)
    const hair = makeMaterial(0xd9dcd6, 0x555b57, 2.2, 0.08)
    const skin = makeMaterial(0xc0a887, 0x493427, 7.8)
    const ember = makeMaterial(0xffc14c, 0x7a2500, 19.5, 0.96)

    this.buildMainTent(canvas, canvasShadow, canvasInside, wood, rope, ember)
    this.buildSmallTent(canvas, canvasShadow, wood, rope)
    this.buildClothesline(wood, rope, clothPale, clothRed)
    this.buildSupplies(wood, woodDark, metal)
    this.buildOldMan(cloak, cloakLight, hair, skin, wood)
    this.buildCampDetails(wood, rope, metal, clothPale)

    this.scene.add(this.group)
  }

  private buildMainTent(
    canvas: THREE.Material,
    shadow: THREE.Material,
    inside: THREE.Material,
    wood: THREE.Material,
    rope: THREE.Material,
    ember: THREE.Material,
  ): void {
    const tent = new THREE.Group()
    tent.position.set(2.8, 0.03, 2.4)
    tent.rotation.y = 0.2

    const width = 5.2
    const depth = 5.8
    const height = 3.05
    const slope = Math.hypot(width * 0.5, height)
    const angle = Math.atan2(height, width * 0.5)

    for (const side of [-1, 1]) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.11, depth), side < 0 ? canvas : shadow)
      roof.position.set(side * width * 0.25, height * 0.5, 0)
      roof.rotation.z = -side * angle
      tent.add(roof)

      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, depth * 0.94), side < 0 ? canvas : shadow)
      skirt.position.set(side * width * 0.5, 0.36, 0.05)
      tent.add(skirt)
    }

    const back = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, height * 0.72, 0.1), shadow)
    back.position.set(0, height * 0.36, depth * 0.49)
    tent.add(back)

    const floor = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 0.07, depth * 0.82), inside)
    floor.position.set(0, 0.06, 0.35)
    tent.add(floor)

    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, depth + 0.55), wood)
    ridge.position.y = height
    tent.add(ridge)

    for (const z of [-depth * 0.5, depth * 0.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, height + 0.42, 7), wood)
      pole.position.set(0, (height + 0.42) * 0.5, z)
      tent.add(pole)
    }

    // Front flaps leave an obvious dark doorway instead of a flat wall.
    for (const side of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.38, height * 0.72, 0.08), canvas)
      flap.position.set(side * width * 0.3, height * 0.36, -depth * 0.495)
      flap.rotation.y = side * 0.34
      tent.add(flap)
    }
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.95, 0.07), inside)
    doorway.position.set(0, 0.98, -depth * 0.505)
    tent.add(doorway)

    // Bedroll visibly placed inside, also matching the sleep interaction.
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.22, 2.25), shadow)
    bed.position.set(1.05, 0.19, 0.7)
    tent.add(bed)
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.45), canvas)
    blanket.position.set(1.05, 0.33, 0.38)
    blanket.rotation.x = -0.03
    tent.add(blanket)
    const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.02, 8), canvas)
    pillow.rotation.z = Math.PI * 0.5
    pillow.position.set(1.05, 0.42, 1.45)
    tent.add(pillow)

    // Small warm lamp inside the entrance.
    const lanternFrame = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.32), wood)
    lanternFrame.position.set(-0.75, 1.35, -1.7)
    tent.add(lanternFrame)
    const lanternGlow = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), ember)
    lanternGlow.position.copy(lanternFrame.position)
    tent.add(lanternGlow)

    // Guy ropes and stakes give the silhouette real structure.
    const anchors = [
      [-width * 0.72, -depth * 0.56], [width * 0.72, -depth * 0.56],
      [-width * 0.72, depth * 0.56], [width * 0.72, depth * 0.56],
    ] as const
    for (const [ax, az] of anchors) {
      const top = new THREE.Vector3(Math.sign(ax) * width * 0.26, height * 0.78, Math.sign(az) * depth * 0.43)
      const bottom = new THREE.Vector3(ax, 0.08, az)
      tent.add(this.beamBetween(top, bottom, 0.026, rope))
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.44, 5), wood)
      stake.position.set(ax, 0.16, az)
      stake.rotation.z = Math.sign(ax) * 0.18
      tent.add(stake)
    }

    this.group.add(tent)
  }

  private buildSmallTent(canvas: THREE.Material, shadow: THREE.Material, wood: THREE.Material, rope: THREE.Material): void {
    const tent = new THREE.Group()
    tent.position.set(-4.6, 0.03, 2.55)
    tent.rotation.y = -0.42

    const width = 2.85
    const depth = 3.25
    const height = 1.72
    const slope = Math.hypot(width * 0.5, height)
    const angle = Math.atan2(height, width * 0.5)
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.08, depth), side < 0 ? canvas : shadow)
      panel.position.set(side * width * 0.25, height * 0.5, 0)
      panel.rotation.z = -side * angle
      tent.add(panel)
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, depth + 0.28), wood)
    ridge.position.y = height
    tent.add(ridge)
    for (const side of [-1, 1]) {
      const ropeMesh = this.beamBetween(
        new THREE.Vector3(0, height * 0.88, -depth * 0.48),
        new THREE.Vector3(side * 2.0, 0.08, -depth * 0.75),
        0.02,
        rope,
      )
      tent.add(ropeMesh)
    }
    this.group.add(tent)
  }

  private buildClothesline(wood: THREE.Material, rope: THREE.Material, pale: THREE.Material, red: THREE.Material): void {
    const z = 5.25
    const postHeight = 2.55
    for (const x of [-0.7, 4.45]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, postHeight, 7), wood)
      post.position.set(x, postHeight * 0.5, z)
      this.group.add(post)
    }
    const line = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.035, 0.035), rope)
    line.position.set(1.88, 2.12, z)
    this.group.add(line)

    const pieces = [
      { x: 0.15, w: 0.9, h: 0.88, material: pale },
      { x: 1.55, w: 1.06, h: 1.0, material: red },
      { x: 2.95, w: 0.78, h: 0.72, material: pale },
      { x: 3.72, w: 0.48, h: 0.92, material: red },
    ]
    for (const piece of pieces) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(piece.w, piece.h, 0.05), piece.material)
      cloth.position.set(piece.x, 1.68, z)
      cloth.rotation.z = Math.sin(piece.x * 1.9) * 0.045
      this.group.add(cloth)
    }
  }

  private buildSupplies(wood: THREE.Material, dark: THREE.Material, metal: THREE.Material): void {
    const crateGeo = new THREE.BoxGeometry(0.86, 0.72, 0.86)
    for (const [x, z, rot] of [[0.55, 3.7, 0.1], [1.48, 3.9, -0.16], [-2.3, 2.85, 0.25]] as const) {
      const crate = new THREE.Mesh(crateGeo.clone(), wood)
      crate.position.set(x, 0.37, z)
      crate.rotation.y = rot
      this.group.add(crate)
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), dark)
      band.position.set(x, 0.58, z)
      band.rotation.y = rot
      this.group.add(band)
    }

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.95, 10), wood)
    barrel.position.set(4.95, 0.48, 1.35)
    barrel.rotation.z = Math.PI * 0.5
    this.group.add(barrel)
    for (const x of [-0.27, 0.27]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 5, 10), metal)
      band.rotation.y = Math.PI * 0.5
      band.position.set(4.95 + x, 0.48, 1.35)
      this.group.add(band)
    }
  }

  private buildOldMan(
    cloak: THREE.Material,
    cloakLight: THREE.Material,
    hair: THREE.Material,
    skin: THREE.Material,
    wood: THREE.Material,
  ): void {
    const oldMan = new THREE.Group()
    oldMan.position.set(-1.3, 0, -1.3)
    oldMan.rotation.y = 0.65

    // Log seat instead of a cube stool.
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.0, 8), wood)
    seat.rotation.z = Math.PI * 0.5
    seat.position.set(0, 0.33, 0.12)
    oldMan.add(seat)

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.16, 8), cloak)
    body.position.set(0, 0.88, 0.02)
    body.rotation.x = 0.14
    oldMan.add(body)

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.49, 9, 7), cloakLight)
    shoulder.scale.set(1.05, 0.62, 0.8)
    shoulder.position.set(0, 1.22, -0.02)
    oldMan.add(shoulder)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.2, 7), skin)
    neck.position.set(0, 1.45, -0.08)
    oldMan.add(neck)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), skin)
    head.scale.set(0.92, 1.08, 0.92)
    head.position.set(0, 1.69, -0.12)
    oldMan.add(head)

    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), hair)
    hairCap.scale.set(1.03, 0.72, 1.0)
    hairCap.position.set(0, 1.82, -0.08)
    oldMan.add(hairCap)

    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.52, 5), hair)
      lock.position.set(side * 0.24, 1.61, -0.04)
      lock.rotation.z = side * 0.16
      oldMan.add(lock)
    }

    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.62, 7), hair)
    beard.position.set(0, 1.39, -0.29)
    beard.rotation.x = 0.18
    oldMan.add(beard)

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skin)
    nose.position.set(0, 1.7, -0.39)
    oldMan.add(nose)

    for (const side of [-1, 1]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), cloak)
      thigh.position.set(side * 0.21, 0.56, -0.31)
      thigh.rotation.x = -0.72
      oldMan.add(thigh)

      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.58, 0.22), cloakLight)
      shin.position.set(side * 0.21, 0.27, -0.72)
      shin.rotation.x = 0.28
      oldMan.add(shin)

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.62, 6), cloakLight)
      arm.position.set(side * 0.39, 1.06, -0.2)
      arm.rotation.z = side * 0.42
      arm.rotation.x = -0.68
      oldMan.add(arm)

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 6, 5), skin)
      hand.position.set(side * 0.45, 0.78, -0.42)
      oldMan.add(hand)
    }

    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.75, 6), wood)
    staff.position.set(0.55, 0.88, -0.56)
    staff.rotation.z = 0.1
    oldMan.add(staff)
    const staffTop = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 5, 10, Math.PI * 1.4), wood)
    staffTop.position.set(0.49, 1.72, -0.56)
    staffTop.rotation.z = -0.4
    oldMan.add(staffTop)

    this.group.add(oldMan)
  }

  private buildCampDetails(wood: THREE.Material, rope: THREE.Material, metal: THREE.Material, cloth: THREE.Material): void {
    // Split logs and a low drying rack near the fire make the clearing feel inhabited.
    for (let index = 0; index < 4; index += 1) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.23, 1.65 + index * 0.12, 8), wood)
      log.position.set(-4.65 + index * 0.42, 0.23, -1.7 + index * 0.12)
      log.rotation.z = Math.PI * 0.5
      log.rotation.y = index * 0.12
      this.group.add(log)
    }

    const rackLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 1.25, 5), wood)
    rackLeft.position.set(-3.15, 0.62, -3.1)
    rackLeft.rotation.z = 0.22
    const rackRight = rackLeft.clone()
    rackRight.position.x = -1.7
    rackRight.rotation.z = -0.22
    this.group.add(rackLeft, rackRight)
    const rackBar = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.07, 0.07), wood)
    rackBar.position.set(-2.42, 1.1, -3.1)
    this.group.add(rackBar)
    const drying = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.45, 0.05), cloth)
    drying.position.set(-2.45, 0.83, -3.1)
    this.group.add(drying)

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.32, 8), metal)
    pot.position.set(-1.7, 0.27, -2.85)
    this.group.add(pot)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 5, 10, Math.PI), rope)
    handle.position.set(-1.7, 0.48, -2.85)
    handle.rotation.x = Math.PI * 0.5
    this.group.add(handle)
  }

  private beamBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
    const direction = new THREE.Vector3().subVectors(b, a)
    const length = direction.length()
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 5), material)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    return mesh
  }
}
