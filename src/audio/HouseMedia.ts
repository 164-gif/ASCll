// Optional local media: ignored assets may be absent on a clean checkout.
const television = import.meta.glob<string>('/src/assets/{xTwTStroCE6hzlFHBkqL+xl5GT3EeYgk,hfVf7uZseQT3kUXZ9Vmg+CW3BMvu1BOE}.mp4', { eager: true, query: '?url', import: 'default' })
const tvFile = (filename: string): string | undefined => Object.entries(television).find(([path]) => path.endsWith(`/${filename}`))?.[1]
export const HOUSE_TV_CHANNELS: readonly (string | undefined)[] = [
  tvFile('xTwTStroCE6hzlFHBkqL+xl5GT3EeYgk.mp4'),
  tvFile('hfVf7uZseQT3kUXZ9Vmg+CW3BMvu1BOE.mp4'),
  undefined, // emergency broadcast generated in-game
]
export const RADIO_MEDIA = import.meta.glob<string>('/src/assets/radio/*.{mp3,ogg,wav,m4a}', { eager: true, query: '?url', import: 'default' })
export function radioMediaFor(id: string): string | undefined {
  return Object.entries(RADIO_MEDIA).find(([path]) => path.split('/').at(-1)?.replace(/\.[^.]+$/, '') === id)?.[1]
}
