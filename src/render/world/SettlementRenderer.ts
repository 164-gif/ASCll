import * as THREE from 'three'
import type { WorldState, ResidentState } from '../../simulation/WorldState'
import { TOWN_BUILDINGS, TOWN_CENTER, TOWN_FIELDS, TOWN_WALL, terrainHeightAt } from '../../world/WorldLayout'
import { TENT_ELDER, INTERIOR_DEPTH, INTERIOR_WIDTH, INTERIOR_FURNITURE, TOWN_COLLIDERS, type InteriorKind } from '../../world/Settlement'

type MaterialFactory = (base: number, dark: number, offset?: number, emissive?: number) => THREE.ShaderMaterial

export class SettlementRenderer {
  readonly interiorScene = new THREE.Scene()
  private readonly rooms = new Map<string, THREE.Group>()
  private readonly people = new Map<string, THREE.Group>()
  private readonly frontWall = new THREE.Group()
  private readonly stone: THREE.Material
  private readonly wood: THREE.Material
  private readonly dark: THREE.Material
  private readonly straw: THREE.Material
  private readonly glow: THREE.Material
  private readonly skin: THREE.Material
  private readonly metal: THREE.Material

  constructor(private readonly scene: THREE.Scene, private readonly make: MaterialFactory) {
    this.stone = make(0x87918a, 0x171c18, 5)
    this.wood = make(0x927452, 0x1b150d, 8)
    this.dark = make(0x4e5b51, 0x080e0c, 3)
    this.straw = make(0xc0a56c, 0x302613, 12)
    this.glow = make(0xe3bd73, 0x694018, 18, 0.65)
    this.skin = make(0xc2ae88, 0x342b21, 7)
    this.metal = make(0x8e9b9d, 0x141a1c, 3)
    this.interiorScene.background = new THREE.Color(0x030504)
    this.buildTown()
    this.buildFields()
    for (const kind of ['inn', 'smithy', 'hall', 'tent'] as const) this.buildRoom(kind)
  }

  update(world: WorldState): void {
    for (const [kind, room] of this.rooms) room.visible = world.interior?.kind === kind
    const insideTown = !world.interior && Math.abs(world.player.x - TOWN_CENTER.x) < 21 && Math.abs(world.player.z - TOWN_CENTER.z) < 20
    this.frontWall.scale.y += ((insideTown ? 0.24 : 1) - this.frontWall.scale.y) * 0.12
    for (const person of world.residents) {
      const group = this.people.get(person.id) ?? this.buildPerson(person)
      group.position.set(person.x, terrainHeightAt(person.x, person.z), person.z)
      group.rotation.y = person.facing
      const legs = group.userData.legs as THREE.Mesh[]
      const swing = person.walking ? Math.sin(world.elapsed * 6) * 0.32 : 0
      legs[0]!.rotation.x = swing; legs[1]!.rotation.x = -swing
      const tool = group.userData.tool as THREE.Group | undefined
      if (tool) tool.rotation.x = person.walking ? 0.2 : -0.3 + Math.sin(world.elapsed * 2) * 0.35
    }
  }

  private box(group: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z); group.add(mesh); return mesh
  }

  private barrel(group: THREE.Object3D, x: number, y: number, z: number): void {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.46, 1.1, 8), this.wood)
    body.position.set(x, y + 0.55, z); group.add(body)
    for (const height of [0.2, 0.85]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 4, 8), this.metal)
      band.rotation.x = Math.PI / 2; band.position.set(x, y + height, z); group.add(band)
    }
  }

  private buildTown(): void {
    const group = new THREE.Group()
    group.name = 'sedoy-bor'
    // Walls and their collision footprints share the same source data.
    for (const [index, wall] of TOWN_COLLIDERS.slice(0, 5).entries()) {
      const target = index === 2 ? this.frontWall : group
      const ground = terrainHeightAt(wall.x, wall.z)
      this.box(target, this.stone, wall.x, ground + 2, wall.z, wall.width, 4, wall.depth)
      const horizontal = wall.width > wall.depth
      const length = horizontal ? wall.width : wall.depth
      for (let step = 0; step < length; step += 1.8) {
        const x = wall.x + (horizontal ? step - length / 2 + 0.5 : 0)
        const z = wall.z + (horizontal ? 0 : step - length / 2 + 0.5)
        this.box(target, this.stone, x, ground + 4.3, z, 0.8, 0.65, 0.8)
      }
    }
    for (const tower of TOWN_COLLIDERS.slice(5, 9)) {
      const y = terrainHeightAt(tower.x, tower.z)
      this.box(group, this.stone, tower.x, y + 3.1, tower.z, 4.4, 6.2, 4.4)
      this.box(group, this.dark, tower.x, y + 6.3, tower.z, 4.9, 0.35, 4.9)
      for (const side of [-1, 1]) for (const offset of [-1.6, 0, 1.6]) {
        this.box(group, this.stone, tower.x + offset, y + 6.8, tower.z + side * 2, 0.85, 0.8, 0.85)
        this.box(group, this.stone, tower.x + side * 2, y + 6.8, tower.z + offset, 0.85, 0.8, 0.85)
      }
    }
    const gateZ = TOWN_CENTER.z - TOWN_WALL.depth / 2
    this.box(group, this.wood, TOWN_CENTER.x, 4.8, gateZ, 8.2, 0.65, 1.5)
    for (const side of [-1, 1]) {
      this.box(group, this.wood, TOWN_CENTER.x + side * 3.7, 2, gateZ, 0.45, 4, 1.6)
      this.box(group, this.glow, TOWN_CENTER.x + side * 4.5, 2.3, gateZ - 0.75, 0.3, 0.65, 0.3)
    }
    for (const building of TOWN_BUILDINGS) {
      const house = new THREE.Group()
      house.position.set(building.x, terrainHeightAt(building.x, building.z), building.z)
      house.rotation.y = building.rotation
      const w = building.width, d = building.depth, h = building.kind === 'hall' ? 5 : 3.5
      this.box(house, this.stone, 0, 0.12, 0, w + 0.4, 0.24, d + 0.4)
      this.box(house, this.stone, -w / 2, h / 2, 0, 0.4, h, d)
      this.box(house, this.stone, w / 2, h / 2, 0, 0.4, h, d)
      this.box(house, this.stone, 0, h / 2, d / 2, w, h, 0.4)
      const sideWidth = (w - 2) / 2
      for (const side of [-1, 1]) {
        this.box(house, this.stone, side * (w + 2) / 4, h / 2, -d / 2, sideWidth, h, 0.4)
        this.box(house, this.wood, side * 1.15, 1.25, -d / 2 - 0.2, 0.18, 2.5, 0.3)
        this.box(house, this.wood, side * (w / 2 - 0.2), h / 2, -d / 2 - 0.25, 0.25, h, 0.25)
        this.box(house, this.glow, side * w * 0.32, 1.8, -d / 2 - 0.22, 0.85, 1.15, 0.08)
        this.box(house, this.wood, side * w * 0.32, 1.8, -d / 2 - 0.29, 0.12, 1.2, 0.1)
        const roof = this.box(house, building.kind === 'house' ? this.straw : this.dark, side * w / 4, h + 0.9, 0, w * 0.59, 0.23, d + 1.1)
        roof.rotation.z = -side * 0.42
      }
      this.box(house, this.wood, 0, 2.5, -d / 2 - 0.15, 2.5, 0.3, 0.4)
      this.box(house, this.dark, 0, 1.15, -d / 2 + 0.1, 2, 2.3, 0.1)
      this.box(house, this.wood, 0, h - 0.3, -d / 2 - 0.25, w, 0.24, 0.25)
      this.box(house, this.stone, w * 0.3, h + 1, d * 0.2, 0.8, 3, 0.9)
      this.box(house, this.wood, 0, 3.0, -d / 2 - 0.6, 2.6, 0.55, 0.16)
      this.barrel(house, -w / 2 - 0.8, 0, d / 2)
      group.add(house)
    }
    this.box(group, this.dark, -25, 0.07, 103, 18, 0.03, 10)
    for (let x = -33; x <= -17; x += 2) for (let z = 99; z <= 107; z += 2) this.box(group, this.stone, x, 0.095, z, 1.85, 0.025, 1.85)
    // Well, market stalls, paving, cart and stacked supplies.
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.9, 10, 1, true), this.stone)
    well.position.set(-30, 0.52, 103); group.add(well)
    for (const side of [-1, 1]) this.box(group, this.wood, -30 + side * 1.25, 1.5, 103, 0.18, 3, 0.18)
    this.box(group, this.wood, -30, 2.9, 103, 3.5, 0.3, 2.8)
    for (let i = 0; i < 5; i++) this.barrel(group, -44, 0.06, 101 + i * 1.25)
    for (let i = 0; i < 6; i++) this.box(group, this.wood, -7.5, 0.3 + (i % 2) * 0.52, 103 + Math.floor(i / 2) * 0.65, 1.4, 0.5, 0.6)
    const cart = new THREE.Group(); cart.position.set(-42, 0.06, 119)
    this.box(cart, this.wood, 0, 0.85, 0, 2.2, 0.25, 3)
    for (const side of [-1, 1]) {
      this.box(cart, this.wood, side * 1.1, 1.2, 0, 0.15, 0.7, 3)
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.08, 5, 12), this.wood)
      wheel.rotation.y = Math.PI / 2; wheel.position.set(side * 1.3, 0.65, 0); cart.add(wheel)
    }
    group.add(cart, this.frontWall); this.scene.add(group)
  }

  private buildFields(): void {
    for (const field of TOWN_FIELDS) {
      const fieldGroup = new THREE.Group()
      const c = Math.cos(field.rotation), s = Math.sin(field.rotation)
      const worldPoint = (x: number, z: number) => ({ x: field.x + c * x + s * z, z: field.z - s * x + c * z })
      const positions: THREE.Vector3[] = []
      for (let x = -field.width / 2 + 1; x < field.width / 2; x += 1.3) {
        for (let z = -field.depth / 2 + 1; z < field.depth / 2; z += 0.85) {
          const p = worldPoint(x, z)
          positions.push(new THREE.Vector3(p.x, terrainHeightAt(p.x, p.z) + 0.48, p.z))
        }
      }
      const crop = new THREE.InstancedMesh(new THREE.ConeGeometry(0.17, 0.95, 4), field.crop === 'grain' ? this.straw : this.wood, positions.length)
      const dummy = new THREE.Object3D()
      positions.forEach((position, i) => {
        dummy.position.copy(position); dummy.rotation.set(Math.sin(i * 1.7) * 0.1, i, 0)
        dummy.scale.set(1, 0.8 + (i % 7) * 0.06, 1); dummy.updateMatrix(); crop.setMatrixAt(i, dummy.matrix)
      })
      crop.instanceMatrix.needsUpdate = true; fieldGroup.add(crop)
      const furrowMatrices: THREE.Matrix4[] = []
      for (let x = -field.width / 2; x <= field.width / 2; x += 1.3) {
        for (let z = -field.depth / 2; z < field.depth / 2; z += 3) {
          const p = worldPoint(x, z + 1.5)
          dummy.position.set(p.x, terrainHeightAt(p.x, p.z) + 0.025, p.z)
          dummy.rotation.set(0, field.rotation, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix()
          furrowMatrices.push(dummy.matrix.clone())
        }
      }
      const furrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.04, 3), this.dark, furrowMatrices.length)
      furrowMatrices.forEach((matrix, i) => furrows.setMatrixAt(i, matrix))
      furrows.instanceMatrix.needsUpdate = true; fieldGroup.add(furrows)
      // Low field fences leave the road-facing side open.
      for (const side of [-1, 1]) for (let z = -field.depth / 2; z <= field.depth / 2; z += 4) {
        const p = worldPoint(side * field.width / 2, z)
        this.box(fieldGroup, this.wood, p.x, terrainHeightAt(p.x, p.z) + 0.55, p.z, 0.13, 1.1, 0.13)
        const rail = this.box(fieldGroup, this.wood, p.x, terrainHeightAt(p.x, p.z) + 0.8, p.z, 0.1, 0.12, 3.8)
        rail.rotation.y = field.rotation
      }
      const scarecrow = worldPoint(field.width / 2 - 3, 0)
      const y = terrainHeightAt(scarecrow.x, scarecrow.z)
      this.box(fieldGroup, this.wood, scarecrow.x, y + 1.3, scarecrow.z, 0.15, 2.6, 0.15)
      this.box(fieldGroup, this.wood, scarecrow.x, y + 2, scarecrow.z, 2, 0.12, 0.12)
      this.box(fieldGroup, this.straw, scarecrow.x, y + 1.8, scarecrow.z, 0.6, 0.9, 0.28)
      this.box(fieldGroup, this.straw, scarecrow.x, y + 2.5, scarecrow.z, 0.45, 0.45, 0.4)
      this.scene.add(fieldGroup)
    }
  }

  private buildPerson(person: ResidentState): THREE.Group {
    const group = new THREE.Group()
    const cloth = this.make(person.color, 0x191b14, 8)
    const legs = [-1, 1].map((side) => this.box(group, this.dark, side * 0.15, 0.37, 0, 0.22, 0.72, 0.23))
    this.box(group, cloth, 0, 1.02, 0, 0.6, 0.85, 0.4)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), this.skin)
    head.position.y = 1.65; group.add(head)
    for (const side of [-1, 1]) this.box(group, cloth, side * 0.38, 1.02, 0, 0.18, 0.75, 0.2)
    if (person.farmer) {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 8), this.straw)
      hat.position.y = 1.92; group.add(hat)
      const tool = new THREE.Group(); tool.position.set(0.45, 1, 0.2)
      this.box(tool, this.wood, 0, 0, 0, 0.08, 1.5, 0.08)
      this.box(tool, this.metal, 0, -0.72, 0.2, 0.4, 0.08, 0.4)
      group.add(tool); group.userData.tool = tool
    }
    group.userData.legs = legs
    this.people.set(person.id, group); this.scene.add(group); return group
  }

  private buildTentShell(room: THREE.Group): void {
    const canvas = this.make(0xa29879, 0x25251b, 7)
    const cloth = this.make(0x76534a, 0x20130e, 11)
    this.box(room, cloth, 0, 0.03, 0.5, 9.5, 0.05, 8)
    for (const side of [-1, 1]) {
      this.box(room, canvas, side * 7.4, 1.2, 0, 0.18, 2.4, 13)
      const slope = this.box(room, canvas, side * 5.7, 3, -1.7, 4.3, 0.12, 9.4)
      slope.rotation.z = -side * 0.5
      this.box(room, this.wood, side * 6.6, 1.9, -5.7, 0.15, 3.8, 0.15)
    }
    this.box(room, canvas, 0, 1.7, -6.3, 14.8, 3.4, 0.15)
    this.box(room, this.wood, 0, 4.6, -1, 0.16, 0.16, 10.8)
    this.box(room, this.wood, 0, 2.3, -6, 0.15, 4.6, 0.15)
    this.box(room, canvas, -4.8, 0.35, 6.4, 5.4, 0.7, 0.15)
    this.box(room, canvas, 4.8, 0.35, 6.4, 5.4, 0.7, 0.15)
    // The roof's near half stays open to the fixed camera.
    this.box(room, this.wood, TENT_ELDER.x, 0.22, TENT_ELDER.z, 1.4, 0.44, 1.2)
    const cloak = this.make(0x81725d, 0x171510, 9)
    const elder = new THREE.Mesh(new THREE.ConeGeometry(0.43, 1.15, 7), cloak)
    elder.position.set(TENT_ELDER.x, 0.95, TENT_ELDER.z); room.add(elder)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 9, 7), this.straw)
    head.position.set(TENT_ELDER.x, 1.6, TENT_ELDER.z); room.add(head)
    this.box(room, this.wood, TENT_ELDER.x + 0.6, 0.9, TENT_ELDER.z, 0.09, 1.8, 0.09)
    for (let i = 0; i < 4; i++) this.box(room, this.straw, 2.1 + i * 0.3, 0.96, -2 + Math.sin(i) * 0.3, 0.25, 0.06, 0.7)
  }

  private buildRoom(kind: InteriorKind): void {
    const room = new THREE.Group(); room.name = `interior-${kind}`; room.visible = false
    this.box(room, this.wood, 0, -0.12, 0, INTERIOR_WIDTH, 0.24, INTERIOR_DEPTH)
    if (kind !== 'tent') {
    for (const side of [-1, 1]) this.box(room, this.stone, side * INTERIOR_WIDTH / 2, 1.8, 0, 0.3, 3.6, INTERIOR_DEPTH)
    this.box(room, this.stone, 0, 1.8, -INTERIOR_DEPTH / 2, INTERIOR_WIDTH, 3.6, 0.3)
    // The near wall is cut low, so the character stays visible from the fixed camera.
    for (const side of [-1, 1]) this.box(room, this.stone, side * 4.4, 0.4, INTERIOR_DEPTH / 2, 6.2, 0.8, 0.3)
    } else this.buildTentShell(room)
    this.box(room, this.glow, 0, 0.03, 6, 2.1, 0.05, 0.7)
    for (let x = -6.5; x < 7; x += 1) this.box(room, this.dark, x, 0.015, 0, 0.035, 0.02, INTERIOR_DEPTH)
    for (const side of [-1, 1]) {
      this.box(room, this.wood, side * 6.3, 1.5, -5.8, 0.2, 3, 0.2)
      this.box(room, this.glow, side * 6.3, 2.3, -5.5, 0.25, 0.45, 0.25)
    }
    for (const item of INTERIOR_FURNITURE[kind]) {
      const mat = item.kind === 'forge' ? this.stone : item.kind === 'anvil' ? this.metal : this.wood
      if (item.kind === 'table') {
        this.box(room, mat, item.x, item.height, item.z, item.width, 0.15, item.depth)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(room, mat, item.x + sx * (item.width / 2 - 0.2), item.height / 2, item.z + sz * (item.depth / 2 - 0.2), 0.14, item.height, 0.14)
        this.box(room, this.straw, item.x, item.height + 0.12, item.z, 0.8, 0.05, 0.6)
      } else {
        this.box(room, mat, item.x, item.height / 2, item.z, item.width, item.height, item.depth)
        if (item.kind === 'bed') {
          this.box(room, this.straw, item.x, item.height + 0.08, item.z + 0.8, 1.75, 0.16, 1.3)
          this.box(room, this.dark, item.x, item.height + 0.06, item.z - 0.4, 1.9, 0.12, 1.8)
        }
        if (item.kind === 'forge') this.box(room, this.glow, item.x, item.height + 0.07, item.z, item.width * 0.65, 0.15, item.depth * 0.6)
        if (item.kind === 'shelf') for (let i = 0; i < 4; i++) this.box(room, this.straw, item.x, 0.4 + i * 0.5, item.z + item.depth / 2 + 0.02, item.width * 0.8, 0.08, 0.08)
      }
    }
    this.rooms.set(kind, room); this.interiorScene.add(room)
  }
}
