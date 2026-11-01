import { AudioSettings, type AudioSettingsState } from '../core/AudioSettings'
import type { WorldState } from '../simulation/WorldState'
import { bridgeDeckHeightAt, isInsideRiver, riverSignedDistance } from '../world/WorldLayout'

type AudioScene = 'menu' | 'world'
type Surface = 'grass' | 'water' | 'stone'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))
const TAU = Math.PI * 2

export class AudioDirector {
  private readonly store = new AudioSettings()
  private settings: AudioSettingsState = this.store.get()

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
  private menuScoreBuffer: AudioBuffer | null = null
  private menuScoreSource: AudioBufferSourceNode | null = null
  private menuScoreStartedAt = 0
  private menuScoreOffset = 0

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
    window.addEventListener('ascii:audio-settings', this.handleSettings)
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  async unlock(): Promise<void> {
    if (!this.context) this.buildGraph()
    const context = this.context
    if (!context) return

    if (context.state === 'suspended') await context.resume()
    this.applySettings(true)
    if (this.scene === 'menu') this.startMenuScore()
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
    this.musicSceneGain.gain.linearRampToValueAtTime(0.055, now + 1.55)
    this.musicFilter.frequency.cancelScheduledValues(now)
    this.musicFilter.frequency.setValueAtTime(Math.max(900, this.musicFilter.frequency.value), now)
    this.musicFilter.frequency.exponentialRampToValueAtTime(520, now + 1.35)
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
      if (this.scene === 'world') this.stopMenuScore()
    }, 900)
  }

  enterMenu(): void {
    this.scene = 'menu'
    const context = this.context
    if (!context || !this.worldSceneGain || !this.musicSceneGain || !this.musicFilter) return

    this.startMenuScore()
    const now = context.currentTime
    this.worldSceneGain.gain.cancelScheduledValues(now)
    this.worldSceneGain.gain.setTargetAtTime(0, now, 0.3)
    this.musicFilter.frequency.cancelScheduledValues(now)
    this.musicFilter.frequency.setValueAtTime(760, now)
    this.musicFilter.frequency.exponentialRampToValueAtTime(18000, now + 1.3)
    this.musicSceneGain.gain.cancelScheduledValues(now)
    this.musicSceneGain.gain.setValueAtTime(0.06, now)
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
    for (const enemy of world.enemies) {
      nearestEnemy = Math.min(nearestEnemy, Math.hypot(enemy.x - world.player.x, enemy.z - world.player.z))
    }
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
    this.stopMenuScore(false)
    this.menuScoreBuffer = null
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
    musicFilter.Q.value = 0.42
    effectsGain.gain.value = this.settings.effects
    worldSceneGain.gain.value = 0

    musicFilter.connect(musicSceneGain).connect(musicGain).connect(masterGain)
    worldSceneGain.connect(effectsGain).connect(masterGain)
    masterGain.connect(context.destination)

    this.masterGain = masterGain
    this.musicGain = musicGain
    this.musicSceneGain = musicSceneGain
    this.musicFilter = musicFilter
    this.effectsGain = effectsGain
    this.worldSceneGain = worldSceneGain
    this.noiseBuffer = this.createNoiseBuffer(context, 7)
    this.menuScoreBuffer = this.createMenuScoreBuffer()

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

  private createMenuScoreBuffer(): AudioBuffer {
    const context = this.context
    if (!context) throw new Error('Audio context is not ready')

    const sampleRate = 22050
    const duration = 28
    const frames = sampleRate * duration
    const buffer = context.createBuffer(2, frames, sampleRate)
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)
    const chords = [
      [110, 164.81, 261.63],
      [87.31, 130.81, 220],
      [98, 146.83, 246.94],
      [82.41, 123.47, 196],
    ] as const
    const piano = [
      [1.6, 220],
      [4.9, 261.63],
      [8.7, 196],
      [12.2, 164.81],
      [16.8, 220],
      [20.4, 293.66],
      [23.6, 246.94],
    ] as const

    for (let frame = 0; frame < frames; frame += 1) {
      const t = frame / sampleRate
      const edge = Math.min(clamp01(t / 2.6), clamp01((duration - t) / 3.4))
      const section = Math.min(chords.length - 1, Math.floor(t / 7))
      const chord = chords[section] ?? chords[0]
      let padL = 0
      let padR = 0

      for (let voice = 0; voice < chord.length; voice += 1) {
        const frequency = chord[voice] ?? 110
        const vibrato = Math.sin(TAU * (0.17 + voice * 0.035) * t + voice) * 0.0028
        const phaseL = TAU * frequency * (1 + vibrato) * t
        const phaseR = TAU * frequency * (1 - vibrato * 0.7) * t + voice * 0.19
        const toneL = Math.sin(phaseL) + Math.sin(phaseL * 2.003) * 0.12 + Math.sin(phaseL * 3.01) * 0.035
        const toneR = Math.sin(phaseR) + Math.sin(phaseR * 1.997) * 0.12 + Math.sin(phaseR * 3.005) * 0.035
        const weight = voice === 0 ? 0.045 : voice === 1 ? 0.029 : 0.018
        padL += toneL * weight
        padR += toneR * weight
      }

      const breath = 0.72 + Math.sin(TAU * 0.033 * t) * 0.15 + Math.sin(TAU * 0.071 * t + 1.4) * 0.07
      padL *= edge * breath
      padR *= edge * (breath * 0.97 + 0.015)

      let keysL = 0
      let keysR = 0
      for (let noteIndex = 0; noteIndex < piano.length; noteIndex += 1) {
        const note = piano[noteIndex]
        if (!note) continue
        const [start, frequency] = note
        const age = t - start
        if (age < 0 || age > 5.2) continue
        const attack = clamp01(age / 0.025)
        const decay = Math.exp(-age * 0.72)
        const envelope = attack * decay * edge
        const body = Math.sin(TAU * frequency * age) * 0.068
          + Math.sin(TAU * frequency * 2.01 * age + 0.16) * 0.026
          + Math.sin(TAU * frequency * 3.98 * age) * 0.008
        const pan = noteIndex % 2 === 0 ? 0.82 : 1.05
        keysL += body * envelope * pan
        keysR += body * envelope * (1.9 - pan)
      }

      const air = (Math.random() * 2 - 1) * 0.0015 * edge * (0.35 + breath * 0.4)
      left[frame] = Math.tanh((padL + keysL + air) * 1.6) * 0.72
      right[frame] = Math.tanh((padR + keysR - air * 0.5) * 1.6) * 0.72
    }

    this.applyTinyReverb(left, sampleRate, 0.19, 0.22)
    this.applyTinyReverb(right, sampleRate, 0.23, 0.2)
    return buffer
  }

  private applyTinyReverb(channel: Float32Array, sampleRate: number, seconds: number, feedback: number): void {
    const delay = Math.max(1, Math.floor(sampleRate * seconds))
    for (let index = delay; index < channel.length; index += 1) {
      channel[index] += (channel[index - delay] ?? 0) * feedback
    }
  }

  private startMenuScore(): void {
    const context = this.context
    const buffer = this.menuScoreBuffer
    const filter = this.musicFilter
    if (!context || !buffer || !filter || this.menuScoreSource || context.state === 'closed') return

    const source = context.createBufferSource()
    const offset = buffer.duration > 0 ? this.menuScoreOffset % buffer.duration : 0
    source.buffer = buffer
    source.loop = true
    source.connect(filter)
    source.start(0, offset)
    this.menuScoreStartedAt = context.currentTime
    this.menuScoreSource = source
  }

  private stopMenuScore(rememberOffset = true): void {
    const context = this.context
    const source = this.menuScoreSource
    const buffer = this.menuScoreBuffer
    if (!source) return

    if (rememberOffset && context && buffer && buffer.duration > 0) {
      this.menuScoreOffset = (this.menuScoreOffset + Math.max(0, context.currentTime - this.menuScoreStartedAt)) % buffer.duration
    }
    try {
      source.stop()
    } catch {
      // Source can already be stopped during teardown.
    }
    source.disconnect()
    this.menuScoreSource = null
  }

  private createNoiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(context.sampleRate * seconds)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const channel = buffer.getChannelData(0)
    let previous = 0
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1
      previous = previous * 0.985 + white * 0.015
      channel[index] = white * 0.66 + previous * 1.7
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
