export type HouseObjectId = 'radio' | 'television' | 'note' | 'door' | 'lamp'
export type HouseBox = { x: number; z: number; width: number; depth: number; height: number }
export type HouseFurniture = HouseBox & { kind: 'bed' | 'sofa' | 'table' | 'cabinet' | 'fridge' | 'sink' | 'wardrobe' | 'chair' }

export const HOUSE_SPAWN = { x: -4.5, z: 4.8 }
export const HOUSE_WALLS: readonly HouseBox[] = [
  { x: -6.5, z: 0, width: 0.22, depth: 13, height: 2.9 },
  { x: 6.5, z: 0, width: 0.22, depth: 13, height: 2.9 },
  { x: 0, z: 6.5, width: 13, depth: 0.22, height: 2.9 },
  { x: -1.95, z: -6.5, width: 9.1, depth: 0.22, height: 2.9 },
  { x: 5.45, z: -6.5, width: 2.1, depth: 0.22, height: 2.9 },
  // Two open doorways in the central partition.
  { x: -0.6, z: -5.3, width: 0.16, depth: 2.4, height: 2.9 },
  { x: -0.6, z: -0.2, width: 0.16, depth: 5.2, height: 2.9 },
  { x: -0.6, z: 5.1, width: 0.16, depth: 2.8, height: 2.9 },
  { x: -3.55, z: 0.8, width: 5.9, depth: 0.16, height: 2.9 },
]
export const HOUSE_FURNITURE: readonly HouseFurniture[] = [
  { kind: 'bed', x: -4.5, z: 2.6, width: 2.1, depth: 3, height: 0.48 },
  { kind: 'table', x: -2.8, z: 1.7, width: 0.65, depth: 0.7, height: 0.65 },
  { kind: 'wardrobe', x: -5.45, z: 5.8, width: 1.8, depth: 0.7, height: 2.3 },
  { kind: 'sofa', x: 1.3, z: 2.5, width: 1.1, depth: 2.6, height: 0.7 },
  { kind: 'table', x: 3.3, z: 2.5, width: 1.1, depth: 1.8, height: 0.46 },
  { kind: 'cabinet', x: 5.75, z: 1.5, width: 1, depth: 2, height: 0.72 },
  { kind: 'cabinet', x: 0.8, z: -5.5, width: 2.5, depth: 0.7, height: 0.9 },
  { kind: 'table', x: 4.6, z: 5.4, width: 2.5, depth: 0.9, height: 0.85 },
  { kind: 'fridge', x: -5.7, z: -5.6, width: 1.1, depth: 1.1, height: 1.9 },
  { kind: 'sink', x: -3.7, z: -5.8, width: 2.3, depth: 0.8, height: 0.9 },
  { kind: 'table', x: -4.4, z: -2.2, width: 1.7, depth: 1.5, height: 0.78 },
  { kind: 'chair', x: -4.4, z: -0.9, width: 0.55, depth: 0.55, height: 0.45 },
]
export const HOUSE_OBJECTS: readonly { id: HouseObjectId; x: number; y: number; z: number; label: string }[] = [
  { id: 'radio', x: 0.8, y: 1.2, z: -5, label: 'радио' },
  { id: 'television', x: 5.1, y: 1.2, z: 1.5, label: 'телевизор' },
  { id: 'note', x: -2.8, y: 0.67, z: 2.05, label: 'записка у кровати' },
  { id: 'door', x: 3.5, y: 1.2, z: -6.05, label: 'входная дверь' },
  { id: 'lamp', x: 4.6, y: 1.4, z: 4.95, label: 'настольная лампа' },
]

export function houseBlocked(x: number, z: number, doorOpen: boolean, radius = 0.25): boolean {
  if (x < -12.5 || x > 12.5 || z < -15 || z > 9.5) return true
  const door: HouseBox = doorOpen
    ? { x: 2.6, z: -7.4, width: 0.18, depth: 1.8, height: 2.4 }
    : { x: 3.5, z: -6.5, width: 1.8, depth: 0.18, height: 2.4 }
  return [...HOUSE_WALLS, ...HOUSE_FURNITURE, door].some((box) => Math.abs(x - box.x) < box.width / 2 + radius && Math.abs(z - box.z) < box.depth / 2 + radius)
}

export function houseRoomAt(x: number, z: number): string {
  if (Math.abs(x) > 6.5 || Math.abs(z) > 6.5) return 'перед домом'
  return x < -0.6 ? z > 0.8 ? 'спальня' : 'кухня' : 'гостиная'
}

export function houseSightClear(ax: number, az: number, bx: number, bz: number): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.08)
  for (let step = 1; step < steps; step++) {
    const x = ax + (bx - ax) * step / steps, z = az + (bz - az) * step / steps
    if (HOUSE_WALLS.some((wall) => Math.abs(x - wall.x) < wall.width / 2 && Math.abs(z - wall.z) < wall.depth / 2)) return false
  }
  return true
}
