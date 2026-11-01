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
  { id: 'ruins', name: 'западные руины', x: -45, z: -15, radius: 29 },
  { id: 'meadow', name: 'северный луг', x: -10, z: 50, radius: 32 },
  { id: 'forest', name: 'тёмная чаща', x: 48, z: 24, radius: 34 },
  { id: 'highland', name: 'каменная возвышенность', x: 35, z: -50, radius: 33 },
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
    // River test core: immediately readable silhouettes near spawn.
    { kind: 'monolith', x: -5.4, z: 3.4, radius: 1.05, height: 4.8 },
    { kind: 'rock', x: -1.8, z: 6.1, radius: 1.35, height: 1.15 },
    { kind: 'rock', x: 2.2, z: 6.4, radius: 1.1, height: 0.95 },
    { kind: 'rock', x: 5.8, z: 1.2, radius: 2.5, height: 1.65 },
    { kind: 'monolith', x: -7.8, z: -8.5, radius: 1, height: 4.5 },
    { kind: 'rock', x: -14.5, z: -3.2, radius: 2.1, height: 1.6 },
    { kind: 'monolith', x: 3.5, z: -13.5, radius: 1.1, height: 4.4 },
    { kind: 'rock', x: -11, z: 9.2, radius: 1.9, height: 1.4 },
    { kind: 'rock', x: 10.5, z: -6.8, radius: 2.4, height: 1.7 },

    // Western ruin complex: broken courtyard, gateway, collapsed outer wall.
    { kind: 'monolith', x: -46, z: -15, radius: 1.35, height: 6.2, rotation: 0.18 },
    { kind: 'monolith', x: -53, z: -9, radius: 1.05, height: 4.9, rotation: -0.12 },
    { kind: 'monolith', x: -38, z: -22, radius: 0.92, height: 4.2, rotation: 0.3 },
    { kind: 'ruin', x: -45, z: -5, radius: 2.3, height: 2.6, rotation: 0.05 },
    { kind: 'ruin', x: -55, z: -20, radius: 2.8, height: 2.2, rotation: 1.4 },
    { kind: 'ruin', x: -35, z: -12, radius: 2.6, height: 2.9, rotation: 0.72 },
    { kind: 'ruin', x: -48, z: -28, radius: 3.2, height: 2.4, rotation: -0.45 },
    { kind: 'ruin', x: -41, z: -25, radius: 2.1, height: 3.5, rotation: 0.14 },
    { kind: 'ruin', x: -57, z: -11, radius: 2.0, height: 3.0, rotation: 1.1 },
    { kind: 'ruin', x: -33, z: -19, radius: 1.8, height: 2.5, rotation: -0.35 },
    { kind: 'ruin', x: -46, z: 1, radius: 1.7, height: 2.1, rotation: 0.12 },
    { kind: 'rock', x: -59, z: -3, radius: 2.4, height: 1.7 },
    { kind: 'rock', x: -31, z: -27, radius: 2.1, height: 1.4 },
    { kind: 'rock', x: -61, z: -25, radius: 1.6, height: 1.2 },
    { kind: 'rock', x: -30, z: -4, radius: 1.4, height: 1.1 },

    // Highland: a readable skyline of standing stones and fractured ridges.
    { kind: 'monolith', x: 35, z: -50, radius: 1.4, height: 7.1, rotation: 0.2 },
    { kind: 'monolith', x: 48, z: -56, radius: 1.05, height: 5.3, rotation: -0.15 },
    { kind: 'monolith', x: 28, z: -61, radius: 0.82, height: 4.6, rotation: 0.1 },
    { kind: 'monolith', x: 56, z: -38, radius: 0.9, height: 4.2, rotation: -0.3 },
    { kind: 'rock', x: 27, z: -42, radius: 3.1, height: 2.2 },
    { kind: 'rock', x: 44, z: -39, radius: 2.7, height: 2.5 },
    { kind: 'rock', x: 19, z: -59, radius: 2.2, height: 1.8 },
    { kind: 'rock', x: 55, z: -46, radius: 3.5, height: 2.7 },
    { kind: 'rock', x: 41, z: -67, radius: 2.8, height: 2.2 },
    { kind: 'rock', x: 64, z: -54, radius: 2.4, height: 1.8 },

    // Meadow landmarks: sparse stones arranged as a loose ritual circle.
    { kind: 'rock', x: -18, z: 46, radius: 1.4, height: 1 },
    { kind: 'rock', x: -2, z: 60, radius: 1.7, height: 1.2 },
    { kind: 'monolith', x: -28, z: 62, radius: 0.9, height: 3.8 },
    { kind: 'monolith', x: 5, z: 43, radius: 0.72, height: 3.2 },
    { kind: 'rock', x: -20, z: 66, radius: 1.2, height: 0.9 },
    { kind: 'rock', x: 8, z: 57, radius: 1.1, height: 0.85 },

    // Forest shrine and deep-wood anchors.
    { kind: 'monolith', x: 51, z: 26, radius: 0.95, height: 4.7, rotation: 0.15 },
    { kind: 'monolith', x: 58, z: 19, radius: 0.72, height: 3.5, rotation: -0.2 },
    { kind: 'ruin', x: 44, z: 31, radius: 1.7, height: 2.4, rotation: 0.55 },
    { kind: 'rock', x: 64, z: 30, radius: 2.2, height: 1.4 },
    { kind: 'rock', x: 35, z: 19, radius: 1.8, height: 1.3 },
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
    while (made < count && attempts < count * 18) {
      attempts += 1
      const angle = random() * Math.PI * 2
      const r = Math.sqrt(random())
      const x = cx + Math.cos(angle) * radiusX * r
      const z = cz + Math.sin(angle) * radiusZ * r
      if (Math.hypot(x - cx, z - cz) < inner) continue
      if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 3.2) continue

      let tooClose = false
      for (const item of landmarks) {
        if (item.kind !== 'tree') continue
        if (Math.hypot(x - item.x, z - item.z) < minSpacing) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue

      const radius = 0.58 + random() * 0.38
      const height = 5.4 + random() * 4.6
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

  // Dense forest, readable meadow rim, overgrown ruins and sparse highland pines.
  addTrees(49, 24, 82, 31, 32, 6, 2.05)
  addTrees(-10, 51, 34, 36, 25, 16, 3.0)
  addTrees(-48, -14, 28, 31, 25, 9, 2.8)
  addTrees(32, -50, 24, 35, 25, 12, 3.1)
  addTrees(-70, 28, 18, 18, 22, 4, 2.5)
  addTrees(72, -5, 16, 17, 24, 3, 2.5)

  addRockField(35, -50, 24, 30, 0.65, 2.6)
  addRockField(-45, -15, 15, 26, 0.55, 1.7)
  addRockField(-8, 52, 10, 30, 0.45, 1.2)
  addRockField(51, 24, 12, 27, 0.55, 1.45)

  // Wild-space punctuation so travel between named zones is never a blank walk.
  for (let i = 0; i < 34; i += 1) {
    const angle = random() * Math.PI * 2
    const distance = 33 + random() * 51
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (Math.abs(riverSignedDistance(x, z)) < RIVER_HALF_WIDTH + 2.4) continue
    landmarks.push({
      kind: i % 11 === 0 ? 'monolith' : 'rock',
      x,
      z,
      radius: 0.55 + random() * 1.25,
      height: i % 11 === 0 ? 2.9 + random() * 2.2 : 0.65 + random() * 1.35,
      rotation: random() * Math.PI * 2,
    })
  }

  return landmarks
}
