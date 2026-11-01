import { FullscreenController } from '../core/FullscreenController'
import { GameSession } from '../game/GameSession'
import { GlyphBackdrop } from '../render/menu/GlyphBackdrop'
import { BootSequence } from '../ui/boot/BootSequence'
import { MainMenu } from '../ui/menu/MainMenu'

export class App {
  private readonly shell: HTMLDivElement
  private readonly backdrop: GlyphBackdrop
  private readonly fullscreen = new FullscreenController()
  private readonly menu: MainMenu
  private readonly boot: BootSequence
  private session: GameSession | null = null

  private readonly handleNewGame = (): void => {
    this.enterWorld()
  }

  constructor(root: HTMLElement) {
    this.shell = document.createElement('div')
    this.shell.className = 'game-shell'
    root.append(this.shell)

    this.backdrop = new GlyphBackdrop(this.shell)
    this.menu = new MainMenu(this.fullscreen, (enabled) => this.backdrop.setAmbientMotion(enabled))
    this.shell.append(this.menu.element)
    this.boot = new BootSequence(this.shell)

    window.addEventListener('ascii:new-game', this.handleNewGame)
  }

  async start(): Promise<void> {
    this.backdrop.start()
    await this.boot.play()
    this.menu.reveal()
  }

  destroy(): void {
    window.removeEventListener('ascii:new-game', this.handleNewGame)
    this.session?.destroy()
    this.session = null
    this.boot.destroy()
    this.menu.destroy()
    this.fullscreen.destroy()
    this.backdrop.destroy()
    this.shell.remove()
  }

  private enterWorld(): void {
    if (this.session) return

    this.menu.element.classList.add('main-menu--game-hidden')
    this.backdrop.element.classList.add('glyph-backdrop--game-hidden')

    window.setTimeout(() => {
      if (this.session) return
      this.session = new GameSession(this.shell, () => this.leaveWorld())
      this.session.start()
    }, 360)
  }

  private leaveWorld(): void {
    if (!this.session) return
    this.session.destroy()
    this.session = null

    requestAnimationFrame(() => {
      this.menu.element.classList.remove('main-menu--game-hidden')
      this.backdrop.element.classList.remove('glyph-backdrop--game-hidden')
    })
  }
}
