export type RadioKind = 'voice' | 'music' | 'scream'
export type RadioStation = { id: string; frequency: number; width: number; kind: RadioKind; message?: string }

// kHz. Broad interference surrounds very narrow, intelligible carrier signals.
export const RADIO_STATIONS: readonly RadioStation[] = [
  { id: 'voices-1', frequency: 683.2, width: 2.3, kind: 'voice' },
  { id: 'warning', frequency: 736.4, width: 0.8, kind: 'voice', message: '...не открывай дверь. Если снаружи назовут твоё имя — не отвечай...' },
  { id: 'music-1', frequency: 907.8, width: 1.6, kind: 'music' },
  { id: 'numbers', frequency: 1062.7, width: 0.65, kind: 'voice', message: '...три знака. Ты их уже видел. Это не первый раз, когда ты проснулся...' },
  { id: 'screams-1', frequency: 1193.5, width: 2.1, kind: 'scream' },
  { id: 'music-2', frequency: 1377.3, width: 1.4, kind: 'music' },
  { id: 'home', frequency: 1471.2, width: 0.7, kind: 'voice', message: '...радио ещё работает. Держи свет включённым. Мы попробуем выйти на связь снова...' },
  { id: 'screams-2', frequency: 1580.6, width: 1.9, kind: 'scream' },
]
export const RADIO_MIN = 530
export const RADIO_MAX = 1710
export const RADIO_LOCK_SECONDS = 8
export function radioReception(frequency: number) {
  const station = RADIO_STATIONS.reduce((best, next) => Math.abs(frequency - next.frequency) < Math.abs(frequency - best.frequency) ? next : best)
  const distance = Math.abs(frequency - station.frequency)
  return { station: distance < 14 ? station : undefined, quality: Math.max(0, 1 - distance / station.width), interference: Math.max(0, 1 - distance / 14) }
}
