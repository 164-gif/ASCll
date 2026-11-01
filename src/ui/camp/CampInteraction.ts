import type { WorldState } from '../../simulation/WorldState'
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
      <div class="camp-dialogue" aria-hidden="true">
        <div class="camp-dialogue__panel">
          <span class="camp-dialogue__name"></span>
          <p class="camp-dialogue__text"></p>
          <span class="camp-dialogue__continue">E · дальше &nbsp;&nbsp; ESC · закончить</span>
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
  }

  get isModal(): boolean {
    return this.mode !== 'none'
  }

  update(world: WorldState): void {
    if (this.mode !== 'none') {
      this.prompt.textContent = ''
      this.prompt.classList.remove('camp-interaction__prompt--visible')
      return
    }

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
      if (this.dialogueIndex >= this.lines.length) {
        this.close()
        return
      }
      this.dialogueText.textContent = this.lines[this.dialogueIndex] ?? ''
      return
    }

    if (this.mode === 'tent') {
      if (!this.sleeping) this.sleep(world)
      return
    }

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
  }

  destroy(): void {
    this.close()
    this.element.remove()
  }

  private openDialogue(): void {
    this.mode = 'dialogue'
    this.dialogueIndex = 0
    this.dialogueName.textContent = 'седой странник'
    this.dialogueText.textContent = this.lines[0] ?? ''
    this.dialogue.classList.add('camp-dialogue--open')
    this.dialogue.setAttribute('aria-hidden', 'false')
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
