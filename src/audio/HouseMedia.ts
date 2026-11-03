// Optional local media: ignored assets may be absent on a clean checkout.
const television = import.meta.glob<string>('/src/assets/xTwTStroCE6hzlFHBkqL+xl5GT3EeYgk.mp4', { eager: true, query: '?url', import: 'default' })
export const HOUSE_TV_VIDEO = Object.values(television)[0]
export const RADIO_MEDIA = import.meta.glob<string>('/src/assets/radio/*.{mp3,ogg,wav,m4a}', { eager: true, query: '?url', import: 'default' })
export function radioMediaFor(id: string): string | undefined {
  return Object.entries(RADIO_MEDIA).find(([path]) => path.split('/').at(-1)?.replace(/\.[^.]+$/, '') === id)?.[1]
}
