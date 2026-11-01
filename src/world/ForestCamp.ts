export type WorldXZ = { x: number; z: number }

export const FOREST_CAMP_X = 55
export const FOREST_CAMP_Z = 29
export const FOREST_CAMP_ROTATION = -0.22

export function forestCampLocalToWorld(localX: number, localZ: number): WorldXZ {
  const c = Math.cos(FOREST_CAMP_ROTATION)
  const s = Math.sin(FOREST_CAMP_ROTATION)
  return {
    x: FOREST_CAMP_X + c * localX + s * localZ,
    z: FOREST_CAMP_Z - s * localX + c * localZ,
  }
}

export const FOREST_CAMP_OLD_MAN = forestCampLocalToWorld(-1.3, -1.3)
export const FOREST_CAMP_TENT_ENTRY = forestCampLocalToWorld(2.15, -0.75)
export const FOREST_CAMP_MAIN_TENT = forestCampLocalToWorld(2.8, 2.4)
