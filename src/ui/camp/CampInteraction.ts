import { HouseControls } from './HouseControls'
import type { ResidentState, WorldState } from '../../simulation/WorldState'
import { ANOMALY_QUESTS, type AnomalyQuest } from '../../world/Anomalies'
import { ENTERABLE_BUILDINGS, buildingEntrance } from '../../world/Settlement'

type Choice = { label: string; run: () => void }
const TOPICS: Record<string, readonly [string, string]> = {
  guard: ['Где можно остановиться?', 'Что происходит за стенами?'],
  innkeeper: ['Можно зайти в трактир?', 'Что за люди здесь останавливаются?'],
  smith: ['Можно посмотреть кузницу?', 'Почему ворота приходится так часто чинить?'],
  elder: ['Что хранится в ратуше?', 'Как город переживает ночи?'],
  'farmer-west': ['Кому достаётся урожай?', 'Как пройти к воротам?'],
  'farmer-east': ['Когда вы возвращаетесь домой?', 'Где проходит дорога?'],
  potter: ['Где твой дом?', 'Что продаётся на площади?'],
}
const STATUS_LABELS = { locked: 'пока недоступно', available: 'поговори со странником', active: 'найди и исследуй', surveyed: 'вернись с отчётом', completed: 'исследование завершено' }

export class CampInteraction {
  readonly element: HTMLElement
  private readonly houseControls: HouseControls
  private readonly prompt: HTMLButtonElement
  private readonly dialogue: HTMLElement
  private readonly journal: HTMLElement
  private readonly transition: HTMLElement
  private readonly toast: HTMLElement
  private readonly name: HTMLElement
  private readonly text: HTMLElement
  private readonly reply: HTMLElement
  private readonly choiceList: HTMLElement
  private readonly textSizer: HTMLElement
  private readonly speech: HTMLElement
  private readonly accessibleSpeech: HTMLElement
  private typingFrame = 0
  private lineTimer = 0
  private changing = false
  private fullText = ''
  private typing = false
  private choices: Choice[] = []
  private selected = 0
  private world: WorldState | null = null
  private mode: 'none' | 'dialogue' | 'journal' | 'house' = 'none'
  private transitioning = false
  private timers: number[] = []
  private returnFocus: HTMLElement | null = null
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(private readonly parent: HTMLElement) {
    this.element = document.createElement('section')
    this.element.className = 'camp-interaction'
    this.element.innerHTML = `
      <button class="camp-interaction__prompt" type="button" aria-live="polite"></button>
      <button class="camp-interaction__tv-channel" type="button" data-tv-channel hidden></button>
      <button class="journal-open" type="button" data-journal>J · записи</button>
      <div class="camp-dialogue" role="dialog" aria-modal="true" aria-label="Разговор" aria-hidden="true" inert>
        <div class="camp-dialogue__panel">
          <div class="camp-dialogue__eyebrow"><span data-place>разговор</span><button type="button" data-close>ESC · закрыть</button></div>
          <div class="camp-dialogue__body">
            <p class="camp-dialogue__reply" data-reply></p>
            <div class="camp-dialogue__speaker"><span class="camp-dialogue__name"></span><span class="camp-dialogue__role"></span></div>
            <div class="camp-dialogue__speech">
              <p class="camp-dialogue__sizer" aria-hidden="true"></p>
              <p class="camp-dialogue__text" aria-hidden="true"></p>
              <span class="camp-dialogue__accessible" aria-live="polite"></span>
            </div>
          </div>
          <div class="camp-dialogue__choices" aria-label="Варианты ответа"></div>
          <span class="camp-dialogue__hint">↑↓ / 1–5 · выбор &nbsp; E / ENTER · ответить</span>
        </div>
      </div>
      <div class="quest-journal" role="dialog" aria-modal="true" aria-label="Полевые записи" aria-hidden="true" inert>
        <div class="quest-journal__panel">
          <header><div><span class="camp-dialogue__eyebrow">:: полевые записи</span><h2>Следы в долине</h2></div><button type="button" data-close>J / ESC · закрыть</button></header>
          <p class="quest-journal__intro">Странник у костра в тёмной чаще знает о местах, где мир меняется. Возьми поручение, осмотри след клавишей E и принеси ему запись.</p>
          <div data-quests></div>
        </div>
      </div>
      <div class="world-transition" aria-hidden="true"><span></span></div>
      <div class="house-reticle" aria-hidden="true">·</div>
      <div class="quest-toast" role="status" aria-live="polite"></div>`
    this.prompt = this.element.querySelector<HTMLButtonElement>('.camp-interaction__prompt')!
    this.dialogue = this.element.querySelector<HTMLElement>('.camp-dialogue')!
    this.journal = this.element.querySelector<HTMLElement>('.quest-journal')!
    this.transition = this.element.querySelector<HTMLElement>('.world-transition')!
    this.toast = this.element.querySelector<HTMLElement>('.quest-toast')!
    this.name = this.element.querySelector<HTMLElement>('.camp-dialogue__name')!
    this.text = this.element.querySelector<HTMLElement>('.camp-dialogue__text')!
    this.reply = this.element.querySelector<HTMLElement>('[data-reply]')!
    this.textSizer = this.element.querySelector<HTMLElement>('.camp-dialogue__sizer')!
    this.speech = this.element.querySelector<HTMLElement>('.camp-dialogue__speech')!
    this.accessibleSpeech = this.element.querySelector<HTMLElement>('.camp-dialogue__accessible')!
    this.choiceList = this.element.querySelector<HTMLElement>('.camp-dialogue__choices')!
    this.element.addEventListener('click', this.handleClick)
    this.element.addEventListener('focusin', this.handleFocus)
    this.houseControls = new HouseControls(this.element, () => this.close())
    parent.append(this.element)
  }

  get isModal(): boolean { return this.mode !== 'none' || this.transitioning }

  update(world: WorldState): void {
    this.world = world
    if (this.toast.textContent !== world.notice) this.toast.textContent = world.notice
    this.toast.classList.toggle('quest-toast--visible', !this.isModal && world.noticeUntil > world.elapsed)
    this.element.querySelector('.house-reticle')!.classList.toggle('is-visible', world.chapter === 'awakening' && !this.isModal)
    const channelButton = this.element.querySelector<HTMLButtonElement>('[data-tv-channel]')!
    channelButton.hidden = this.isModal || world.chapter !== 'awakening' || !world.house.tvOn || world.houseTarget?.id !== 'television'
    if (!channelButton.hidden) channelButton.textContent = `Q · канал ${world.house.tvChannel + 1} / 3`
    if (this.isModal) { this.setPrompt(''); return }
    if (world.chapter === 'awakening') {
      const target = world.houseTarget
      const action = target?.id === 'radio' ? 'настроить радио' : target?.id === 'television' ? world.house.tvOn ? 'выключить телевизор' : 'включить телевизор' : target?.id === 'door' ? 'посмотреть в глазок' : target?.id === 'fridge' ? 'открыть холодильник' : target?.id === 'bed' ? 'лечь спать' : target?.id === 'note' ? 'прочитать записку' : target?.id === 'lamp' ? world.house.lampOn ? 'погасить лампу' : 'зажечь лампу' : ''
      this.setPrompt(action ? `E · ${action}` : '')
      return
    }
    if (world.canTalkToElder) { this.setPrompt('E · седой странник / поручения'); return }
    if (world.interior) {
      this.setPrompt(world.canExitInterior ? 'E · выйти наружу' : world.canRest ? 'E · отдохнуть на лежанке' : '')
      return
    }
    const anomaly = this.nearbyAnomaly(world)
    if (anomaly) { this.setPrompt(`E · ${world.quests[anomaly.id] === 'active' ? 'исследовать' : 'осмотреть'}: ${anomaly.title}`); return }
    const building = this.nearbyBuilding(world)
    if (building) { this.setPrompt(`E · войти: ${building.name}`); return }
    const resident = this.nearbyResident(world)
    this.setPrompt(resident ? `E · ${resident.name} / ${resident.role}` : '')
  }

  interact(world: WorldState): void {
    this.world = world
    if (this.transitioning) return
    if (this.mode === 'dialogue') { if (this.typing) this.revealText(); else this.choose(this.selected); return }
    if (this.mode === 'journal') return
    if (world.chapter === 'awakening') { this.interactHouse(world); return }
    if (world.canTalkToElder) { this.openElder(); return }
    if (world.interior) {
      if (world.canExitInterior) this.changeScene('наружу', () => world.exitInterior())
      else if (world.canRest) this.changeScene('сон у тёплого фонаря', () => world.restInTent())
      return
    }
    const anomaly = this.nearbyAnomaly(world)
    if (anomaly) {
      const observed = world.inspectAnomaly(anomaly.id)
      this.showDialogue(anomaly.title, observed || ['surveyed', 'completed'].includes(world.quests[anomaly.id]!) ? anomaly.observation : 'Между знаками что-то движется. Стоит сначала поговорить со странником — он знает, что здесь искать.', [
        { label: 'Заглянуть в полевые записи', run: () => this.openJournal(world) },
        { label: 'Отойти от следа', run: () => this.close() },
      ])
      return
    }
    const building = this.nearbyBuilding(world)
    if (building) { this.changeScene(building.name, () => world.enterBuilding(building.id)); return }
    const resident = this.nearbyResident(world)
    if (resident) this.openResident(resident)
  }

  handleKey(event: KeyboardEvent): boolean {
    if (!this.isModal) return false
    if (this.mode === 'house') { this.houseControls.handleKey(event); return true }
    if (event.repeat) return true
    if (['Escape', 'KeyE', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyJ', 'Space'].includes(event.code) || /^Digit[1-5]$/.test(event.code)) event.preventDefault()
    if (this.transitioning) return true
    if (event.code === 'Escape' || (this.mode === 'journal' && event.code === 'KeyJ')) { this.close(); return true }
    if (this.mode === 'dialogue') {
      if (/^Digit[1-5]$/.test(event.code)) this.choose(Number(event.code.slice(-1)) - 1)
      else if (event.code === 'KeyE' || event.code === 'Enter' || event.code === 'Space') { if (this.typing) this.revealText(); else this.choose(this.selected) }
      else if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
        this.selected = (this.selected + (event.code === 'ArrowDown' ? 1 : -1) + this.choices.length) % this.choices.length
        this.syncSelection(); this.choiceList.querySelectorAll<HTMLButtonElement>('button')[this.selected]?.focus()
      }
    }
    if (event.code === 'Tab') {
      const panel = this.mode === 'journal' ? this.journal : this.dialogue
      const buttons = [...panel.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
      const first = buttons[0], last = buttons.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    return true
  }

  toggleJournal(world: WorldState): void {
    if (this.transitioning) return
    if (this.mode === 'journal') this.close()
    else if (this.mode === 'none') this.openJournal(world)
  }

  close(): void {
    if (this.transitioning) return
    this.stopText()
    this.houseControls.close()
    if (this.world) this.world.house.fridgeOpen = false
    this.mode = 'none'
    for (const panel of [this.dialogue, this.journal]) { panel.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); panel.inert = true }
    if (this.returnFocus?.isConnected && !this.element.contains(this.returnFocus) && !this.returnFocus.closest('.main-menu--game-hidden')) this.returnFocus.focus({ preventScroll: true })
    else this.parent.focus({ preventScroll: true })
    this.returnFocus = null; this.changed()
    if (this.world?.awakeningPending) this.changeScene('ты слышишь радио', () => this.world!.beginAwakening(this.reducedMotion), true)
  }

  destroy(): void {
    this.houseControls.destroy()
    this.stopText()
    for (const timer of this.timers) window.clearTimeout(timer)
    this.element.removeEventListener('click', this.handleClick)
    this.element.removeEventListener('focusin', this.handleFocus)
    this.element.remove()
  }

  private openResident(resident: ResidentState): void {
    const topics = TOPICS[resident.id] ?? ['Расскажи о себе', 'Что здесь происходит?']
    const root = (): void => this.showDialogue(`${resident.name} · ${resident.role}`, resident.lines[0]!, [
      ...topics.map((topic, index) => ({ label: topic, run: () => this.showDialogue(`${resident.name} · ${resident.role}`, resident.lines[index + 1] ?? resident.lines[0]!, [
        { label: 'Можно ещё спросить?', run: root }, { label: 'Спасибо. До встречи.', run: () => this.close() },
      ]) })),
      { label: 'До встречи.', run: () => this.close() },
    ])
    root()
  }

  private openElder(): void {
    const world = this.world!
    const current = world.activeQuest
    const offer = ANOMALY_QUESTS.find((quest) => world.quests[quest.id] === 'available')
    const choices: Choice[] = []
    if (current && world.quests[current.id] === 'surveyed') choices.push({ label: `Я нашёл место. Вот записи: «${current.title}»`, run: () => {
      if (!world.completeQuest(current.id)) return
      if (world.awakeningPending) {
        this.showDialogue('Седой · странник', `${current.report}\n\n${current.reward}`, [{ label: 'Я слышу... радио.', run: () => this.close() }]); return
      }
      this.showDialogue('Седой · странник', `${current.report}\n\n${current.reward}`, [
        { label: 'Что-нибудь ещё нужно?', run: () => this.openElder() }, { label: 'До встречи у костра.', run: () => this.close() },
      ])
    } })
    else if (current) choices.push({ label: 'Напомни, где искать.', run: () => this.showDialogue('Седой · странник', current.hint, [
      { label: 'Теперь понятно. Я пойду.', run: () => this.close() }, { label: 'Есть ещё вопрос.', run: () => this.openElder() },
    ]) })
    else if (offer) choices.push({ label: 'У тебя найдётся для меня дело?', run: () => this.offerQuest(offer) })
    choices.push({ label: 'Что это за аномалии?', run: () => this.showDialogue('Седой · странник', 'Мы называем их следами. Ни зверь, ни человек их не оставляет. Кольцо, капля, разрыв — смотри внимательно и записывай. На карте я отмечу область, а точное место тебе подскажут сами знаки.', [
      { label: 'Ты говорил, тебе нужна помощь?', run: () => this.openElder() }, { label: 'Мне пора.', run: () => this.close() },
    ]) }, { label: 'Можно отдохнуть в палатке?', run: () => this.showDialogue('Седой · странник', 'Вход отмечен фонарём и светлыми знаками на земле. Внутри есть лежанка и стол с записями. Ходи свободно; ко мне тоже можешь подойти за советом.', [
      { label: 'Благодарю.', run: () => this.close() }, { label: 'Ещё один вопрос.', run: () => this.openElder() },
    ]) }, { label: 'Я пока пойду.', run: () => this.close() })
    this.showDialogue('Седой · странник', current ? world.quests[current.id] === 'surveyed' ? 'А, вернулся! Ну как, нашёл? Давай сюда записи, посмотрим.' : 'Что-то не получается? Спрашивай. Лучше переспросить здесь, чем потом плутать в лесу.' : offer ? 'Садись ближе, у огня теплее. Есть у меня одно дело, если ты пока никуда не спешишь.' : 'Ну вот, теперь все три записи на месте. Спасибо тебе. Фонарь береги, я с ним полжизни проходил. Если что — заходи.', choices)
  }

  private offerQuest(quest: AnomalyQuest): void {
    this.showDialogue('Седой · странник', `«${quest.title}»\n\n${quest.briefing}`, [
      { label: 'Хорошо. Схожу и посмотрю.', run: () => { if (this.world!.acceptQuest(quest.id)) this.close() } },
      { label: 'Сейчас не возьмусь. Может, позже.', run: () => this.openElder() },
    ])
  }

  private showDialogue(name: string, text: string, choices: Choice[]): void {
    const wasOpen = this.mode === 'dialogue'
    this.rememberFocus(); this.mode = 'dialogue'
    this.journal.classList.remove('is-open'); this.journal.inert = true; this.journal.setAttribute('aria-hidden', 'true')
    this.stopText()
    const render = (): void => {
      this.lineTimer = 0; this.changing = false; this.dialogue.classList.remove('is-changing')
      this.selected = 0; this.choices = choices
      const [speaker, role] = name.split(' · ')
      this.name.textContent = speaker!
      this.dialogue.querySelector('.camp-dialogue__role')!.textContent = role ?? ''
      this.dialogue.querySelector('[data-place]')!.textContent = this.world?.canTalkToElder ? 'у костра · лесной лагерь' : this.world?.currentZone.name ?? 'разговор'
      this.textSizer.textContent = text; this.accessibleSpeech.textContent = text
      this.choiceList.replaceChildren()
      choices.forEach((choice, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.choice = String(index)
        const key = document.createElement('span'); key.className = 'camp-dialogue__choice-key'; key.textContent = String(index + 1)
        const label = document.createElement('span'); label.textContent = choice.label
        button.append(key, label); button.style.setProperty('--choice-index', String(index)); this.choiceList.append(button)
      })
      this.dialogue.classList.add('is-open'); this.dialogue.inert = false; this.dialogue.setAttribute('aria-hidden', 'false')
      this.startText(text); this.syncSelection(); this.choiceList.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); this.changed()
    }
    if (wasOpen && !this.reducedMotion) {
      this.changing = true; this.dialogue.classList.add('is-changing')
      this.lineTimer = window.setTimeout(render, 110)
    } else render()
  }

  private startText(text: string): void {
    this.fullText = text; this.text.textContent = ''; this.typing = true; this.dialogue.classList.add('is-typing')
    this.dialogue.querySelector('.camp-dialogue__hint')!.textContent = 'E · показать целиком   /   1–5 · ответить сразу'
    if (this.reducedMotion) { this.revealText(); return }
    let count = 0, next = performance.now() + 65
    const tick = (now: number): void => {
      while (now >= next && count < text.length) {
        const character = text[count++]!
        next += /[.!?…]/.test(character) ? 170 : /[,;:]/.test(character) ? 70 : character === '\n' ? 90 : character === ' ' ? 7 : 18
      }
      this.text.textContent = text.slice(0, count)
      if (count >= text.length) this.revealText()
      else this.typingFrame = requestAnimationFrame(tick)
    }
    this.typingFrame = requestAnimationFrame(tick)
  }

  private revealText(): void {
    if (this.typingFrame) cancelAnimationFrame(this.typingFrame)
    this.typingFrame = 0; this.typing = false; this.text.textContent = this.fullText; this.dialogue.classList.remove('is-typing')
    this.dialogue.querySelector('.camp-dialogue__hint')!.textContent = '↑↓ · выбрать ответ   /   E или Enter · сказать   /   1–5 · быстрый выбор'
  }

  private stopText(): void {
    if (this.typingFrame) cancelAnimationFrame(this.typingFrame)
    if (this.lineTimer) window.clearTimeout(this.lineTimer)
    this.typingFrame = 0; this.lineTimer = 0; this.typing = false; this.changing = false
    this.dialogue.classList.remove('is-changing', 'is-typing')
  }

  private choose(index: number): void {
    const choice = this.choices[index]; if (!choice || this.transitioning || this.changing) return
    this.reply.textContent = `› ${choice.label}`; choice.run()
  }

  private openJournal(world: WorldState): void {
    this.world = world; this.rememberFocus(); this.stopText(); this.mode = 'journal'
    this.dialogue.classList.remove('is-open'); this.dialogue.inert = true; this.dialogue.setAttribute('aria-hidden', 'true')
    const list = this.journal.querySelector<HTMLElement>('[data-quests]')!; list.replaceChildren()
    for (const quest of ANOMALY_QUESTS) {
      const status = world.quests[quest.id]!
      const card = document.createElement('article'); card.className = `quest-record quest-record--${status}`
      const heading = document.createElement('h3'); heading.textContent = `${quest.glyph} ${quest.title}`
      const state = document.createElement('span'); state.textContent = STATUS_LABELS[status]
      const body = document.createElement('p'); body.textContent = status === 'locked' ? 'Сначала закончи предыдущее исследование.' : status === 'surveyed' || status === 'completed' ? quest.observation : quest.hint
      card.append(heading, state, body); list.append(card)
    }
    this.journal.classList.add('is-open'); this.journal.inert = false; this.journal.setAttribute('aria-hidden', 'false')
    this.journal.querySelector<HTMLButtonElement>('button')?.focus(); this.changed()
  }

  private interactHouse(world: WorldState): void {
    const target = world.houseTarget
    if (!target) return
    if (target.id === 'radio' || target.id === 'door') {
      if (target.id === 'door' && !world.useHouseObject('door')) return
      this.rememberFocus(); this.mode = 'house'
      this.houseControls.open(world, target.id === 'radio' ? 'radio' : 'peephole'); this.changed(); return
    }
    if (!world.useHouseObject(target.id)) return
    if (target.id === 'television') this.element.dispatchEvent(new Event('interaction:media', { bubbles: true }))
    if (target.id === 'fridge') { this.openFridge(world); return }
    if (target.id === 'bed') {
      this.showDialogue('Кровать', 'Простыня всё ещё тёплая. Можно закрыть глаза. Только бы снова не оказаться в том лесу.', [
        { label: 'Вздремнуть час.', run: () => { this.close(); this.changeScene('тиканье часов становится тише', () => world.sleepInHouse(1), true) } },
        { label: 'Уснуть на шесть часов.', run: () => { this.close(); this.changeScene('где-то за стеной гудит приёмник', () => world.sleepInHouse(6), true) } },
        { label: 'Пока не хочу спать.', run: () => this.close() },
      ]); return
    }
    if (target.id === 'note') {
      this.showDialogue('Записка · мой почерк', '«◌ ⋮ ∴»\n\nТри знака. Я только что видел их в лесу. Ниже написано: «Если снова проснёшься здесь — включи радио. Не доверяй тишине».', [{ label: 'Положить записку обратно.', run: () => this.close() }])
    } else world.notify(target.id === 'television' ? world.house.tvOn ? `Телевизор · канал ${world.house.tvChannel + 1}` : 'Экран погас' : world.house.lampOn ? 'Лампа включена' : 'Лампа погасла')
  }

  nextTelevisionChannel(world: WorldState): void {
    if (this.isModal || !world.nextTelevisionChannel()) return
    this.element.dispatchEvent(new Event('interaction:media', { bubbles: true }))
    this.update(world)
  }

  private openFridge(world: WorldState): void {
    this.showDialogue('Холодильник', world.house.beer > 0 ? `На полке ${world.house.beer} ${world.house.beer === 1 ? 'бутылка' : 'бутылки'} пива. Стекло запотело. Больше здесь ничего нет.` : 'Пустая полка. Только круглые следы от бутылок.', [
      ...(world.house.beer > 0 ? [{ label: 'Открыть бутылку и выпить.', run: () => { world.drinkBeer(); this.openFridge(world) } }] : []),
      { label: 'Закрыть холодильник.', run: () => this.close() },
    ])
  }

  private changeScene(label: string, action: () => boolean, waking = false): void {
    if (this.reducedMotion) { action(); this.changed(); return }
    this.transitioning = true; this.transition.querySelector('span')!.textContent = label
    this.transition.classList.toggle('world-transition--awakening', waking)
    this.transition.classList.add('is-covering'); this.changed()
    this.timers.push(window.setTimeout(() => {
      action(); this.transition.classList.remove('is-covering')
      this.timers.push(window.setTimeout(() => { this.transitioning = false; this.timers = []; this.transition.classList.remove('world-transition--awakening'); this.changed() }, waking ? 1050 : 260))
    }, waking ? 850 : 180))
  }

  private rememberFocus(): void { if (this.mode === 'none') { this.returnFocus = document.activeElement as HTMLElement; this.reply.textContent = '' } }
  private changed(): void { this.element.dispatchEvent(new Event('interaction:change', { bubbles: true })) }
  private syncSelection(): void { this.choiceList.querySelectorAll('button').forEach((button, index) => button.classList.toggle('is-selected', index === this.selected)) }
  private setPrompt(text: string): void { if (this.prompt.textContent !== text) this.prompt.textContent = text; this.prompt.classList.toggle('camp-interaction__prompt--visible', !!text); this.prompt.disabled = !text }
  private nearbyResident(world: WorldState) { return world.residents.filter((resident) => Math.hypot(resident.x - world.player.x, resident.z - world.player.z) < 2.5).sort((a, b) => Math.hypot(a.x - world.player.x, a.z - world.player.z) - Math.hypot(b.x - world.player.x, b.z - world.player.z))[0] }
  private nearbyBuilding(world: WorldState) { return ENTERABLE_BUILDINGS.find((building) => { const door = buildingEntrance(building); return Math.hypot(world.player.x - door[0], world.player.z - door[1]) < 2.6 }) }
  private nearbyAnomaly(world: WorldState) { return ANOMALY_QUESTS.find((quest) => Math.hypot(world.player.x - quest.x, world.player.z - quest.z) < 2.7) }
  private readonly handleFocus = (event: FocusEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-choice]')
    if (button) { this.selected = Number(button.dataset.choice); this.syncSelection() }
  }
  private readonly handleClick = (event: MouseEvent): void => {
    if (this.speech.contains(event.target as Node)) { this.revealText(); return }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || !this.world) return
    if (button.dataset.choice !== undefined) this.choose(Number(button.dataset.choice))
    else if (button.hasAttribute('data-close')) this.close()
    else if (button.hasAttribute('data-tv-channel')) this.nextTelevisionChannel(this.world)
    else if (button.hasAttribute('data-journal')) this.toggleJournal(this.world)
    else if (button === this.prompt) this.interact(this.world)
  }
}
