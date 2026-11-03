import type { WorldState } from '../simulation/WorldState'
import { radioMediaFor } from './HouseMedia'

/** All interference belongs to the receiver, so switching it off also silences the static. */
export class HouseRadioAudio {
  private readonly output: GainNode
  private readonly staticGain: GainNode
  private readonly voiceGain: GainNode
  private readonly carrierGain: GainNode
  private readonly voice: OscillatorNode
  private readonly carrier: OscillatorNode
  private readonly formants: BiquadFilterNode[] = []
  private readonly sources: AudioScheduledSourceNode[] = []
  private readonly media = document.createElement('audio')
  private readonly mediaGain: GainNode
  private readonly mediaSource: MediaElementAudioSourceNode
  private stationId = ''
  private mediaFailed = false
  private playing = false
  constructor(private readonly context: AudioContext, destination: AudioNode, noise: AudioBuffer) {
    this.output = context.createGain(); this.output.gain.value = 0; this.output.connect(destination)
    const noiseSource = context.createBufferSource(); noiseSource.buffer = noise; noiseSource.loop = true
    const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1900; filter.Q.value = 0.45
    this.staticGain = context.createGain(); this.staticGain.gain.value = 0
    noiseSource.connect(filter).connect(this.staticGain).connect(this.output); noiseSource.start(); this.sources.push(noiseSource)
    this.voice = context.createOscillator(); this.voice.type = 'sawtooth'; this.voice.frequency.value = 115
    this.voiceGain = context.createGain(); this.voiceGain.gain.value = 0; this.voiceGain.connect(this.output)
    for (const frequency of [650, 1150, 2600]) {
      const formant = context.createBiquadFilter(); formant.type = 'bandpass'; formant.frequency.value = frequency; formant.Q.value = 5
      this.voice.connect(formant).connect(this.voiceGain); this.formants.push(formant)
    }
    this.voice.start(); this.sources.push(this.voice)
    this.carrier = context.createOscillator(); this.carrier.type = 'sine'
    this.carrierGain = context.createGain(); this.carrierGain.gain.value = 0
    this.carrier.connect(this.carrierGain).connect(this.output); this.carrier.start(); this.sources.push(this.carrier)
    this.media.loop = true; this.media.preload = 'none'
    this.media.addEventListener('error', () => { this.mediaFailed = true })
    this.mediaGain = context.createGain(); this.mediaGain.gain.value = 0
    this.mediaSource = context.createMediaElementSource(this.media); this.mediaSource.connect(this.mediaGain).connect(this.output)
  }
  update(world: WorldState): void {
    const now = this.context.currentTime
    const active = world.chapter === 'awakening' && world.house.radioOn && !document.hidden
    const distance = Math.hypot(world.player.x - 0.8, world.player.z + 5)
    this.output.gain.setTargetAtTime(active ? 0.65 / (1 + distance * 0.18) : 0, now, 0.06)
    if (!active) { if (this.playing) { this.media.pause(); this.playing = false } return }
    const { station, quality, interference } = world.radioSignal
    const kind = station?.kind
    const id = station?.id ?? ''
    if (id !== this.stationId) {
      this.stationId = id; this.media.pause(); this.playing = false; this.mediaFailed = false
      const url = radioMediaFor(id)
      if (url) { this.media.src = url; this.media.load() }
      else { this.media.removeAttribute('src'); this.media.load() }
    }
    const hasMedia = !!radioMediaFor(id) && !this.mediaFailed
    if (hasMedia && !this.playing) { this.playing = true; void this.media.play().catch(() => { this.mediaFailed = true; this.playing = false }) }
    this.mediaGain.gain.setTargetAtTime(hasMedia ? quality * 0.34 : 0, now, 0.08)
    this.staticGain.gain.setTargetAtTime((0.012 + (1 - quality) * 0.055) * (0.87 + Math.sin(now * 13) * 0.1), now, 0.035)
    const envelope = Math.max(0, Math.sin(now * 5.3) * 0.5 + Math.sin(now * 9.7) * 0.3 + 0.2)
    const scream = kind === 'scream'
    const burst = scream ? Math.pow(Math.max(0, Math.sin(now * 0.83)), 5) : envelope
    this.voiceGain.gain.setTargetAtTime(!hasMedia && (kind === 'voice' || scream) ? (0.008 + quality * 0.07) * interference * burst : 0, now, 0.025)
    this.voice.frequency.setTargetAtTime(scream ? 510 + Math.sin(now * 3) * 180 + Math.sin(now * 39) * 25 : 108 + Math.sin(now * 2.7) * 24 + Math.sin(now * 19) * 5, now, 0.025)
    this.formants.forEach((filter, index) => { filter.frequency.setTargetAtTime([650, 1150, 2600][index]! * (1 + Math.sin(now * (index + 3)) * 0.18) * (scream ? 1.5 : 1), now, 0.04) })
    this.carrier.frequency.setTargetAtTime(180 + (1 - interference) * 1400 + Math.sin(now * 0.5) * 12, now, 0.04)
    this.carrierGain.gain.setTargetAtTime((kind === 'music' && !hasMedia ? 0.014 : 0.004) * interference, now, 0.08)
  }
  destroy(): void {
    this.media.pause(); this.media.removeAttribute('src'); this.media.load(); this.mediaSource.disconnect()
    for (const source of this.sources) { source.stop(); source.disconnect() }
    this.output.disconnect()
  }
}
