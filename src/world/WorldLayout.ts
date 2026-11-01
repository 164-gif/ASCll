export type LandmarkKind = 'monolith' | 'rock' | 'tree' | 'ruin' | 'gate' | 'tower'

export type WorldLandmark = {
  kind: LandmarkKind
  x: number
  z: number
  radius: number
  height: number
  rotation?: number
}

export type WorldZone = {
  id: 'river' | 'ruins' | 'meadow' | 'forest' | 'highland' | 'town' | 'wilds'
  name: string
  x: number
  z: number
  radius: number
}

export type WorldPoint = readonly [number, number]

export type WorldRoad = {
  id: string
  name: string
  width: number
  points: readonly WorldPoint[]
}

export type WorldBridge = {
  id: string
  name: string
  x: number
  z: number
  length: number
  width: number
  rotation: number
  style: 'stone' | 'wood'
  deckOffset: number
}

export type WorldFire = {
  x: number
  z: number
  strength: number
  radius: number
}

export type StructureKind = 'abbey' | 'forest-shrine' | 'highland-fort' | 'chapel'

export type WorldStructure = {
  id: string
  name: string
  kind: StructureKind
  x: number
  z: number
  rotation: number
  width: number
  depth: number
  height: number
}

export type TownBuilding = {
  id: string
  name: string
  kind: 'inn' | 'smithy' | 'house' | 'hall'
  x: number
  z: number
  rotation: number
  width: number
  depth: number
}

export type TownField = {
  id: string
  x: number
  z: number
  width: number
  depth: number
  rotation: number
  crop: 'grain' | 'rye'
}

export const WORLD_LIMIT = 138
export const RIVER_HALF_WIDTH = 6.8
export const TOWN_CENTER = { x: -25, z: 105 } as const
export const TOWN_WALL = { width: 44, depth: 40, gateWidth: 7 } as const

const WILDS_ZONE: WorldZone = { id: 'wilds', name: 'дикие земли', x: 0, z: 0, radius: 1 }

export const WORLD_ZONES: readonly WorldZone[] = [
  { id: 'river', name: 'речная низина', x: 0, z: -4, radius: 28 },
  { id: 'ruins', name: 'аббатство безмолвия', x: -48, z: -15, radius: 31 },
  { id: 'meadow', name: 'северные поля', x: -10, z: 52, radius: 33 },
  { id: 'forest', name: 'тёмная чаща', x: 50, z: 25, radius: 35 },
  { id: 'highland', name: 'каменный перевал', x: 36, z: -52, radius: 34 },
  { id: 'town', name: 'Седой Бор · город-крепость', ...TOWN_CENTER, radius: 34 },
]

export const WORLD_ROADS: readonly WorldRoad[] = [
  {
    id: 'pilgrim-road',
    name: 'дорога паломников',
    width: 3.8,
    points: [[-78, -16], [-62, -15], [-49, -14], [-34, -13], [-19, -12], [-7, -12], [4, 4], [20, 11], [36, 18], [50, 25], [69, 34]],
  },
  {
    id: 'north-road',
    name: 'северный тракт',
    width: 3.2,
    points: [[4, 4], [1, 19], [-5, 35], [-10, 51], [-11, 69], [-7, 78], [-25, 80], [-25, 86]],
  },
  {
    id: 'town-street',
    name: 'улицы Седого Бора',
    width: 2.7,
    points: [[-25, 86], [-25, 98], [-25, 112]],
  },
  {
    id: 'market-lane',
    name: 'рыночный проезд',
    width: 2.4,
    points: [[-43, 101], [-34, 101], [-25, 101], [-16, 101], [-7, 101]],
  },
  {
    id: 'field-track',
    name: 'колейная дорога',
    width: 2.6,
    points: [[-25, 80], [-51, 80], [-54, 90], [-68, 101]],
  },
  {
    id: 'east-field-track',
    name: 'дорога к жатве',
    width: 2.6,
    points: [[-25, 80], [1, 80], [4, 94], [17, 101]],
  },
  {
    id: 'highland-road',
    name: 'дорога к перевалу',
    width: 3.0,
    points: [[-7, -12], [7, -22], [20, -34], [31, -45], [38, -57], [54, -72]],
  },
  {
    id: 'forest-road',
    name: 'лесной путь',
    width: 2.8,
    points: [[50, 25], [49, 9], [47, -8], [43, -23], [36, -39], [36, -52]],
  },
]

export const WORLD_ROAD_SEGMENTS: readonly (readonly [number, number, number, number, number])[] = WORLD_ROADS.flatMap(
  (road) => road.points.slice(0, -1).map((point, index) => {
    const next = road.points[index + 1]!
    return [point[0], point[1], next[0], next[1], road.width] as const
  }),
)

export const WORLD_BRIDGES: readonly WorldBridge[] = [
  {
    id: 'old-stone-bridge',
    name: 'мост паломников',
    x: 0,
    z: -4,
    length: 22.5,
    width: 5.2,
    rotation: 0.548,
    style: 'stone',
    deckOffset: 1.0,
  },
  {
    id: 'east-wood-bridge',
    name: 'мост через чащу',
    x: 40,
    z: -30.7,
    length: 19.2,
    width: 3.4,
    rotation: 0.526,
    style: 'wood',
    deckOffset: 0.8,
  },
]

export const WORLD_STRUCTURES: readonly WorldStructure[] = [
  { id: 'abbey', name: 'аббатство безмолвия', kind: 'abbey', x: -49, z: -15, rotation: 0.08, width: 24, depth: 19, height: 11 },
  { id: 'forest-shrine', name: 'святилище чащи', kind: 'forest-shrine', x: 54, z: 27, rotation: -0.18, width: 17, depth: 15, height: 10 },
  { id: 'highland-fort', name: 'крепость перевала', kind: 'highland-fort', x: 38, z: -55, rotation: 0.22, width: 22, depth: 17, height: 12 },
  { id: 'north-chapel', name: 'северная часовня', kind: 'chapel', x: -10, z: 61, rotation: -0.05, width: 13, depth: 15, height: 8 },
]

export const TOWN_BUILDINGS: readonly TownBuilding[] = [
  { id: 'grey-boar-inn', name: 'трактир «Серый вепрь»', kind: 'inn', x: -38, z: 95, rotation: 0, width: 10, depth: 8 },
  { id: 'town-smithy', name: 'кузница', kind: 'smithy', x: -12, z: 95, rotation: 0, width: 9, depth: 8 },
  { id: 'north-house', name: 'дом гончара', kind: 'house', x: -38, z: 112, rotation: 0, width: 9, depth: 8 },
  { id: 'east-house', name: 'дом старосты', kind: 'house', x: -12, z: 112, rotation: 0, width: 9, depth: 8 },
  { id: 'town-hall', name: 'ратуша', kind: 'hall', x: -25, z: 118, rotation: 0, width: 13, depth: 9 },
]

export const TOWN_FIELDS: readonly TownField[] = [
  { id: 'west-grain-fields', x: -70, z: 104, width: 30, depth: 38, rotation: -0.16, crop: 'grain' },
  { id: 'east-rye-fields', x: 18, z: 105, width: 32, depth: 40, rotation: 0.12, crop: 'rye' },
  { id: 'south-garden', x: -25, z: 71, width: 22, depth: 12, rotation: 0, crop: 'rye' },
]

export function townBuildingDoor(building: TownBuilding): WorldPoint {
  const localZ = -building.depth * 0.5 - 1.35
  const c = Math.cos(building.rotation)
  const s = Math.sin(building.rotation)
  return [building.x + s * localZ, building.z + c * localZ]
}

export const WORLD_FIRES: readonly WorldFire[] = [
  { x: -28.5, z: 87, strength: 0.8, radius: 10 },
  { x: -21.5, z: 103, strength: 0.8, radius: 12 },
  { x: -48, z: -10, strength: 1, radius: 10 },
  { x: -54, z: -21, strength: 0.85, radius: 8 },
  { x: 53, z: 26, strength: 0.9, radius: 9 },
  { x: -9, z: 55, strength: 0.7, radius: 7 },
  { x: 36, z: -52, strength: 0.82, radius: 8 },
  { x: 5.6, z: 5.2, strength: 0.55, radius: 7 },
]

export function riverCenterZ(x: number): number {
  return -x * 0.58 - 5.5 + Math.sin(x * 0.11) * 1.65 + Math.cos(x * 0.05) * 1.1
}

export function riverSignedDistance(x: number, z: number): number {
  return (z - riverCenterZ(x)) * 0.86
}

export function isInsideRiver(x: number, z: number): boolean {
  return Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

function radialInfluence(x: number, z: number, cx: number, cz: number, radius: number): number {
  const d = Math.hypot(x - cx, z - cz)
  const t = clamp01(1 - d / radius)
  return t * t * (3 - 2 * t)
}

function pointSegmentDistance(x: number, z: number, a: WorldPoint, b: WorldPoint): number {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const wx = x - a[0]
  const wz = z - a[1]
  const len2 = vx * vx + vz * vz
  if (len2 < 0.00001) return Math.hypot(wx, wz)
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / len2))
  return Math.hypot(x - (a[0] + vx * t), z - (a[1] + vz * t))
}

export function roadDistanceAt(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY
  for (const road of WORLD_ROADS) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const distance = pointSegmentDistance(x, z, road.points[index]!, road.points[index + 1]!) - road.width * 0.5
      best = Math.min(best, distance)
    }
  }
  return best
}

export function isOnRoad(x: number, z: number, padding = 0): boolean {
  return roadDistanceAt(x, z) < padding
}

export function terrainHeightAt(x: number, z: number): number {
  const macro =
    Math.sin(x * 0.052) * 0.26 +
    Math.cos(z * 0.041) * 0.31 +
    Math.sin((x + z) * 0.027) * 0.24 +
    Math.cos((x - z) * 0.019) * 0.16

  const riverDistance = Math.abs(riverSignedDistance(x, z))
  const bankBlend = clamp01((riverDistance - RIVER_HALF_WIDTH + 0.5) / 9)
  let height = macro * bankBlend

  height += radialInfluence(x, z, 36, -52, 40) * 3.9
  height += radialInfluence(x, z, -53, 48, 32) * 1.25
  height += radialInfluence(x, z, -49, -15, 26) * 0.46
  height -= radialInfluence(x, z, 53, 26, 25) * 0.34
  height += radialInfluence(x, z, 68, -49, 22) * 0.9
  height -= radialInfluence(x, z, -70, 22, 20) * 0.3

  const townDistance = Math.max(Math.abs(x - TOWN_CENTER.x) - 25, Math.abs(z - TOWN_CENTER.z) - 23)
  const townBlend = 1 - clamp01(townDistance / 8)
  height = height * (1 - townBlend) + 0.06 * townBlend

  const roadDistance = roadDistanceAt(x, z)
  if (roadDistance < 1.8 && riverDistance > RIVER_HALF_WIDTH + 1) {
    height -= (1 - clamp01(roadDistance / 1.8)) * 0.09
  }
  if (riverDistance < RIVER_HALF_WIDTH + 1.2) height -= 0.2
  return height
}

export function bridgeDeckHeightAt(x: number, z: number): number | null {
  for (const bridge of WORLD_BRIDGES) {
    const dx = x - bridge.x
    const dz = z - bridge.z
    const c = Math.cos(bridge.rotation)
    const s = Math.sin(bridge.rotation)
    const localX = c * dx - s * dz
    const localZ = s * dx + c * dz
    if (Math.abs(localX) <= bridge.width * 0.52 && Math.abs(localZ) <= bridge.length * 0.53) {
      return terrainHeightAt(bridge.x, bridge.z) + bridge.deckOffset
    }
  }
  return null
}

export function walkHeightAt(x: number, z: number): number {
  return bridgeDeckHeightAt(x, z) ?? terrainHeightAt(x, z)
}

export function zoneAt(x: number, z: number): WorldZone {
  if (Math.hypot(x - TOWN_CENTER.x, z - TOWN_CENTER.z) <= 34) return WORLD_ZONES.find((zone) => zone.id === 'town')!
  if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 5.5) return WORLD_ZONES[0]!

  let best: WorldZone | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (let index = 1; index < WORLD_ZONES.length; index += 1) {
    const zone = WORLD_ZONES[index]!
    const score = Math.hypot(x - zone.x, z - zone.z) / zone.radius
    if (score < bestScore) {
      bestScore = score
      best = zone
    }
  }

  return best && bestScore <= 1.18 ? best : WILDS_ZONE
}

function insideStructure(x: number, z: number, padding: number): boolean {
  for (const structure of WORLD_STRUCTURES) {
    const dx = x - structure.x
    const dz = z - structure.z
    const c = Math.cos(structure.rotation)
    const s = Math.sin(structure.rotation)
    const lx = c * dx - s * dz
    const lz = s * dx + c * dz
    if (Math.abs(lx) < structure.width * 0.6 + padding && Math.abs(lz) < structure.depth * 0.6 + padding) return true
  }
  return false
}

export function createWorldLandmarks(): WorldLandmark[] {
  const landmarks: WorldLandmark[] = [
    { kind: 'monolith', x: -9, z: 4, radius: 1.1, height: 5.1, rotation: 0.08 },
    { kind: 'monolith', x: -9, z: -16, radius: 1.0, height: 4.8, rotation: -0.1 },
    { kind: 'rock', x: -16, z: -7, radius: 2.5, height: 1.7, rotation: 0.4 },
    { kind: 'rock', x: 13, z: -14, radius: 2.7, height: 1.9, rotation: 1.1 },
    { kind: 'rock', x: -4, z: 8, radius: 1.6, height: 1.15, rotation: 0.2 },

    { kind: 'monolith', x: -61, z: -4, radius: 1.2, height: 5.6, rotation: -0.2 },
    { kind: 'rock', x: -68, z: -25, radius: 2.8, height: 1.9, rotation: 0.8 },
    { kind: 'rock', x: -28, z: -29, radius: 2.5, height: 1.7, rotation: 1.2 },

    { kind: 'monolith', x: 27, z: -64, radius: 1.1, height: 5.0, rotation: 0.1 },
    { kind: 'monolith', x: 57, z: -40, radius: 1.0, height: 4.6, rotation: -0.25 },
    { kind: 'rock', x: 18, z: -60, radius: 2.8, height: 2.0, rotation: 0.5 },
    { kind: 'rock', x: 60, z: -48, radius: 3.2, height: 2.4, rotation: 1.4 },

    { kind: 'monolith', x: -29, z: 67, radius: 0.95, height: 4.1, rotation: 0.15 },
    { kind: 'rock', x: -24, z: 45, radius: 1.8, height: 1.2, rotation: 0.2 },
    { kind: 'rock', x: 8, z: 58, radius: 1.5, height: 1.0, rotation: 1.0 },

    { kind: 'monolith', x: 67, z: 18, radius: 0.9, height: 4.0, rotation: -0.2 },
    { kind: 'rock', x: 70, z: 36, radius: 2.5, height: 1.6, rotation: 0.4 },
    { kind: 'rock', x: 32, z: 16, radius: 2.0, height: 1.4, rotation: 1.1 },
  ]

  let seed = 0x5e71c411
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }

  const addTrees = (
    cx: number,
    cz: number,
    count: number,
    radiusX: number,
    radiusZ: number,
    inner: number,
    minSpacing: number,
  ): void => {
    let made = 0
    let attempts = 0
    while (made < count && attempts < count * 28) {
      attempts += 1
      const angle = random() * Math.PI * 2
      const r = Math.sqrt(random())
      const x = cx + Math.cos(angle) * radiusX * r
      const z = cz + Math.sin(angle) * radiusZ * r
      if (Math.hypot(x - cx, z - cz) < inner) continue
      if (Math.abs(x) > WORLD_LIMIT - 4 || Math.abs(z) > WORLD_LIMIT - 4) continue
      if (z > 62 && z < 132 && x > -90 && x < 42) continue
      if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 2.8) continue
      if (roadDistanceAt(x, z) < 2.8) continue
      if (insideStructure(x, z, 2.5)) continue

      let tooClose = false
      for (const item of landmarks) {
        if (item.kind !== 'tree') continue
        if (Math.hypot(x - item.x, z - item.z) < minSpacing) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue

      const radius = 0.65 + random() * 0.42
      const height = 6.0 + random() * 5.4
      landmarks.push({ kind: 'tree', x, z, radius, height, rotation: random() * Math.PI * 2 })
      made += 1
    }
  }

  addTrees(52, 27, 126, 34, 35, 8, 2.05)
  addTrees(69, 5, 34, 20, 25, 4, 2.2)
  addTrees(-10, 55, 48, 39, 29, 18, 3.0)
  addTrees(-49, -15, 32, 35, 28, 16, 2.8)
  addTrees(37, -54, 28, 38, 28, 17, 3.0)
  addTrees(-71, 30, 20, 20, 24, 5, 2.6)

  addTrees(-106, 96, 42, 22, 32, 5, 3)
  addTrees(75, 101, 52, 30, 29, 6, 3)
  addTrees(-103, -65, 32, 23, 35, 5, 3)

  return landmarks
}
