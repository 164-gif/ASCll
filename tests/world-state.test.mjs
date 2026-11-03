import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Node 22.18+ strips types; resolve the source's bundler-style relative imports.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts')) specifier += '.ts'
  return nextResolve(specifier, context)
} })
const { WorldState } = await import('../src/simulation/WorldState.ts')
const { TOWN_BUILDINGS, townBuildingDoor } = await import('../src/world/WorldLayout.ts')
const { settlementBlocked, INTERIOR_FURNITURE } = await import('../src/world/Settlement.ts')
const { environmentAt } = await import('../src/simulation/EnvironmentState.ts')
const idle = { x: 0, z: 0, running: false }
function advance(world, input, seconds) { for (let t = 0; t < seconds; t += 1 / 60) world.update(1 / 60, input, false) }

for (const building of TOWN_BUILDINGS.filter(b => b.kind !== 'house')) {
  test(`${building.id}: enter, walk, furniture collision, restore outside position`, () => {
    const world = new WorldState(), door = townBuildingDoor(building)
    Object.assign(world.player, { x: door[0], z: door[1], facing: 0.7 })
    assert.equal(settlementBlocked(world.player.x, world.player.z, 0.42), false)
    const outside = { x: world.player.x, z: world.player.z, facing: world.player.facing }
    assert.equal(world.enterBuilding(building.id), true)
    const enemyX = world.enemies[0].x
    advance(world, { x: 0, z: -1, running: false }, 0.5)
    assert.ok(world.player.z < 4)
    assert.equal(world.exitInterior(), false)
    assert.equal(world.enemies[0].x, enemyX)
    const furniture = INTERIOR_FURNITURE[building.kind][0]
    Object.assign(world.player, { x: furniture.x, z: furniture.z + furniture.depth / 2 + 0.6 })
    advance(world, { x: 0, z: -1, running: false }, 1)
    assert.ok(world.player.z >= furniture.z + furniture.depth / 2 + 0.4)
    Object.assign(world.player, { x: 0, z: 5.5 })
    assert.equal(world.exitInterior(), true)
    assert.equal(world.interior, null)
    for (const key of ['x', 'z', 'facing']) assert.equal(world.player[key], outside[key])
  })
}

test('city walls block movement while the gate is passable', () => {
  const world = new WorldState()
  Object.assign(world.player, { x: -35, z: 83 })
  advance(world, { x: 0, z: 1, running: false }, 1)
  assert.ok(world.player.z < 84.1)
  Object.assign(world.player, { x: -25, z: 83 })
  advance(world, { x: 0, z: 1, running: false }, 2)
  assert.ok(world.player.z > 90)
})

test('closed houses and distant entrances cannot be entered', () => {
  const world = new WorldState()
  assert.equal(world.enterBuilding('grey-boar-inn'), false)
  assert.equal(world.enterBuilding('north-house'), false)
  assert.equal(world.enterBuilding('missing'), false)
})

test('residents follow clear routes and pause for a nearby player', () => {
  const world = new WorldState()
  const farmer = world.residents.find(n => n.farmer)
  const start = farmer.z
  advance(world, idle, 15)
  assert.notEqual(farmer.z, start)
  for (const resident of world.residents) assert.equal(settlementBlocked(resident.x, resident.z, 0.3), false, resident.id)
  Object.assign(world.player, { x: farmer.x + 1, z: farmer.z })
  const paused = farmer.z
  advance(world, idle, 1)
  assert.equal(farmer.z, paused)
})

test('24 real minutes complete a day; night stays navigable', () => {
  assert.equal(environmentAt(0).hour, environmentAt(1440).hour)
  assert.ok(environmentAt(240).daylight > environmentAt(960).daylight)
  assert.ok(environmentAt(960).daylight > 0)
})

test('weather lasts 3–5 minutes and transitions continuously', () => {
  assert.equal(environmentAt(239).weather, 'clear')
  assert.equal(environmentAt(240).weather, 'overcast')
  assert.equal(environmentAt(450).weather, 'rain')
  assert.equal(environmentAt(720).weather, 'fog')
  assert.equal(environmentAt(480).rain, 1)
  assert.equal(environmentAt(750).rain, 0)
  assert.ok(Math.abs(environmentAt(450.01).fog - environmentAt(449.99).fog) < 0.001)
})

const { ANOMALY_QUESTS } = await import('../src/world/Anomalies.ts')
const { FOREST_CAMP_OLD_MAN, FOREST_CAMP_TENT_ENTRY } = await import('../src/world/ForestCamp.ts')
const { TENT_BED, TENT_ELDER } = await import('../src/world/Settlement.ts')

test('three anomaly quests require acceptance, field observation and return; rewards are granted once', () => {
  const world = new WorldState()
  assert.equal(world.acceptQuest(ANOMALY_QUESTS[0].id), false)
  assert.equal(world.acceptQuest('missing'), false)
  for (const [index, quest] of ANOMALY_QUESTS.entries()) {
    Object.assign(world.player, FOREST_CAMP_OLD_MAN)
    assert.equal(world.completeQuest(quest.id), false)
    assert.equal(world.acceptQuest(quest.id), true)
    assert.equal(world.acceptQuest(quest.id), false)
    if (index < 2) assert.equal(world.acceptQuest(ANOMALY_QUESTS[index + 1].id), false)
    assert.equal(world.inspectAnomaly(quest.id), false)
    Object.assign(world.player, { x: quest.x, z: quest.z })
    assert.equal(world.inspectAnomaly(quest.id), true)
    assert.equal(world.inspectAnomaly(quest.id), false)
    assert.equal(world.completeQuest(quest.id), false)
    Object.assign(world.player, FOREST_CAMP_OLD_MAN)
    assert.equal(world.completeQuest(quest.id), true)
    assert.equal(world.completeQuest(quest.id), false)
    assert.equal(world.quests[quest.id], 'completed')
  }
  assert.equal(world.lanternPower, 1.3)
  assert.equal(world.activeQuest, undefined)
})

test('elder tent is a walkable room, supports dialogue and rest, and restores exterior coordinates', () => {
  const world = new WorldState()
  Object.assign(world.player, FOREST_CAMP_TENT_ENTRY)
  assert.equal(world.enterBuilding('elder-tent'), true)
  advance(world, { x: 1, z: 0, running: false }, 0.5)
  assert.ok(world.player.x > 1)
  assert.equal(world.canTalkToElder, false)
  Object.assign(world.player, { x: TENT_ELDER.x + 1.2, z: TENT_ELDER.z })
  assert.equal(world.canTalkToElder, true)
  assert.equal(world.acceptQuest(ANOMALY_QUESTS[0].id), true)
  assert.equal(world.inspectAnomaly(ANOMALY_QUESTS[0].id), false)
  Object.assign(world.player, { x: TENT_BED.x + 2, z: TENT_BED.z, hp: 20, stamina: 10 })
  const before = world.elapsed
  assert.equal(world.restInTent(), true)
  assert.equal(world.player.hp, 100)
  assert.equal(world.elapsed - before, 180)
  Object.assign(world.player, { x: 0, z: 5.5 })
  assert.equal(world.exitInterior(), true)
  assert.equal(world.player.x, FOREST_CAMP_TENT_ENTRY.x)
  assert.equal(world.player.z, FOREST_CAMP_TENT_ENTRY.z)
  assert.equal(world.quests[ANOMALY_QUESTS[0].id], 'active')
})

test('anomaly observation areas are not buried inside generated obstacles', () => {
  const world = new WorldState()
  for (const quest of ANOMALY_QUESTS) for (const obstacle of world.trees) {
    assert.ok(Math.hypot(quest.x - obstacle.x, quest.z - obstacle.z) > obstacle.radius + 0.42, quest.id)
  }
})

function awakenedWorld() {
  const world = new WorldState()
  for (const quest of ANOMALY_QUESTS) world.quests[quest.id] = 'completed'
  assert.equal(world.beginAwakening(true), true)
  return world
}

test('awakening requires all three reports and can happen only once', () => {
  const world = new WorldState()
  assert.equal(world.beginAwakening(), false)
  for (const quest of ANOMALY_QUESTS) {
    Object.assign(world.player, FOREST_CAMP_OLD_MAN)
    world.acceptQuest(quest.id)
    Object.assign(world.player, { x: quest.x, z: quest.z }); world.inspectAnomaly(quest.id)
    Object.assign(world.player, FOREST_CAMP_OLD_MAN); world.completeQuest(quest.id)
  }
  assert.equal(world.awakeningPending, true)
  assert.equal(world.beginAwakening(true), true)
  assert.equal(world.chapter, 'awakening')
  assert.equal(world.interior, null)
  assert.equal(world.awakeningPending, false)
  assert.equal(world.beginAwakening(), false)
  assert.equal(world.enterBuilding('elder-tent'), false)
  assert.equal(world.canTalkToElder, false)
})

test('first-person walking follows viewing direction and solid room furniture blocks it', () => {
  const world = awakenedWorld()
  Object.assign(world.player, { x: 3.6, z: -1.5 }); world.house.yaw = Math.PI / 2
  advance(world, { x: 0, z: -1, running: false }, 0.5)
  assert.ok(world.player.x > 4.6)
  assert.ok(Math.abs(world.player.z + 1.5) < 0.01)
  Object.assign(world.player, { x: -4.5, z: 4.8 }); world.house.yaw = 0
  advance(world, { x: 0, z: -1, running: false }, 2)
  assert.ok(world.player.z > 4.3)
})

test('radio, television and note need a nearby facing player and cannot be used through a wall', () => {
  const world = awakenedWorld()
  assert.equal(world.useHouseObject('radio'), false)
  Object.assign(world.player, { x: 0.8, z: -4 }); world.house.yaw = 0
  assert.equal(world.houseTarget?.id, 'radio')
  world.house.pitch = 1.1; assert.equal(world.useHouseObject('radio'), false); world.house.pitch = -0.08
  assert.equal(world.useHouseObject('radio'), true); assert.equal(world.house.radioOn, false)
  assert.equal(world.useHouseObject('radio'), true); assert.equal(world.house.radioOn, true)
  Object.assign(world.player, { x: -1.1, z: -5 }); world.house.yaw = Math.PI / 2
  assert.equal(world.useHouseObject('radio'), false)
  Object.assign(world.player, { x: 4.2, z: 1.5 }); world.house.yaw = Math.PI / 2
  assert.equal(world.useHouseObject('television'), true); assert.equal(world.house.tvOn, true)
  Object.assign(world.player, { x: -1.8, z: 2.05 }); world.house.yaw = -Math.PI / 2
  assert.equal(world.useHouseObject('note'), true); assert.equal(world.house.noteRead, true)
})

test('front door blocks walking until opened, then leads into the yard', () => {
  const world = awakenedWorld()
  Object.assign(world.player, { x: 3.5, z: -5 }); world.house.yaw = 0
  advance(world, { x: 0, z: -1, running: false }, 1)
  assert.ok(world.player.z > -6.2)
  assert.equal(world.useHouseObject('door'), true)
  advance(world, { x: 0, z: -1, running: false }, 1.2)
  assert.ok(world.player.z < -7.5)
})
