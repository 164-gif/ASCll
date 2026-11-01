import { FullscreenController } from '../core/FullscreenController'
import { GlyphBackdrop } from '../render/menu/GlyphBackdrop'
import { BootSequence } from '../ui/boot/BootSequence'
import { MainMenu } from '../ui/menu/MainMenu'

export class App {
  private readonly shell: HTMLDivElement
  private readonly backdrop: GlyphBackdrop
  private readonly fullscreen = new FullscreenController()
  private readonly menu: MainMenu
  private readonly boot: BootSequence

  constructor(root: HTMLElement) {
    this.shell = document.createElement('div')
    this.shell.className = 'game-shell'
    root.append(this.shell)

    this.backdrop = new GlyphBackdrop(this.shell)
    this.menu = new MainMenu(this.fullscreen, (enabled) => this.backdrop.setAmbientMotion(enabled))
    this.shell.append(this.menu.element)
    this.boot = new BootSequence(this.shell)
  }

  async start(): Promise<void> {
    this.backdrop.start()
    await this.boot.play()
    this.menu.reveal()
  }

  destroy(): void {
    this.boot.destroy()
    this.menu.destroy()
    this.fullscreen.destroy()
    this.backdrop.destroy()
    this.shell.remove()
  }
}
