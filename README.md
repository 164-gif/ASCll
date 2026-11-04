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
Телевизор включается и выключается клавишей `E`; рядом с ним `Q` переключает три канала (два видео и аварийное вещание). Выходная дверь заперта: `E` у двери —
посмотреть в глазок, `E` / `Esc` — отойти. Холодильник открывается, внутри
четыре бутылки пива; из диалога можно выпить бутылку. У кровати можно поспать
час или шесть часов: время пройдёт, здоровье и выносливость восстановятся.

`E` у радио открывает приёмник. Зажми `−` / `+`, перетаскивай ручки вверх и
вниз или используй колесо мыши над ними. `← →` — грубая настройка,
`↑ ↓` — точная. Грубая ручка проходит диапазон 530–1710 кГц примерно за
84 секунды; точная подстраивает частоту в пределах ±12 кГц. Разборчивые
передачи занимают меньше 1 кГц и требуют восемь секунд устойчивого приёма.
Помехи, неясные голоса и крики синтезируются только включённым радио.

### Локальные записи для второй главы

`src/assets/` исключена из Git. Перед сборкой положи в неё исходное видео:
`xTwTStroCE6hzlFHBkqL+xl5GT3EeYgk.mp4` и `hfVf7uZseQT3kUXZ9Vmg+CW3BMvu1BOE.mp4`. Они проигрываются на телевизоре
со звуком и тем же ASCII-фильтром, что и весь дом. Видео загружается только
при включении телевизора. Если файла нет, остаётся аварийная заставка.
Для звука с лёгкой обработкой рядом с роликами используются отдельные дорожки
`src/assets/tv-audio/channel-1.ogg` и `channel-2.ogg`. Они воспроизводятся
непосредственно браузером и синхронизируются с видео. Если дорожки отсутствуют
или не поддерживаются браузером, используется исходный звук из MP4. Создать
дорожку из ролика можно командой:

```bash
ffmpeg -i input.mp4 -vn -af 'highpass=f=85,lowpass=f=6500,loudnorm=I=-17:TP=-1.5:LRA=11' -c:a libopus -b:a 96k channel-1.ogg
```

Музыку для двух станций можно добавить как `src/assets/radio/music-1.mp3`
и `src/assets/radio/music-2.mp3` (также поддерживаются `.ogg`, `.wav`, `.m4a`).
До добавления записей эти частоты передают только несущую и помехи.
Имена для необязательных записей голосов/криков: `voices-1`, `warning`,
`numbers`, `home`, `screams-1`, `screams-2` с теми же расширениями.
Частоты и реплики заданы в `src/world/HouseRadio.ts`. После добавления файлов
перезапусти dev-сервер или пересобери игру. На чистом checkout без локальных
медиа сборка тоже проходит; при удалённом деплое эти игнорируемые файлы
нужно передать отдельно или включить в локально собранный `dist`.
