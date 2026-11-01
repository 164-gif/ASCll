export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'fog'
export type EnvironmentState = { hour: number; daylight: number; weather: WeatherKind; label: string; rain: number; fog: number; cloud: number }
const WEATHER = [
  { kind: 'clear', label: 'ясно', duration: 240, rain: 0, fog: 0.003, cloud: 0 },
  { kind: 'overcast', label: 'пасмурно', duration: 210, rain: 0, fog: 0.011, cloud: 0.65 },
  { kind: 'rain', label: 'дождь', duration: 270, rain: 1, fog: 0.02, cloud: 1 },
  { kind: 'fog', label: 'туман', duration: 200, rain: 0, fog: 0.065, cloud: 0.45 },
] as const
const PERIOD = WEATHER.reduce((sum, item) => sum + item.duration, 0)

export function environmentAt(elapsed: number): EnvironmentState {
  const hour = (8 + elapsed / 60) % 24
  let phase = elapsed % PERIOD
  let index = 0
  while (phase >= WEATHER[index]!.duration) { phase -= WEATHER[index]!.duration; index += 1 }
  const weather = WEATHER[index]!
  const previous = elapsed < 15 ? weather : WEATHER[(index + WEATHER.length - 1) % WEATHER.length]!
  const linear = Math.min(1, phase / 15)
  const blend = linear * linear * (3 - 2 * linear)
  const mix = (a: number, b: number): number => a + (b - a) * blend
  return {
    hour,
    daylight: Math.max(0.06, Math.min(1, Math.sin((hour - 6) / 12 * Math.PI) * 0.65 + 0.35)),
    weather: weather.kind, label: weather.label,
    rain: mix(previous.rain, weather.rain), fog: mix(previous.fog, weather.fog), cloud: mix(previous.cloud, weather.cloud),
  }
}
