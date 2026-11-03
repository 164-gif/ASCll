# ASCII

A browser-first atmospheric RPG prototype where a reactive 3D world is rendered through a glyph/ASCII visual language.

## Current milestone

- Minimal full-screen main menu
- Procedural animated glyph forest backdrop
- Responsive desktop/mobile layout
- Fullscreen API support (`F11` or UI control)
- Accessible DOM-based menu layer
- GitHub Pages deployment through GitHub Actions

## Stack

- TypeScript
- Vite
- Three.js (runtime foundation for the playable world)
- DOM UI over the render surface

The current menu background is a lightweight procedural glyph renderer. The playable milestone will move world rendering into Three.js while keeping simulation, rendering and UI separated.

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Project structure

```text
src/
  app/              application composition
  core/             platform/input utilities
  render/           rendering systems and scenes
  ui/               DOM menus and overlays
  simulation/       future renderer-independent game state
  physics/          future Rapier bridge
  diagnostics/      future debug/performance tools
```

See [`docs/architecture.md`](docs/architecture.md) for the planned runtime boundaries.

## Разговоры и исследования

`E` — разговор, осмотр следа, вход или выход. В диалоге `E` сначала раскрывает
реплику целиком, затем подтверждает ответ. Выбор: `↑↓`, `Enter` или `1–5`;
`Esc` завершает разговор. `J` открывает полевые записи, `M` — карту.

Седой странник в лесном лагере выдаёт три последовательных поручения. Найди
след в отмеченной области, осмотри его и вернись с отчётом. В палатке можно
ходить, говорить со странником и отдыхать рядом с лежанкой. Прогресс поручений
хранится в текущей игровой сессии.

Промпты для трёх музыкальных тем: [docs/music-prompts.md](docs/music-prompts.md).

Проверки игрового состояния: `npm run test:world` (Node 22.18+).

После сдачи третьего отчёта страннику разговор заканчивается пробуждением
в небольшом доме. В этой главе камера работает от первого лица, а вся сцена
преобразуется в ASCII: комнаты, мебель, радио, телевизор и улица за дверью.

`WASD` — ходьба, щелчок по сцене и мышь — обзор (также доступны стрелки и
перетаскивание мышью), `E` — предмет перед собой, `F` — свет, `M` — план дома.
Радио и телевизор переключаются, записку можно прочитать, дверь открывается во двор.
