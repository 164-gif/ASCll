import { AudioSettings, type AudioSettingsState } from '../core/AudioSettings'
import type { WorldState } from '../simulation/WorldState'
import { bridgeDeckHeightAt, isInsideRiver, riverSignedDistance } from '../world/WorldLayout'

type AudioScene = 'menu' | 'world'
type Surface = 'grass' | 'water' | 'stone'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

export class AudioDirector {
  private readonly store = new AudioSettings()
  private settings: AudioSettingsState = this.store.get()
  private readonly menuTrack = new Audio()

  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicSceneGain: GainNode | null = null
  private musicFilter: BiquadFilterNode | null = null
  private effectsGain: GainNode | null = null
  private worldSceneGain: GainNode | null = null
  private riverGain: GainNode | null = null
  private windGain: GainNode | null = null
  private grassGain: GainNode | null = null
  private fireGain: GainNode | null = null
  private dangerGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  private scene: AudioScene = 'menu'
  private lastPlayerX = 0
  private lastPlayerZ = 0
  private footstepDistance = 0
  private previousAttackPulse = 0
  private previousHurtPulse = 0
  private previousTorch = true
  private nextCrackleAt = 0

  private readonly handleSettings = (event: Event): void => {
    const custom = event as CustomEvent<AudioSettingsState>
    this.settings = custom.detail
    this.applySettings()
  }

  private readonly handleVisibility = (): void => {
    this.applySettings()
  }

  constructor() {
    this.menuTrack.preload = 'auto'
    this.menuTrack.loop = true
    this.menuTrack.src = `${import.meta.env.BASE_URL}audio/measured-in-pale-glass.mp3`

    window.addEventListener('ascii:audio-settings', this.handleSettings)
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  async unlock(): Promise<void> {
    if (!this.context) this.buildGraph()
    const context = this.context
    if (!context) return

    const resume = context.state === 'suspended' ? context.resume() : Promise.resolve()
    if (this.scene === 'menu' && this.menuTrack.paused) void this.menuTrack.play().catch(() => undefined)
    await resume
    this.applySettings(true)
  }

  entryConfirm(): void {
    this.playTone(78, 42, 0.72, 0.18, 'sine')
    this.playNoiseBurst(0.42, 0.055, 1400, 'bandpass')
  }

  bootStart(): void {
    this.playTone(116, 84, 0.5, 0.025, 'sine')
  }

  menuReveal(): void {
    this.playTone(392, 588, 0.42, 0.022, 'sine', 0.05)
    this.playTone(196, 294, 0.7, 0.012, 'sine', 0.12)
  }

  uiMove(): void {
    this.playTone(660, 540, 0.06, 0.012, 'sine')
  }

  uiConfirm(): void {
    this.playTone(248, 372, 0.16, 0.025, 'triangle')
    this.playNoiseBurst(0.08, 0.014, 3200, 'highpass')
  }

  beginWorldTransition(): void {
    this.scene = 'world'
    const context = this.context
    if (!context || !this.musicSceneGain || !this.musicFilter || !this.worldSceneGain) return

    const now = context.currentTime
    this.musicSceneGain.gain.cancelScheduledValues(now)
    this.musicSceneGain.gain.setValueAtTime(this.musicSceneGain.gain.value, now)
    this.musicSceneGain.gain.linearRampToValueAtTime(0.06, now + 1.55)
    this.musicFilter.frequency.cancelScheduledValues(now)
    this.musicFilter.frequency.setValueAtTime(Math.max(900, this.musicFilter.frequency.value), now)
    this.musicFilter.frequency.exponentialRampToValueAtTime(620, now + 1.35)
    this.worldSceneGain.gain.cancelScheduledValues(now)
    this.worldSceneGain.gain.setValueAtTime(0, now)
    this.worldSceneGain.gain.linearRampToValueAtTime(0.55, now + 1.8)
    this.playNoiseBurst(1.25, 0.025, 480, 'lowpass')
  }

  enterWorld(world: WorldState): void {
    this.scene = 'world'
    this.lastPlayerX = world.player.x
    this.lastPlayerZ = world.player.z
    this.footstepDistance = 0
    this.previousAttackPulse = world.player.attackPulse
    this.previousHurtPulse = world.player.hurtPulse
    this.previousTorch = world.torchOn

    const context = this.context
    if (!context || !this.worldSceneGain || !this.musicSceneGain || !this.musicFilter) return

    const now = context.currentTime
    this.worldSceneGain.gain.cancelScheduledValues(now)
    this.worldSceneGain.gain.setTargetAtTime(1, now, 0.55)
    this.musicSceneGain.gain.cancelScheduledValues(now)
    this.musicSceneGain.gain.setTargetAtTime(0, now, 0.2)
    this.musicFilter.frequency.setTargetAtTime(18000, now, 0.25)
    window.setTimeout(() => {
      if (this.scene === 'world') this.menuTrack.pause()
    }, 900)
  }

  enterMenu(): void {
    this.scene = 'menu'
    const context = this.context
    if (!context || !this.worldSceneGain || !this.musicSceneGain || !this.musicFilter) return

    if (this.menuTrack.currentTime > 164) this.menuTrack.currentTime = 0
    if (this.menuTrack.paused) void this.menuTrack.play().catch(() => undefined)

    const now = context.currentTime
    this.worldSceneGain.gain.cancelScheduledValues(now)
    this.worldSceneGain.gain.setTargetAtTime(0, now, 0.3)
    this.musicFilter.frequency.cancelScheduledValues(now)
    this.musicFilter.frequency.setValueAtTime(900, now)
    this.musicFilter.frequency.exponentialRampToValueAtTime(18000, now + 1.2)
    this.musicSceneGain.gain.cancelScheduledValues(now)
    this.musicSceneGain.gain.setValueAtTime(0.08, now)
    this.musicSceneGain.gain.linearRampToValueAtTime(1, now + 1.55)
  }

  updateWorld(world: WorldState, dt: number): void {
    const context = this.context
    if (!context || this.scene !== 'world') return

    const safeDt = Math.max(1 / 240, dt)
    const dx = world.player.x - this.lastPlayerX
    const dz = world.player.z - this.lastPlayerZ
    const moved = Math.hypot(dx, dz)
    const speed = moved / safeDt
    this.lastPlayerX = world.player.x
    this.lastPlayerZ = world.player.z

    const onBridge = bridgeDeckHeightAt(world.player.x, world.player.z) !== null
    const inWater = isInsideRiver(world.player.x, world.player.z) && !onBridge
    const zone = world.currentZone.id
    const riverDistance = Math.abs(riverSignedDistance(world.player.x, world.player.z))
    const nearRiver = clamp01(1 - riverDistance / 30)

    this.setTarget(this.riverGain, inWater ? 0.34 : 0.035 + nearRiver * 0.23, 0.35)
    const windBase = zone === 'highland' ? 0.2 : zone === 'forest' ? 0.07 : zone === 'meadow' ? 0.1 : 0.13
    const windBreath = 0.78 + Math.sin(world.elapsed * 0.19) * 0.16 + Math.sin(world.elapsed * 0.071) * 0.08
    this.setTarget(this.windGain, windBase * windBreath, 0.7)

    const moving = clamp01(speed / 5.4)
    const grassAmount = inWater || onBridge ? 0 : moving * (zone === 'meadow' ? 0.18 : zone === 'forest' ? 0.14 : 0.09)
    this.setTarget(this.grassGain, grassAmount, 0.08)
    this.setTarget(this.fireGain, world.torchOn ? 0.035 : 0, 0.16)

    let nearestEnemy = Number.POSITIVE_INFINITY
    for (const enemy of world.enemies) nearestEnemy = Math.min(nearestEnemy, Math.hypot(enemy.x - world.player.x, enemy.z - world.player.z))
    const danger = nearestEnemy < 9 ? clamp01((9 - nearestEnemy) / 8) * 0.045 : 0
    this.setTarget(this.dangerGain, danger, 0.45)

    if (moved > 0.001) {
      this.footstepDistance += moved
      const stride = speed > 5.4 ? 1.18 : 1.48
      if (this.footstepDistance >= stride) {
        this.footstepDistance %= stride
        const surface: Surface = inWater ? 'water' : onBridge || zone === 'ruins' || zone === 'highland' ? 'stone' : 'grass'
        this.playFootstep(surface, speed > 5.4)
      }
    }

    if (world.player.attackPulse > this.previousAttackPulse + 0.12) this.playSword()
    if (world.player.hurtPulse > this.previousHurtPulse + 0.08) this.playHurt()
    if (world.torchOn !== this.previousTorch) this.playTorchToggle(world.torchOn)

    this.previousAttackPulse = world.player.attackPulse
    this.previousHurtPulse = world.player.hurtPulse
    this.previousTorch = world.torchOn

    if (world.torchOn && context.currentTime >= this.nextCrackleAt) {
      this.nextCrackleAt = context.currentTime + 0.18 + Math.random() * 0.75
      this.playNoiseBurst(0.025 + Math.random() * 0.045, 0.009 + Math.random() * 0.008, 2900 + Math.random() * 2600, 'bandpass')
    }
  }

  destroy(): void {
    window.removeEventListener('ascii:audio-settings', this.handleSettings)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.menuTrack.pause()
    this.menuTrack.removeAttribute('src')
    this.menuTrack.load()
    if (this.context) void this.context.close()
    this.context = null
  }

  private buildGraph(): void {
    const context = new AudioContext()
    this.context = context

    const masterGain = context.createGain()
    const musicGain = context.createGain()
    const musicSceneGain = context.createGain()
    const musicFilter = context.createBiquadFilter()
    const effectsGain = context.createGain()
    const worldSceneGain = context.createGain()

    masterGain.gain.value = 0
    musicGain.gain.value = this.settings.music
    musicSceneGain.gain.value = this.scene === 'menu' ? 1 : 0
    musicFilter.type = 'lowpass'
    musicFilter.frequency.value = 18000
    musicFilter.Q.value = 0.4
    effectsGain.gain.value = this.settings.effects
    worldSceneGain.gain.value = 0

    const media = context.createMediaElementSource(this.menuTrack)
    media.connect(musicFilter).connect(musicSceneGain).connect(musicGain).connect(masterGain)
    worldSceneGain.connect(effectsGain).connect(masterGain)
    masterGain.connect(context.destination)

    this.masterGain = masterGain
    this.musicGain = musicGain
    this.musicSceneGain = musicSceneGain
    this.musicFilter = musicFilter
    this.effectsGain = effectsGain
    this.worldSceneGain = worldSceneGain
    this.noiseBuffer = this.createNoiseBuffer(context, 7)

    this.riverGain = this.createLoopingNoise(worldSceneGain, 'lowpass', 1900, 0.72)
    this.windGain = this.createLoopingNoise(worldSceneGain, 'bandpass', 520, 0.55)
    this.grassGain = this.createLoopingNoise(worldSceneGain, 'highpass', 2200, 0.3)
    this.fireGain = this.createLoopingNoise(worldSceneGain, 'bandpass', 3600, 1.2)

    const dangerGain = context.createGain()
    dangerGain.gain.value = 0
    const dangerA = context.createOscillator()
    const dangerB = context.createOscillator()
    dangerA.type = 'sine'
    dangerB.type = 'sine'
    dangerA.frequency.value = 43
    dangerB.frequency.value = 67
    dangerA.detune.value = -7
    dangerB.detune.value = 5
    dangerA.connect(dangerGain)
    dangerB.connect(dangerGain)
    dangerGain.connect(worldSceneGain)
    dangerA.start()
    dangerB.start()
    this.dangerGain = dangerGain

    this.applySettings(true)
  }

  private createNoiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const channel = buffer.getChannelData(0)
    let previous = 0
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1
      previous = previous * 0.985 + white * 0.015
      channel[i] = white * 0.66 + previous * 1.7
    }
    return buffer
  }

  private createLoopingNoise(destination: AudioNode, type: BiquadFilterType, frequency: number, q: number): GainNode {
    const context = this.context
    const buffer = this.noiseBuffer
    if (!context || !buffer) throw new Error('Audio graph is not ready')

    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    source.loop = true
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    gain.gain.value = 0
    source.connect(filter).connect(gain).connect(destination)
    source.start(0, Math.random() * Math.max(0.1, buffer.duration - 0.1))
    return gain
  }

  private applySettings(immediate = false): void {
    const context = this.context
    if (!context || !this.masterGain || !this.musicGain || !this.effectsGain) return

    const now = context.currentTime
    const master = document.hidden && this.settings.muteWhenHidden ? 0 : this.settings.master
    const timeConstant = immediate ? 0.001 : 0.06
    this.masterGain.gain.setTargetAtTime(master, now, timeConstant)
    this.musicGain.gain.setTargetAtTime(this.settings.music, now, timeConstant)
    this.effectsGain.gain.setTargetAtTime(this.settings.effects, now, timeConstant)
  }

  private setTarget(node: GainNode | null, value: number, timeConstant: number): void {
    const context = this.context
    if (!context || !node) return
    node.gain.setTargetAtTime(Math.max(0, value), context.currentTime, timeConstant)
  }

  private playFootstep(surface: Surface, running: boolean): void {
    if (surface === 'water') {
      this.playNoiseBurst(running ? 0.16 : 0.12, running ? 0.055 : 0.04, 920, 'lowpass')
      this.playTone(92, 68, 0.08, running ? 0.022 : 0.016, 'sine')
      return
    }

    if (surface === 'stone') {
      this.playNoiseBurst(0.055, running ? 0.028 : 0.021, 2500, 'bandpass')
      this.playTone(170, 105, 0.055, running ? 0.018 : 0.012, 'triangle')
      return
    }

    this.playNoiseBurst(0.085, running ? 0.035 : 0.026, 1650, 'bandpass')
    this.playNoiseBurst(0.04, 0.012, 4300, 'highpass', 0.018)
  }

  private playSword(): void {
    this.playNoiseBurst(0.18, 0.045, 3400, 'bandpass')
    this.playTone(760, 170, 0.16, 0.024, 'sawtooth')
  }

  private playHurt(): void {
    this.playTone(96, 48, 0.24, 0.05, 'sine')
    this.playNoiseBurst(0.09, 0.022, 580, 'lowpass')
  }

  private playTorchToggle(enabled: boolean): void {
    if (enabled) {
      this.playNoiseBurst(0.32, 0.03, 3200, 'bandpass')
      this.playTone(180, 245, 0.16, 0.012, 'triangle')
    } else {
      this.playNoiseBurst(0.18, 0.02, 1200, 'lowpass')
    }
  }

  private playNoiseBurst(
    duration: number,
    amount: number,
    frequency: number,
    filterType: BiquadFilterType,
    delay = 0,
  ): void {
    const context = this.context
    const buffer = this.noiseBuffer
    const effectsGain = this.effectsGain
    if (!context || !buffer || !effectsGain || context.state === 'closed') return

    const now = context.currentTime + delay
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    filter.type = filterType
    filter.frequency.value = frequency
    filter.Q.value = filterType === 'bandpass' ? 0.75 : 0.35
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(amount, now + Math.min(0.015, duration * 0.2))
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    source.connect(filter).connect(gain).connect(effectsGain)
    const maxOffset = Math.max(0, buffer.duration - duration - 0.01)
    source.start(now, Math.random() * maxOffset, duration)
  }

  private playTone(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    amount: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    const context = this.context
    const effectsGain = this.effectsGain
    if (!context || !effectsGain || context.state === 'closed') return

    const now = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(amount, now + Math.min(0.02, duration * 0.25))
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(effectsGain)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.03)
  }
}
