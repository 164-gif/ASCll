import { isInsideRiver, type WorldState } from '../../simulation/WorldState'

export class GameHud {
  readonly element: HTMLElement

  private readonly hp: HTMLElement
  private readonly stamina: HTMLElement
  private readonly objective: HTMLElement
  private readonly status: HTMLElement
  private readonly torch: HTMLElement

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div')
    this.element.className = 'game-hud'
    this.element.innerHTML = `
      <div class="game-hud__status" aria-label="Состояние игрока">
        <span class="game-hud__name">wanderer</span>
        <div class="game-hud__meter"><span>hp</span><i data-hp></i></div>
        <div class="game-hud__meter game-hud__meter--stamina"><span>st</span><i data-stamina></i></div>
        <span class="game-hud__name" data-torch></span>
      </div>
      <div class="game-hud__objective" data-objective>речная низина</div>
      <div class="game-hud__hint">WASD двигаться · SHIFT бег · SPACE / ЛКМ удар · F свет · M карта · Z макро ASCII · колесо масштаб · ESC меню</div>
      <div class="game-hud__event" data-status></div>
    `

    const hp = this.element.querySelector<HTMLElement>('[data-hp]')
    const stamina = this.element.querySelector<HTMLElement>('[data-stamina]')
    const objective = this.element.querySelector<HTMLElement>('[data-objective]')
    const status = this.element.querySelector<HTMLElement>('[data-status]')
    const torch = this.element.querySelector<HTMLElement>('[data-torch]')
    if (!hp || !stamina || !objective || !status || !torch) throw new Error('HUD nodes are unavailable')

    this.hp = hp
    this.stamina = stamina
    this.objective = objective
    this.status = status
    this.torch = torch
    parent.append(this.element)
  }

  update(world: WorldState): void {
    this.hp.style.transform = `scaleX(${Math.max(0, world.player.hp) / 100})`
    this.stamina.style.transform = `scaleX(${Math.max(0, world.player.stamina) / 100})`
    this.torch.textContent = world.torchOn ? 'f · light on' : 'f · light off'

    const zone = world.currentZone
    if (isInsideRiver(world.player.x, world.player.z)) this.objective.textContent = `${zone.name} · течение`
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
