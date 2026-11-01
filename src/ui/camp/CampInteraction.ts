import type { WorldState } from '../../simulation/WorldState'
import { TOWN_BUILDINGS, townBuildingDoor } from '../../world/WorldLayout'
import { FOREST_CAMP_OLD_MAN, FOREST_CAMP_TENT_ENTRY } from '../../world/ForestCamp'

const INTERACT_DISTANCE = 2.15

export class CampInteraction {
  readonly element: HTMLElement

  private readonly prompt: HTMLElement
  private readonly dialogue: HTMLElement
  private readonly dialogueName: HTMLElement
  private readonly dialogueText: HTMLElement
  private readonly tent: HTMLElement
  private readonly tentStatus: HTMLElement
  private mode: 'none' | 'dialogue' | 'tent' = 'none'
  private dialogueIndex = 0
  private sleeping = false
  private sleepTimer = 0

  private activeLines: readonly string[] = []
  private currentWorld: WorldState | null = null

  private readonly lines = [
    'С дороги пришёл? Тогда не стой на ветру. Костёр общий.',
    'Лес здесь старый. Если услышишь шаги в траве, а трава не шевелится — не оборачивайся.',
    'В шатре есть свободная лежанка. Можешь переночевать, если не боишься чужих снов.',
  ]

  constructor(parent: HTMLElement) {
    this.element = document.createElement('section')
    this.element.className = 'camp-interaction'
    this.element.innerHTML = `
      <div class="camp-interaction__prompt" aria-live="polite"></div>
      <div class="camp-dialogue" role="dialog" aria-modal="true" aria-label="Разговор" aria-hidden="true">
        <div class="camp-dialogue__panel">
          <div class="camp-dialogue__eyebrow"><span>:: голоса долины</span><span data-page></span></div>
          <div class="camp-dialogue__body"><pre class="camp-dialogue__portrait" aria-hidden="true">  .--.
 / :: \
 | .. |
 /|__|\
/______\</pre><div>
          <span class="camp-dialogue__name"></span>
          <p class="camp-dialogue__text"></p>
          </div></div><div class="camp-dialogue__actions">
          <button type="button" data-next>[ E ] дальше →</button><button type="button" data-close>[ ESC ] закончить</button></div>
        </div>
      </div>
      <div class="tent-interior" aria-hidden="true">
        <div class="tent-interior__vignette"></div>
        <div class="tent-interior__canvas" aria-label="Внутри шатра">
          <pre class="tent-interior__ascii" aria-hidden="true">       /\\                /\\
      /..\\______________/..\\
     /....\\            /....\\
    /......\\__________/......\\
   | :::::      *       :::::  |
   | ::::     _/|\\_      :::  |
   | ::      /____\\       ::  |
   |         [====]            |
   |   ___   [====]   ___      |
   |__/___\\_________/___\\____|</pre>
          <div class="tent-interior__lantern" aria-hidden="true">✦</div>
          <div class="tent-interior__bed" aria-hidden="true">
            <span class="tent-interior__pillow"></span>
            <span class="tent-interior__blanket"></span>
          </div>
          <div class="tent-interior__copy">
            <span class="tent-interior__title">внутри шатра</span>
            <strong class="tent-interior__status">E · лечь спать</strong>
            <span>ESC · выйти наружу</span>
          </div>
        </div>
        <div class="tent-interior__sleep"></div>
      </div>
    `

    const prompt = this.element.querySelector<HTMLElement>('.camp-interaction__prompt')
    const dialogue = this.element.querySelector<HTMLElement>('.camp-dialogue')
    const dialogueName = this.element.querySelector<HTMLElement>('.camp-dialogue__name')
    const dialogueText = this.element.querySelector<HTMLElement>('.camp-dialogue__text')
    const tent = this.element.querySelector<HTMLElement>('.tent-interior')
    const tentStatus = this.element.querySelector<HTMLElement>('.tent-interior__status')
    if (!prompt || !dialogue || !dialogueName || !dialogueText || !tent || !tentStatus) {
      throw new Error('Camp interaction UI is unavailable')
    }

    this.prompt = prompt
    this.dialogue = dialogue
    this.dialogueName = dialogueName
    this.dialogueText = dialogueText
    this.tent = tent
    this.tentStatus = tentStatus
    parent.append(this.element)
    this.element.querySelector('[data-next]')?.addEventListener('click', this.handleNext)
    this.element.querySelector('[data-close]')?.addEventListener('click', this.handleClose)
  }

  get isModal(): boolean {
    return this.mode !== 'none'
  }

  update(world: WorldState): void {
    this.currentWorld = world
    if (this.mode !== 'none') {
      this.prompt.textContent = ''
      this.prompt.classList.remove('camp-interaction__prompt--visible')
      return
    }

    if (world.interior) {
      this.setPrompt(world.canExitInterior ? 'E · выйти из ' + world.interior.name : '')
      return
    }
    const resident = this.nearbyResident(world)
    if (resident) { this.setPrompt(`E · ${resident.name} / ${resident.role}`); return }
    const building = this.nearbyBuilding(world)
    if (building) { this.setPrompt(`E · войти: ${building.name}`); return }

    const oldManDistance = Math.hypot(world.player.x - FOREST_CAMP_OLD_MAN.x, world.player.z - FOREST_CAMP_OLD_MAN.z)
    const tentDistance = Math.hypot(world.player.x - FOREST_CAMP_TENT_ENTRY.x, world.player.z - FOREST_CAMP_TENT_ENTRY.z)

    if (oldManDistance <= INTERACT_DISTANCE && oldManDistance <= tentDistance + 0.35) {
      this.prompt.textContent = 'E · поговорить с седым странником'
      this.prompt.classList.add('camp-interaction__prompt--visible')
      return
    }

    if (tentDistance <= INTERACT_DISTANCE + 0.35) {
      this.prompt.textContent = 'E · войти в шатёр'
      this.prompt.classList.add('camp-interaction__prompt--visible')
      return
    }

    this.prompt.textContent = ''
    this.prompt.classList.remove('camp-interaction__prompt--visible')
  }

  interact(world: WorldState): void {
    if (this.mode === 'dialogue') {
      this.dialogueIndex += 1
      if (this.dialogueIndex >= this.activeLines.length) {
        this.close()
        return
      }
      this.dialogueText.textContent = this.activeLines[this.dialogueIndex] ?? ''
      this.updatePage()
      return
    }

    if (this.mode === 'tent') {
      if (!this.sleeping) this.sleep(world)
      return
    }

    if (world.interior) { world.exitInterior(); return }
    const resident = this.nearbyResident(world)
    if (resident) { this.openDialogue(`${resident.name} · ${resident.role}`, resident.lines); return }
    const building = this.nearbyBuilding(world)
    if (building) { world.enterBuilding(building.id); return }

    const oldManDistance = Math.hypot(world.player.x - FOREST_CAMP_OLD_MAN.x, world.player.z - FOREST_CAMP_OLD_MAN.z)
    const tentDistance = Math.hypot(world.player.x - FOREST_CAMP_TENT_ENTRY.x, world.player.z - FOREST_CAMP_TENT_ENTRY.z)

    if (oldManDistance <= INTERACT_DISTANCE && oldManDistance <= tentDistance + 0.35) {
      this.openDialogue()
      return
    }

    if (tentDistance <= INTERACT_DISTANCE + 0.35) this.enterTent()
  }

  close(): void {
    if (this.sleepTimer) {
      window.clearTimeout(this.sleepTimer)
      this.sleepTimer = 0
    }
    this.sleeping = false
    this.mode = 'none'
    this.dialogue.classList.remove('camp-dialogue--open')
    this.dialogue.setAttribute('aria-hidden', 'true')
    this.tent.classList.remove('tent-interior--open', 'tent-interior--sleeping')
    this.tent.setAttribute('aria-hidden', 'true')
    this.tentStatus.textContent = 'E · лечь спать'
    this.element.dispatchEvent(new Event('interaction:change', { bubbles: true }))
  }

  destroy(): void {
    this.close()
    this.element.querySelector('[data-next]')?.removeEventListener('click', this.handleNext)
    this.element.querySelector('[data-close]')?.removeEventListener('click', this.handleClose)
    this.element.remove()
  }

  private openDialogue(name = 'седой странник', lines: readonly string[] = this.lines): void {
    this.activeLines = lines
    this.mode = 'dialogue'
    this.dialogueIndex = 0
    this.dialogueName.textContent = name
    this.dialogueText.textContent = lines[0] ?? ''
    this.updatePage()
    this.dialogue.classList.add('camp-dialogue--open')
    this.dialogue.setAttribute('aria-hidden', 'false')
    this.dialogue.querySelector<HTMLButtonElement>('[data-next]')?.focus()
  }

  private readonly handleNext = (): void => { if (this.currentWorld) this.interact(this.currentWorld) }
  private readonly handleClose = (): void => { this.close() }

  private updatePage(): void {
    const page = this.element.querySelector('[data-page]')
    if (page) page.textContent = `${String(this.dialogueIndex + 1).padStart(2, '0')} / ${String(this.activeLines.length).padStart(2, '0')}`
  }

  private setPrompt(text: string): void {
    this.prompt.textContent = text
    this.prompt.classList.toggle('camp-interaction__prompt--visible', !!text)
  }

  private nearbyResident(world: WorldState) {
    return world.residents.filter((resident) => Math.hypot(resident.x - world.player.x, resident.z - world.player.z) < 2.5)
      .sort((a, b) => Math.hypot(a.x - world.player.x, a.z - world.player.z) - Math.hypot(b.x - world.player.x, b.z - world.player.z))[0]
  }

  private nearbyBuilding(world: WorldState) {
    return TOWN_BUILDINGS.find((building) => {
      if (building.kind === 'house') return false
      const door = townBuildingDoor(building)
      return Math.hypot(world.player.x - door[0], world.player.z - door[1]) < 2.6
    })
  }

  private enterTent(): void {
    this.mode = 'tent'
    this.sleeping = false
    this.tentStatus.textContent = 'E · лечь спать'
    this.tent.classList.add('tent-interior--open')
    this.tent.setAttribute('aria-hidden', 'false')
  }

  private sleep(world: WorldState): void {
    this.sleeping = true
    this.tentStatus.textContent = 'сон...'
    this.tent.classList.add('tent-interior--sleeping')
    world.player.hp = 100
    world.player.stamina = 100

    this.sleepTimer = window.setTimeout(() => {
      this.sleepTimer = 0
      this.sleeping = false
      this.tent.classList.remove('tent-interior--sleeping')
      this.tentStatus.textContent = 'ты выспался · E поспать ещё'
    }, 1150)
  }
}
