import { isInsideRiver, type WorldState } from '../../simulation/WorldState'

export class GameHud {
  readonly element: HTMLElement

  private readonly hp: HTMLElement
  private readonly stamina: HTMLElement
  private readonly objective: HTMLElement
  private readonly status: HTMLElement
  private readonly torch: HTMLElement
  private readonly environment: HTMLElement
  private readonly quest: HTMLElement

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'game-hud'
    this.element.innerHTML = `
      <div class="game-hud__status" aria-label="Состояние игрока">
        <span class="game-hud__name">wanderer</span>
        <div class="game-hud__meter"><span>hp</span><i data-hp></i></div>
        <div class="game-hud__meter game-hud__meter--stamina"><span>st</span><i data-stamina></i></div>
        <span class="game-hud__name" data-torch></span><span class="game-hud__environment" data-environment></span>
      </div>
      <div class="game-hud__objective" data-objective>речная низина</div>
      <div class="game-hud__hint">WASD двигаться · E разговор / дверь · J записи · SHIFT бег · SPACE / ЛКМ удар · F свет · M карта · Z макро ASCII · колесо масштаб · ESC меню</div>
      <div class="game-hud__quest" data-quest></div>
      <div class="game-hud__event" data-status></div>
    `

    const hp = this.element.querySelector<HTMLElement>('[data-hp]')
    const stamina = this.element.querySelector<HTMLElement>('[data-stamina]')
    const objective = this.element.querySelector<HTMLElement>('[data-objective]')
    const status = this.element.querySelector<HTMLElement>('[data-status]')
    const torch = this.element.querySelector<HTMLElement>('[data-torch]')
    if (!hp || !stamina || !objective || !status || !torch) throw new Error('HUD nodes are unavailable')

    this.quest = this.element.querySelector<HTMLElement>('[data-quest]')!
    this.environment = this.element.querySelector<HTMLElement>('[data-environment]')!
    this.hp = hp
    this.stamina = stamina
    this.objective = objective
    this.status = status
    this.torch = torch
    parent.append(this.element)
  }

  update(world: WorldState): void {
    const awakened = world.chapter === 'awakening'
    this.element.classList.toggle('game-hud--awakened', awakened)
    if (awakened) {
      this.objective.textContent = world.currentZone.name
      this.environment.textContent = world.houseTime
      this.torch.textContent = world.house.lampOn ? 'свет включён' : 'свет выключен'
      this.quest.textContent = world.house.noteRead ? 'Знаки остались.\nJ · записи из сна' : 'На тумбочке у кровати лежит записка.'
      this.status.textContent = ''
      this.element.querySelector('.game-hud__hint')!.textContent = 'WASD идти · мышь / стрелки осмотреться · E предмет · F лампа · M план · J записи'
      return
    }
    this.hp.style.transform = `scaleX(${Math.max(0, world.player.hp) / 100})`
    this.stamina.style.transform = `scaleX(${Math.max(0, world.player.stamina) / 100})`
    this.torch.textContent = world.torchOn ? 'f · light on' : 'f · light off'

    const quest = world.activeQuest
    const completed = Object.values(world.quests).filter((status) => status === 'completed').length
    this.quest.textContent = quest
      ? `∴ ${quest.title}\n${world.quests[quest.id] === 'surveyed' ? 'Вернись к седому страннику' : 'Найди след · область отмечена на M'} · J записи`
      : completed === 3 ? '∴ Три следа изучены · фонарь странника' : 'J · полевые записи\nПоручения у странника в лесном лагере'
    const environment = world.environment
    const hour = Math.floor(environment.hour).toString().padStart(2, '0')
    const minute = Math.floor((environment.hour % 1) * 60).toString().padStart(2, '0')
    this.environment.textContent = `${hour}:${minute} · ${environment.label}${world.interior ? ' / под крышей' : ''}`
    const zone = world.currentZone
    if (!world.interior && isInsideRiver(world.player.x, world.player.z)) this.objective.textContent = `${zone.name} · течение`
    else if (world.kills > 0) this.objective.textContent = `${zone.name} · ${world.kills} fallen`
    else this.objective.textContent = zone.name

    if (world.player.hp <= 0) this.status.textContent = 'ты упал'
    else if (world.player.hurtPulse > 0) this.status.textContent = 'удар'
    else if (world.player.attackPulse > 0) this.status.textContent = '—'
    else this.status.textContent = ''
  }

  destroy(): void {
    this.element.remove()
  }
}
