export type LandmarkKind = 'monolith' | 'rock' | 'tree' | 'ruin'

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

export const WORLD_LIMIT = 92
export const RIVER_HALF_WIDTH = 6.8

export const WORLD_ZONES: readonly WorldZone[] = [
  { id: 'river', name: 'речная низина', x: 0, z: -4, radius: 28 },
  { id: 'ruins', name: 'западные руины', x: -45, z: -15, radius: 27 },
  { id: 'meadow', name: 'северный луг', x: -10, z: 50, radius: 30 },
  { id: 'forest', name: 'тёмная чаща', x: 48, z: 24, radius: 31 },
  { id: 'highland', name: 'каменная возвышенность', x: 35, z: -50, radius: 31 },
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

export function terrainHeightAt(x: number, z: number): number {
  const macro =
    Math.sin(x * 0.052) * 0.34 +
    Math.cos(z * 0.041) * 0.42 +
    Math.sin((x + z) * 0.027) * 0.32 +
    Math.cos((x - z) * 0.019) * 0.22

  const riverDistance = Math.abs(riverSignedDistance(x, z))
  const bankBlend = clamp01((riverDistance - RIVER_HALF_WIDTH + 0.5) / 9)
  let height = macro * bankBlend

  height += radialInfluence(x, z, 35, -50, 38) * 3.7
  height += radialInfluence(x, z, -53, 47, 31) * 1.45
  height += radialInfluence(x, z, -44, -15, 22) * 0.55
  height -= radialInfluence(x, z, 53, 26, 24) * 0.38

  if (riverDistance < RIVER_HALF_WIDTH + 1.2) height -= 0.18
  return height
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
    { kind: 'monolith', x: -5.4, z: 3.4, radius: 1.05, height: 4.8 },
    { kind: 'rock', x: -1.8, z: 6.1, radius: 1.35, height: 1.15 },
    { kind: 'rock', x: 2.2, z: 6.4, radius: 1.1, height: 0.95 },
    { kind: 'rock', x: 5.8, z: 1.2, radius: 2.5, height: 1.65 },
    { kind: 'monolith', x: -7.8, z: -8.5, radius: 1, height: 4.5 },
    { kind: 'rock', x: -14.5, z: -3.2, radius: 2.1, height: 1.6 },
    { kind: 'monolith', x: 3.5, z: -13.5, radius: 1.1, height: 4.4 },
    { kind: 'rock', x: -11, z: 9.2, radius: 1.9, height: 1.4 },
    { kind: 'rock', x: 10.5, z: -6.8, radius: 2.4, height: 1.7 },

    { kind: 'monolith', x: -46, z: -15, radius: 1.35, height: 6.2, rotation: 0.18 },
    { kind: 'monolith', x: -53, z: -9, radius: 1.05, height: 4.9, rotation: -0.12 },
    { kind: 'monolith', x: -38, z: -22, radius: 0.92, height: 4.2, rotation: 0.3 },
    { kind: 'ruin', x: -45, z: -5, radius: 2.3, height: 2.6, rotation: 0.05 },
    { kind: 'ruin', x: -55, z: -20, radius: 2.8, height: 2.2, rotation: 1.4 },
    { kind: 'ruin', x: -35, z: -12, radius: 2.6, height: 2.9, rotation: 0.72 },
    { kind: 'ruin', x: -48, z: -28, radius: 3.2, height: 2.4, rotation: -0.45 },
    { kind: 'rock', x: -59, z: -3, radius: 2.4, height: 1.7 },
    { kind: 'rock', x: -31, z: -27, radius: 2.1, height: 1.4 },

    { kind: 'monolith', x: 35, z: -50, radius: 1.4, height: 7.1, rotation: 0.2 },
    { kind: 'monolith', x: 48, z: -56, radius: 1.05, height: 5.3, rotation: -0.15 },
    { kind: 'rock', x: 27, z: -42, radius: 3.1, height: 2.2 },
    { kind: 'rock', x: 44, z: -39, radius: 2.7, height: 2.5 },
    { kind: 'rock', x: 19, z: -59, radius: 2.2, height: 1.8 },
    { kind: 'rock', x: 55, z: -46, radius: 3.5, height: 2.7 },

    { kind: 'rock', x: -18, z: 46, radius: 1.4, height: 1.0 },
    { kind: 'rock', x: -2, z: 60, radius: 1.7, height: 1.2 },
    { kind: 'monolith', x: -28, z: 62, radius: 0.9, height: 3.8 },
  ]

  let seed = 0x71c4a55
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }

  const addTrees = (cx: number, cz: number, count: number, radiusX: number, radiusZ: number, inner = 0): void => {
    let made = 0
    let attempts = 0
    while (made < count && attempts < count * 8) {
      attempts += 1
      const angle = random() * Math.PI * 2
      const r = Math.sqrt(random())
      const x = cx + Math.cos(angle) * radiusX * r
      const z = cz + Math.sin(angle) * radiusZ * r
      if (Math.hypot(x - cx, z - cz) < inner) continue
      if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 3.5) continue
      const radius = 0.5 + random() * 0.42
      const height = 4.6 + random() * 4.8
      landmarks.push({ kind: 'tree', x, z, radius, height, rotation: random() * Math.PI * 2 })
      made += 1
    }
  }

  addTrees(49, 24, 58, 30, 31, 5)
  addTrees(-10, 51, 22, 35, 24, 17)
  addTrees(-48, -14, 20, 30, 24, 10)
  addTrees(32, -50, 16, 34, 24, 13)

  for (let i = 0; i < 26; i += 1) {
    const angle = random() * Math.PI * 2
    const distance = 34 + random() * 48
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 3) continue
    landmarks.push({
      kind: 'rock',
      x,
      z,
      radius: 0.55 + random() * 1.25,
      height: 0.65 + random() * 1.35,
      rotation: random() * Math.PI * 2,
    })
  }

  return landmarks
}
