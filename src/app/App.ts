import '../audio-entry.css'
import { AudioDirector } from '../audio/AudioDirector'
import { FullscreenController } from '../core/FullscreenController'
import { GameSession } from '../game/GameSession'
import { GlyphBackdrop } from '../render/menu/GlyphBackdrop'
import { BootSequence } from '../ui/boot/BootSequence'
import { EntryGate } from '../ui/entry/EntryGate'
import { MainMenu } from '../ui/menu/MainMenu'
import type { GameChapter } from '../simulation/WorldState'

export class App {
  private readonly shell: HTMLDivElement
  private readonly backdrop: GlyphBackdrop
  private readonly fullscreen = new FullscreenController()
  private readonly audio = new AudioDirector()
  private readonly menu: MainMenu
  private readonly boot: BootSequence
  private readonly entry: EntryGate
  private session: GameSession | null = null
  private worldStartTimer = 0

  private readonly handleNewGame = (): void => {
    this.enterWorld()
  }
  private readonly handleChapterTwo = (): void => { this.enterWorld('awakening') }

  constructor(root: HTMLElement) {
    this.shell = document.createElement('div')
    this.shell.className = 'game-shell'
    root.append(this.shell)

    this.backdrop = new GlyphBackdrop(this.shell)
    this.menu = new MainMenu(this.fullscreen, (enabled) => this.backdrop.setAmbientMotion(enabled), this.audio)
    this.shell.append(this.menu.element)
    this.boot = new BootSequence(this.shell)
    this.entry = new EntryGate(this.shell)

    window.addEventListener('ascii:new-game', this.handleNewGame)
    window.addEventListener('ascii:start-chapter-two', this.handleChapterTwo)
  }

  async start(): Promise<void> {
    this.backdrop.start()
    await this.entry.wait(() => {
      void this.audio.unlock()
    })
    this.audio.bootStart()
    await this.boot.play(() => {
      this.audio.menuReveal()
      this.menu.reveal()
    })
  }

  destroy(): void {
    window.removeEventListener('ascii:new-game', this.handleNewGame)
    window.removeEventListener('ascii:start-chapter-two', this.handleChapterTwo)
    if (this.worldStartTimer) window.clearTimeout(this.worldStartTimer)
    this.worldStartTimer = 0
    this.session?.destroy()
    this.session = null
    this.entry.destroy()
    this.boot.destroy()
    this.menu.destroy()
    this.audio.destroy()
    this.fullscreen.destroy()
    this.backdrop.destroy()
    this.shell.remove()
  }

  private enterWorld(chapter: GameChapter = 'valley'): void {
    if (this.session || this.worldStartTimer) return
    this.audio.beginWorldTransition()

    this.menu.setActive(false)
    this.menu.element.classList.add('main-menu--game-hidden')
    this.backdrop.element.classList.add('glyph-backdrop--game-hidden')

    this.worldStartTimer = window.setTimeout(() => {
      this.worldStartTimer = 0
      if (this.session) return
      this.session = new GameSession(this.shell, this.audio, () => this.leaveWorld(), chapter)
      this.session.start()
    }, 1120)
  }

  private leaveWorld(): void {
    if (!this.session) return
    this.session.destroy()
    this.session = null
    this.audio.enterMenu()

    requestAnimationFrame(() => {
      this.menu.element.classList.remove('main-menu--game-hidden')
      this.backdrop.element.classList.remove('glyph-backdrop--game-hidden')
      this.menu.setActive(true)
    })
  }
}
