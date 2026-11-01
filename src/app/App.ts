import { FullscreenController } from '../core/FullscreenController'
import { GlyphBackdrop } from '../render/menu/GlyphBackdrop'
import { MainMenu } from '../ui/menu/MainMenu'

export class App {
  private readonly shell: HTMLDivElement
  private readonly backdrop: GlyphBackdrop
  private readonly fullscreen = new FullscreenController()
  private readonly menu: MainMenu

  constructor(root: HTMLElement) {
    this.shell = document.createElement('div')
    this.shell.className = 'game-shell'
    root.append(this.shell)

    this.backdrop = new GlyphBackdrop(this.shell)
    this.menu = new MainMenu(this.fullscreen, (enabled) => this.backdrop.setAmbientMotion(enabled))
    this.shell.append(this.menu.element)
  }

  start(): void {
    this.backdrop.start()
  }

  destroy(): void {
    this.menu.destroy()
    this.fullscreen.destroy()
    this.backdrop.destroy()
    this.shell.remove()
  }
}
