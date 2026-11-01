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
