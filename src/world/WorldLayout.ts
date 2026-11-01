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
  id: 'river' | 'ruins' | 'meadow' | 'forest' | 'highland' | 'wilds'
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

export const WORLD_LIMIT = 92
export const RIVER_HALF_WIDTH = 6.8

export const WORLD_ZONES: readonly WorldZone[] = [
  { id: 'river', name: 'речная низина', x: 0, z: -4, radius: 28 },
  { id: 'ruins', name: 'западные руины', x: -45, z: -15, radius: 29 },
  { id: 'meadow', name: 'северный луг', x: -10, z: 50, radius: 32 },
  { id: 'forest', name: 'тёмная чаща', x: 48, z: 24, radius: 34 },
  { id: 'highland', name: 'каменная возвышенность', x: 35, z: -50, radius: 33 },
]

export const WORLD_ROADS: readonly WorldRoad[] = [
  {
    id: 'old-road',
    name: 'старая дорога',
    width: 2.8,
    points: [
      [-76, -16], [-60, -15], [-46, -13], [-30, -13], [-16, -12], [-5.5, -13],
      [5.5, 5], [20, 10], [36, 18], [52, 26], [70, 34],
    ],
  },
  {
    id: 'north-road',
    name: 'северный тракт',
    width: 2.35,
    points: [[5.5, 5], [0, 20], [-6, 36], [-10, 52], [-12, 70], [-8, 84]],
  },
  {
    id: 'highland-road',
    name: 'каменный подъём',
    width: 2.15,
    points: [[-5.5, -13], [8, -22], [20, -33], [32, -45], [40, -57], [55, -70]],
  },
  {
    id: 'east-road',
    name: 'лесная дорога',
    width: 2.15,
    points: [[52, 26], [49, 8], [46, -8], [44.5, -22.9], [35.5, -38.5], [35, -50]],
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
    name: 'старый каменный мост',
    x: 0,
    z: -4,
    length: 21.2,
    width: 4.2,
    rotation: 0.548,
    style: 'stone',
    deckOffset: 0.92,
  },
  {
    id: 'east-wood-bridge',
    name: 'лесной мост',
    x: 40,
    z: -30.7,
    length: 18.2,
    width: 2.9,
    rotation: 0.526,
    style: 'wood',
    deckOffset: 0.76,
  },
]

export const WORLD_FIRES: readonly WorldFire[] = [
  { x: -49, z: -10, strength: 1, radius: 9 },
  { x: -55, z: -21, strength: 0.9, radius: 8 },
  { x: -36, z: -17, strength: 0.72, radius: 7 },
  { x: 50, z: 25, strength: 0.86, radius: 8 },
  { x: -9, z: 49, strength: 0.72, radius: 7 },
  { x: 5.8, z: 5.4, strength: 0.62, radius: 7 },
  { x: 36, z: -52, strength: 0.82, radius: 8 },
  { x: 45, z: -22, strength: 0.58, radius: 6 },
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
    for (let i = 0; i < road.points.length - 1; i += 1) {
      const distance = pointSegmentDistance(x, z, road.points[i]!, road.points[i + 1]!) - road.width * 0.5
      if (distance < best) best = distance
    }
  }
  return best
}

export function isOnRoad(x: number, z: number, padding = 0): boolean {
  return roadDistanceAt(x, z) < padding
}

export function terrainHeightAt(x: number, z: number): number {
  const macro =
    Math.sin(x * 0.052) * 0.34 +
    Math.cos(z * 0.041) * 0.42 +
    Math.sin((x + z) * 0.027) * 0.32 +
    Math.cos((x - z) * 0.019) * 0.22 +
    Math.sin(x * 0.12 + z * 0.08) * 0.08

  const riverDistance = Math.abs(riverSignedDistance(x, z))
  const bankBlend = clamp01((riverDistance - RIVER_HALF_WIDTH + 0.5) / 9)
  let height = macro * bankBlend

  height += radialInfluence(x, z, 35, -50, 38) * 3.7
  height += radialInfluence(x, z, -53, 47, 31) * 1.45
  height += radialInfluence(x, z, -44, -15, 22) * 0.55
  height -= radialInfluence(x, z, 53, 26, 24) * 0.38
  height += radialInfluence(x, z, 67, -48, 22) * 1.1
  height -= radialInfluence(x, z, -70, 20, 20) * 0.42

  const roadDistance = roadDistanceAt(x, z)
  if (roadDistance < 1.4 && riverDistance > RIVER_HALF_WIDTH + 1) height -= (1 - clamp01(roadDistance / 1.4)) * 0.08
  if (riverDistance < RIVER_HALF_WIDTH + 1.2) height -= 0.18
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
  if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 5.5) return WORLD_ZONES[0]!

  let best: WorldZone | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (let i = 1; i < WORLD_ZONES.length; i += 1) {
    const zone = WORLD_ZONES[i]!
    const score = Math.hypot(x - zone.x, z - zone.z) / zone.radius
    if (score < bestScore) {
      bestScore = score
      best = zone
    }
  }

  if (best && bestScore <= 1.18) return best
  return { id: 'wilds', name: 'дикие земли', x, z, radius: 1 }
}

export function createWorldLandmarks(): WorldLandmark[] {
  const landmarks: WorldLandmark[] = [
    // Spawn valley and bridgeheads.
    { kind: 'monolith', x: -8.5, z: 4.2, radius: 1.05, height: 4.8 },
    { kind: 'rock', x: -3.8, z: 6.8, radius: 1.35, height: 1.15 },
    { kind: 'rock', x: 3.8, z: 8.2, radius: 1.1, height: 0.95 },
    { kind: 'gate', x: 7.2, z: 7.3, radius: 2.0, height: 4.0, rotation: 0.55 },
    { kind: 'monolith', x: -8.5, z: -15.6, radius: 1, height: 4.5 },
    { kind: 'rock', x: -15.5, z: -7.2, radius: 2.1, height: 1.6 },
    { kind: 'rock', x: 12.5, z: -13.8, radius: 2.4, height: 1.7 },

    // Western ruin complex: towers, open gates, courtyards and collapsed walls.
    { kind: 'tower', x: -58, z: -16, radius: 2.8, height: 8.2, rotation: 0.08 },
    { kind: 'tower', x: -35, z: -19, radius: 2.5, height: 7.1, rotation: -0.18 },
    { kind: 'gate', x: -47, z: -7, radius: 3.2, height: 5.2, rotation: 0.1 },
    { kind: 'gate', x: -47, z: -25, radius: 2.6, height: 4.5, rotation: 1.45 },
    { kind: 'monolith', x: -46, z: -15, radius: 1.35, height: 6.2, rotation: 0.18 },
    { kind: 'monolith', x: -53, z: -9, radius: 1.05, height: 4.9, rotation: -0.12 },
    { kind: 'monolith', x: -38, z: -22, radius: 0.92, height: 4.2, rotation: 0.3 },
    { kind: 'ruin', x: -45, z: -3, radius: 2.3, height: 3.1, rotation: 0.05 },
    { kind: 'ruin', x: -55, z: -23, radius: 2.8, height: 2.8, rotation: 1.4 },
    { kind: 'ruin', x: -34, z: -11, radius: 2.6, height: 3.4, rotation: 0.72 },
    { kind: 'ruin', x: -49, z: -31, radius: 3.2, height: 2.9, rotation: -0.45 },
    { kind: 'ruin', x: -41, z: -26, radius: 2.1, height: 3.8, rotation: 0.14 },
    { kind: 'ruin', x: -60, z: -7, radius: 2.0, height: 3.0, rotation: 1.1 },
    { kind: 'rock', x: -64, z: -25, radius: 1.6, height: 1.2 },
    { kind: 'rock', x: -29, z: -4, radius: 1.4, height: 1.1 },

    // Highland: standing stones, fractured ridges and a ruined pass.
    { kind: 'tower', x: 42, z: -58, radius: 2.2, height: 6.6, rotation: 0.17 },
    { kind: 'gate', x: 31, z: -45, radius: 2.5, height: 4.7, rotation: 0.42 },
    { kind: 'monolith', x: 35, z: -50, radius: 1.4, height: 7.1, rotation: 0.2 },
    { kind: 'monolith', x: 50, z: -58, radius: 1.05, height: 5.3, rotation: -0.15 },
    { kind: 'monolith', x: 27, z: -62, radius: 0.82, height: 4.6, rotation: 0.1 },
    { kind: 'monolith', x: 57, z: -39, radius: 0.9, height: 4.2, rotation: -0.3 },
    { kind: 'rock', x: 25, z: -42, radius: 3.1, height: 2.2 },
    { kind: 'rock', x: 47, z: -40, radius: 2.7, height: 2.5 },
    { kind: 'rock', x: 18, z: -60, radius: 2.2, height: 1.8 },
    { kind: 'rock', x: 58, z: -48, radius: 3.5, height: 2.7 },
    { kind: 'rock', x: 41, z: -70, radius: 2.8, height: 2.2 },

    // Meadow: open ritual field with an old chapel/gate as a distant silhouette.
    { kind: 'gate', x: -11, z: 61, radius: 2.6, height: 4.5, rotation: -0.08 },
    { kind: 'ruin', x: -17, z: 57, radius: 2.0, height: 2.8, rotation: 0.5 },
    { kind: 'rock', x: -22, z: 46, radius: 1.4, height: 1 },
    { kind: 'rock', x: -1, z: 64, radius: 1.7, height: 1.2 },
    { kind: 'monolith', x: -29, z: 65, radius: 0.9, height: 3.8 },
    { kind: 'monolith', x: 5, z: 43, radius: 0.72, height: 3.2 },
    { kind: 'rock', x: -20, z: 70, radius: 1.2, height: 0.9 },
    { kind: 'rock', x: 9, z: 57, radius: 1.1, height: 0.85 },

    // Forest shrine: dense ruins behind trunks, like the reference clips.
    { kind: 'tower', x: 57, z: 31, radius: 2.2, height: 7.4, rotation: -0.08 },
    { kind: 'gate', x: 46, z: 24, radius: 2.7, height: 4.9, rotation: 0.55 },
    { kind: 'monolith', x: 51, z: 26, radius: 0.95, height: 4.7, rotation: 0.15 },
    { kind: 'monolith', x: 62, z: 18, radius: 0.72, height: 3.5, rotation: -0.2 },
    { kind: 'ruin', x: 42, z: 34, radius: 2.3, height: 3.2, rotation: 0.55 },
    { kind: 'ruin', x: 64, z: 23, radius: 2.0, height: 2.8, rotation: -0.3 },
    { kind: 'rock', x: 67, z: 34, radius: 2.2, height: 1.4 },
    { kind: 'rock', x: 34, z: 17, radius: 1.8, height: 1.3 },
  ]

  let seed = 0x71c4a55
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
    inner = 0,
    minSpacing = 2.2,
  ): void => {
    let made = 0
    let attempts = 0
    while (made < count && attempts < count * 22) {
      attempts += 1
      const angle = random() * Math.PI * 2
      const r = Math.sqrt(random())
      const x = cx + Math.cos(angle) * radiusX * r
      const z = cz + Math.sin(angle) * radiusZ * r
      if (Math.hypot(x - cx, z - cz) < inner) continue
      if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 2.5) continue
      if (roadDistanceAt(x, z) < 2.2) continue

      let tooClose = false
      for (const item of landmarks) {
        if (item.kind !== 'tree') continue
        if (Math.hypot(x - item.x, z - item.z) < minSpacing) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue

      const radius = 0.58 + random() * 0.42
      const height = 5.3 + random() * 5.1
      landmarks.push({ kind: 'tree', x, z, radius, height, rotation: random() * Math.PI * 2 })
      made += 1
    }
  }

  const addRockField = (cx: number, cz: number, count: number, span: number, minR: number, maxR: number): void => {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2
      const r = Math.sqrt(random()) * span
      const x = cx + Math.cos(angle) * r
      const z = cz + Math.sin(angle) * r
      if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 1.2) continue
      if (roadDistanceAt(x, z) < 1.3) continue
      const radius = minR + random() * (maxR - minR)
      landmarks.push({
        kind: 'rock',
        x,
        z,
        radius,
        height: 0.55 + radius * (0.55 + random() * 0.35),
        rotation: random() * Math.PI * 2,
      })
    }
  }

  // Dense masses with deliberate road corridors.
  addTrees(50, 26, 112, 33, 34, 5, 1.82)
  addTrees(62, 8, 42, 23, 27, 3, 1.95)
  addTrees(-10, 53, 52, 38, 27, 15, 2.65)
  addTrees(-48, -14, 42, 33, 26, 8, 2.45)
  addTrees(33, -52, 34, 36, 26, 10, 2.7)
  addTrees(-72, 29, 25, 19, 23, 3, 2.25)
  addTrees(74, -4, 24, 18, 25, 3, 2.25)

  addRockField(35, -50, 34, 31, 0.65, 2.8)
  addRockField(-45, -15, 21, 28, 0.55, 1.8)
  addRockField(-8, 52, 14, 31, 0.45, 1.3)
  addRockField(51, 24, 18, 29, 0.55, 1.55)

  // Roadside punctuation: small stone groups make travel read as authored rather than procedural.
  for (const road of WORLD_ROADS) {
    for (let i = 1; i < road.points.length - 1; i += 1) {
      const [x, z] = road.points[i]!
      const side = i % 2 === 0 ? 1 : -1
      landmarks.push({ kind: 'rock', x: x + side * (road.width + 1.5), z: z + (i % 3 - 1) * 1.6, radius: 0.5 + (i % 3) * 0.18, height: 0.7 + (i % 2) * 0.35 })
    }
  }

  // Wild-space punctuation so travel never becomes an empty square.
  for (let i = 0; i < 42; i += 1) {
    const angle = random() * Math.PI * 2
    const distance = 32 + random() * 53
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 2.4) continue
    if (roadDistanceAt(x, z) < 1.7) continue
    landmarks.push({
      kind: i % 13 === 0 ? 'monolith' : 'rock',
      x,
      z,
      radius: 0.55 + random() * 1.25,
      height: i % 13 === 0 ? 2.9 + random() * 2.2 : 0.65 + random() * 1.35,
      rotation: random() * Math.PI * 2,
    })
  }

  return landmarks
}
