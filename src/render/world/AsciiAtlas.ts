import * as THREE from 'three'

const GLYPHS = [
  ' ', '.', '`', '-', ':', ';', '!', 'i',
  'l', 'I', '|', '/', '\\', '(', ')', '1',
  '+', '=', '~', '*', 'r', 'c', 'v', 'x',
  'z', 'u', 'n', 's', 'o', 'a', 'e', 'w',
  'p', 'q', 'd', 'b', 'k', 'h', 'm', 'j',
  '%', '&', '$', '0', '8', 'Q', 'O', 'D',
  'B', 'W', 'M', 'N', '#', '@', 'M', 'W',
  'B', '8', '&', '%', '#', '@', 'W', '@',
] as const

export function createAsciiAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  const grid = 8
  const cell = 96
  canvas.width = grid * cell
  canvas.height = grid * cell

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ASCII atlas canvas is unavailable')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.font = `700 ${Math.floor(cell * 0.82)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'

  for (let i = 0; i < GLYPHS.length; i += 1) {
    const col = i % grid
    const row = Math.floor(i / grid)
    ctx.fillText(GLYPHS[i] ?? ' ', col * cell + cell * 0.5, row * cell + cell * 0.53)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
