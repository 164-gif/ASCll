import { HOUSE_TV_AUDIO } from './HouseMedia'
import { HouseRadioAudio } from './HouseRadioAudio'
import { AudioSettings, type AudioSettingsState } from '../core/AudioSettings'
import type { WorldState } from '../simulation/WorldState'
import { bridgeDeckHeightAt, isInsideRiver, riverSignedDistance } from '../world/WorldLayout'

type AudioScene = 'menu' | 'world'
type Surface = 'grass' | 'water' | 'stone'

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

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
  private fireGain: GainNode | null = null
  private dangerGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private menuScoreBuffer: AudioBuffer | null = null
  private menuScoreLoad: Promise<void> | null = null
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
  private nextTypingAt = 0
  private houseRadio: HouseRadioAudio | null = null
  private televisionVideo: HTMLVideoElement | null = null
  private readonly televisionAudio = document.createElement('audio')
  private televisionChannel = -1
  private televisionAudioRequested = false
  private televisionAudioFailed = false
  private televisionAttempt = 0
  private readonly handleTelevisionPause = (): void => {
    this.televisionAttempt++
    this.televisionAudio.pause(); this.televisionAudioRequested = false
  }
  private readonly handleTelevisionError = (): void => {
    this.televisionAttempt++
    this.televisionAudioFailed = true; this.televisionAudioRequested = false
    this.televisionAudio.pause()
    if (this.televisionVideo) this.televisionVideo.muted = false
  }
  private readonly handleHouseVideo = (event: Event): void => {
    this.detachTelevision()
    this.televisionVideo = (event as CustomEvent<HTMLVideoElement | null>).detail
    if (this.televisionVideo) {
      // Native media playback does not depend on AudioContext or its autoplay state.
      this.televisionVideo.muted = false
      this.televisionVideo.addEventListener('pause', this.handleTelevisionPause)
      this.televisionVideo.addEventListener('waiting', this.handleTelevisionPause)
      this.televisionChannel = -1
      this.applyTelevisionVolume()
    }
  }

  private detachTelevision(): void {
    this.televisionVideo?.removeEventListener('pause', this.handleTelevisionPause)
    this.televisionVideo?.removeEventListener('waiting', this.handleTelevisionPause)
    this.handleTelevisionPause()
    this.televisionAudio.removeAttribute('src'); this.televisionAudio.load()
    this.televisionVideo = null; this.televisionChannel = -1
  }

  private applyTelevisionVolume(): void {
    const volume = document.hidden && this.settings.muteWhenHidden ? 0 : this.settings.master * this.settings.effects
    this.televisionAudio.volume = volume
    if (this.televisionVideo) this.televisionVideo.volume = volume
  }

  syncTelevision(world: WorldState, fromGesture = false): void {
    const video = this.televisionVideo
    if (!video || world.chapter !== 'awakening') return
    const channel = world.house.tvChannel
    if (channel !== this.televisionChannel) {
      this.handleTelevisionPause(); this.televisionChannel = channel; this.televisionAudioFailed = false
      const url = HOUSE_TV_AUDIO[channel]
      if (url) this.televisionAudio.src = url
      else this.televisionAudio.removeAttribute('src')
      this.televisionAudio.load()
    }
    const hasTrack = !!HOUSE_TV_AUDIO[channel] && !this.televisionAudioFailed
    video.muted = hasTrack
    if (!hasTrack || !world.house.tvOn || video.paused || document.hidden || video.readyState < 3) {
      if (!this.televisionAudio.paused || this.televisionAudioRequested) this.handleTelevisionPause()
      return
    }
    if (this.televisionAudio.readyState >= 1 && Math.abs(this.televisionAudio.currentTime - video.currentTime) > 0.18) {
      this.televisionAudio.currentTime = video.currentTime
    }
    this.televisionAudio.playbackRate = video.playbackRate
    if (fromGesture && this.televisionAudio.paused) this.televisionAudioRequested = false
    if (!this.televisionAudioRequested) {
      this.televisionAudioRequested = true
      const attempt = ++this.televisionAttempt
      void this.televisionAudio.play().catch(() => {
        if (attempt === this.televisionAttempt && this.televisionVideo === video) this.handleTelevisionError()
      })
    }
  }

  resumeFromGesture(): void {
    if (!this.context) this.buildGraph()
    if (this.context?.state === 'suspended') void this.context.resume()
  }

  private readonly handleSettings = (event: Event): void => {
    const custom = event as CustomEvent<AudioSettingsState>
    this.settings = custom.detail
    this.applySettings(); this.applyTelevisionVolume()
  }

  private readonly handleVisibility = (): void => {
    this.applySettings(); this.applyTelevisionVolume()
  }

  constructor() {
    this.televisionAudio.preload = 'auto'; this.televisionAudio.loop = true
    this.televisionAudio.addEventListener('error', this.handleTelevisionError)
    window.addEventListener('ascii:house-video', this.handleHouseVideo)
    window.addEventListener('ascii:audio-settings', this.handleSettings)
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  async unlock(): Promise<void> {
    if (!this.context) this.buildGraph()
    const context = this.context
    if (!context) return

    if (context.state === 'suspended') await context.resume()
    this.applySettings(true)
    await this.loadMenuScore()
    if (this.scene === 'menu') this.startMenuScore()
  }

  dialogueTyping(): void {
    const context = this.context
    if (!context || context.currentTime < this.nextTypingAt) return
    this.nextTypingAt = context.currentTime + 0.075
    const frequency = 760 + Math.random() * 130
    this.playTone(frequency, frequency * 0.92, 0.025, 0.009, 'sine')
  }

  phoneSound(kind: string, digit?: string): void {
    if (kind === 'typing') { this.dialogueTyping(); return }
    if (kind === 'digit') {
      const keys = ['123', '456', '789', '*0#']
      const row = keys.findIndex((line) => line.includes(digit ?? ''))
      const col = row < 0 ? -1 : keys[row]!.indexOf(digit ?? '')
      if (row < 0 || col < 0) return
      const low = [697, 770, 852, 941][row]!, high = [1209, 1336, 1477][col]!
      this.playTone(low, low, 0.09, 0.018, 'sine'); this.playTone(high, high, 0.09, 0.012, 'sine')
    } else if (kind === 'ring') {
      this.playTone(425, 425, 0.65, 0.022, 'sine')
    } else if (kind === 'lift' || kind === 'hangup') {
      this.playTone(kind === 'lift' ? 480 : 230, kind === 'lift' ? 320 : 120, 0.08, 0.018, 'triangle')
    }
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
    this.houseRadio?.destroy(); this.houseRadio = null
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

    if (world.chapter === 'awakening') {
      this.setTarget(this.riverGain, 0, 0.25); this.setTarget(this.windGain, 0, 0.25)
      this.setTarget(this.fireGain, 0, 0.25); this.setTarget(this.dangerGain, 0, 0.25)
      if (!this.houseRadio && this.worldSceneGain && this.noiseBuffer) this.houseRadio = new HouseRadioAudio(context, this.worldSceneGain, this.noiseBuffer)
      this.houseRadio?.update(world)
      if (moved > 0.001 && moved < 1) {
        this.footstepDistance += moved
        if (this.footstepDistance > 1.4) { this.footstepDistance = 0; this.playFootstep('stone', false) }
      }
      return
    }

    const onBridge = bridgeDeckHeightAt(world.player.x, world.player.z) !== null
    const inWater = !world.interior && isInsideRiver(world.player.x, world.player.z) && !onBridge
    const zone = world.currentZone.id
    const riverDistance = Math.abs(riverSignedDistance(world.player.x, world.player.z))
    const nearRiver = clamp01(1 - riverDistance / 30)

    this.setTarget(this.riverGain, world.interior ? 0 : inWater ? 0.34 : 0.035 + nearRiver * 0.23, 0.35)
    const windBase = zone === 'highland' ? 0.2 : zone === 'forest' ? 0.07 : zone === 'meadow' ? 0.1 : 0.13
    const windBreath = 0.78 + Math.sin(world.elapsed * 0.19) * 0.16 + Math.sin(world.elapsed * 0.071) * 0.08
    this.setTarget(this.windGain, world.interior ? 0.012 : windBase * windBreath, 0.7)

    this.setTarget(this.fireGain, world.torchOn ? 0.035 : 0, 0.16)

    let nearestEnemy = Number.POSITIVE_INFINITY
    for (const enemy of world.enemies) {
      nearestEnemy = Math.min(nearestEnemy, Math.hypot(enemy.x - world.player.x, enemy.z - world.player.z))
    }
    const danger = !world.interior && nearestEnemy < 9 ? clamp01((9 - nearestEnemy) / 8) * 0.045 : 0
    this.setTarget(this.dangerGain, danger, 0.45)

    if (moved > 0.001 && moved < 2) {
      this.footstepDistance += moved
      const stride = speed > 5.4 ? 1.18 : 1.48
      if (this.footstepDistance >= stride) {
        this.footstepDistance %= stride
        const surface: Surface = inWater ? 'water' : world.interior || onBridge || zone === 'ruins' || zone === 'highland' ? 'stone' : 'grass'
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
    this.houseRadio?.destroy(); this.houseRadio = null
    this.detachTelevision()
    this.televisionAudio.removeEventListener('error', this.handleTelevisionError)
    window.removeEventListener('ascii:house-video', this.handleHouseVideo)
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

    this.riverGain = this.createLoopingNoise(worldSceneGain, 'lowpass', 1900, 0.72)
    this.windGain = this.createLoopingNoise(worldSceneGain, 'bandpass', 520, 0.55)
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

  private async loadMenuScore(): Promise<void> {
    if (this.menuScoreBuffer) return
    if (this.menuScoreLoad) return this.menuScoreLoad

    const context = this.context
    if (!context) return

    this.menuScoreLoad = fetch(new URL('../../measured_in_pale_glass.mp3', import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`Menu music request failed: ${response.status}`)
        return response.arrayBuffer()
      })
      .then((audioData) => context.decodeAudioData(audioData))
      .then((buffer) => {
        if (this.context === context) this.menuScoreBuffer = buffer
      })
      .catch((error: unknown) => {
        this.menuScoreLoad = null
        console.error('Could not load menu music.', error)
      })

    return this.menuScoreLoad
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
      this.playTone(92, 68, 0.08, running ? 0.012 : 0.009, 'sine')
      return
    }

    if (surface === 'stone') {
      this.playTone(170, 105, 0.055, running ? 0.012 : 0.008, 'triangle')
      return
    }

    this.playTone(115, 72, 0.075, running ? 0.01 : 0.007, 'sine')
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
