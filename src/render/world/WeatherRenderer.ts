import * as THREE from 'three'
import type { WorldState } from '../../simulation/WorldState'

export class WeatherRenderer {
  private readonly positions = new Float32Array(650 * 6)
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material = new THREE.LineBasicMaterial({ color: 0xa4b7b6, transparent: true, opacity: 0, depthWrite: false })
  private readonly rain: THREE.LineSegments

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    this.rain = new THREE.LineSegments(this.geometry, this.material)
    this.rain.frustumCulled = false
    scene.add(this.rain)
  }

  update(world: WorldState): void {
    const strength = world.interior ? 0 : world.environment.rain
    this.rain.visible = strength > 0.01
    if (!this.rain.visible) return
    this.material.opacity = strength * 0.32
    for (let i = 0; i < 650; i++) {
      const x = world.player.x + ((i * 19.133 + world.elapsed * 1.6) % 50) - 25
      const z = world.player.z + ((i * 31.731) % 40) - 20
      const y = 18 - ((i * 7.37 + world.elapsed * 16) % 18)
      this.positions.set([x, y, z, x - 0.17, y + 0.9, z + 0.05], i * 6)
    }
    this.geometry.attributes.position!.needsUpdate = true
  }

  destroy(): void { this.rain.removeFromParent(); this.geometry.dispose(); this.material.dispose() }
}
