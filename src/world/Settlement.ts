import { TOWN_BUILDINGS, TOWN_CENTER, TOWN_FIELDS, TOWN_WALL, type TownBuilding } from './WorldLayout'

export type RectObstacle = { x: number; z: number; width: number; depth: number }
export type Furniture = RectObstacle & { kind: 'table' | 'counter' | 'forge' | 'anvil' | 'shelf' | 'barrel'; height: number }
export type InteriorKind = Exclude<TownBuilding['kind'], 'house'>
export type Resident = {
  id: string; name: string; role: string; color: number; farmer: boolean
  route: readonly (readonly [number, number])[]; lines: readonly string[]
}
export const INTERIOR_WIDTH = 15
export const INTERIOR_DEPTH = 13
export const INTERIOR_EXIT = { x: 0, z: 5.5 }
export const INTERIOR_FURNITURE: Record<InteriorKind, readonly Furniture[]> = {
  inn: [
    { kind: 'counter', x: 0, z: -4.6, width: 9, depth: 1, height: 1.2 },
    { kind: 'table', x: -4, z: 0, width: 2.4, depth: 2.2, height: 0.9 },
    { kind: 'table', x: 4, z: 1, width: 2.4, depth: 2.2, height: 0.9 },
    { kind: 'barrel', x: -5.6, z: -4.5, width: 1.1, depth: 1.1, height: 1.3 },
    { kind: 'shelf', x: 5.7, z: -4.5, width: 1.3, depth: 2, height: 2.5 },
  ],
  smithy: [
    { kind: 'forge', x: -4.7, z: -4.6, width: 3, depth: 2.1, height: 1.7 },
    { kind: 'anvil', x: -2, z: -1, width: 1.4, depth: 1, height: 1.1 },
    { kind: 'counter', x: 4.6, z: -1, width: 1.4, depth: 5.5, height: 1 },
    { kind: 'barrel', x: -5.4, z: 2.8, width: 1.3, depth: 1.3, height: 1.2 },
    { kind: 'shelf', x: 1.6, z: -5.1, width: 4, depth: 1, height: 2.6 },
  ],
  hall: [
    { kind: 'table', x: 0, z: -1, width: 3.4, depth: 5, height: 1 },
    { kind: 'shelf', x: -5.8, z: -3.5, width: 1.3, depth: 3.3, height: 2.8 },
    { kind: 'shelf', x: 5.8, z: -3.5, width: 1.3, depth: 3.3, height: 2.8 },
    { kind: 'counter', x: 0, z: -5.2, width: 3.3, depth: 0.9, height: 1.5 },
  ],
}

export const RESIDENTS: readonly Resident[] = [
  { id: 'guard', name: 'Борис', role: 'страж ворот', color: 0x88998f, farmer: false,
    route: [[-27.5, 88], [-22.5, 88]], lines: ['Седой Бор держится, пока стоят ворота. Проходи, путник.', 'Трактир — слева за воротами, кузница — справа. Ратуша в конце улицы.', 'За стенами не задерживайся после заката. Здесь мы хотя бы видим, что выходит из тумана.'] },
  { id: 'innkeeper', name: 'Аглая', role: 'трактирщица', color: 0xa48563, farmer: false,
    route: [[-32, 90.5], [-29, 90.5]], lines: ['Добро пожаловать в «Серый вепрь». Дверь всегда открыта.', 'Зайди внутрь: у очага тихо даже тогда, когда дождь бьёт по крыше.', 'У нас не спрашивают, откуда ты пришёл. Только куда собираешься дальше.'] },
  { id: 'smith', name: 'Тихон', role: 'кузнец', color: 0x8d6254, farmer: false,
    route: [[-18, 90], [-17.5, 93]], lines: ['Огонь, железо и терпение. Всё остальное город приносит сам.', 'В кузнице есть место у горна. Только не вставай между наковальней и верстаком.', 'Ворота чиним каждый сезон. То ржавчина, то следы, которых не оставляет ни один зверь.'] },
  { id: 'elder', name: 'Мирон', role: 'староста', color: 0x839074, farmer: false,
    route: [[-30, 110], [-29, 112]], lines: ['Видишь поля? Они кормят и город, и тех, кто держит стены.', 'В ратуше хранят карты старых дорог. Вход — прямо за мной.', 'Жители возвращаются к воротам до темноты. Привычка старше самой крепости.'] },
  { id: 'farmer-west', name: 'Фёдор', role: 'полевой работник', color: 0x9c9160, farmer: true,
    route: [[-67, 96], [-67, 112]], lines: ['Земля ещё держит тепло. Значит, есть время закончить ряд.', 'Урожай общий. Часть в город, часть на семена, остальное — зиме.', 'По колее выйдешь к южным воротам. Через посевы тоже можно, только осторожнее.'] },
  { id: 'farmer-east', name: 'Дарья', role: 'жница', color: 0x879268, farmer: true,
    route: [[18, 97], [18, 114]], lines: ['Рожь высокая в этом году. Дождя бы немного, да без холодного ветра.', 'С утра мы здесь. К вечеру поле становится совсем другим.', 'Дорогу найдёшь по следам телег. Они ведут к крепости.'] },
  { id: 'potter', name: 'Лада', role: 'гончар', color: 0x9b7765, farmer: false,
    route: [[-38, 105.5], [-33, 105.5]], lines: ['Глина помнит руки. Иногда это всё, что остаётся от человека.', 'Мой дом у северной стены. А кувшины стоят на площади — каждый немного кривой, зато свой.'] },
]

export function pointInRect(x: number, z: number, rect: RectObstacle, radius = 0): boolean {
  return Math.abs(x - rect.x) < rect.width / 2 + radius && Math.abs(z - rect.z) < rect.depth / 2 + radius
}

export function buildingContains(building: TownBuilding, x: number, z: number, radius = 0): boolean {
  const c = Math.cos(building.rotation), s = Math.sin(building.rotation)
  const dx = x - building.x, dz = z - building.z
  return Math.abs(c * dx - s * dz) < building.width / 2 + radius && Math.abs(s * dx + c * dz) < building.depth / 2 + radius
}

export const TOWN_COLLIDERS: readonly RectObstacle[] = [
  { x: TOWN_CENTER.x - TOWN_WALL.width / 2, z: TOWN_CENTER.z, width: 1.2, depth: TOWN_WALL.depth },
  { x: TOWN_CENTER.x + TOWN_WALL.width / 2, z: TOWN_CENTER.z, width: 1.2, depth: TOWN_WALL.depth },
  { x: TOWN_CENTER.x, z: TOWN_CENTER.z + TOWN_WALL.depth / 2, width: TOWN_WALL.width, depth: 1.2 },
  ...[-1, 1].map((side) => ({ x: TOWN_CENTER.x + side * (TOWN_WALL.width + TOWN_WALL.gateWidth) / 4, z: TOWN_CENTER.z - TOWN_WALL.depth / 2, width: (TOWN_WALL.width - TOWN_WALL.gateWidth) / 2, depth: 1.2 })),
  ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: TOWN_CENTER.x + sx * TOWN_WALL.width / 2, z: TOWN_CENTER.z + sz * TOWN_WALL.depth / 2, width: 4.4, depth: 4.4 }))),
  { x: -30, z: 103, width: 2.3, depth: 2.3 },
]

export function settlementBlocked(x: number, z: number, radius: number): boolean {
  return TOWN_COLLIDERS.some((rect) => pointInRect(x, z, rect, radius)) || TOWN_BUILDINGS.some((building) => buildingContains(building, x, z, radius))
}

export function cultivatedAt(x: number, z: number): boolean {
  return TOWN_FIELDS.some((field) => {
    const c = Math.cos(field.rotation), s = Math.sin(field.rotation)
    const dx = x - field.x, dz = z - field.z
    return Math.abs(c * dx - s * dz) < field.width / 2 + 1 && Math.abs(s * dx + c * dz) < field.depth / 2 + 1
  })
}
