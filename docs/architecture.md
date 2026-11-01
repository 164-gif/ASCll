# Runtime architecture

The project is intentionally split so the visual renderer never becomes the source of truth for gameplay.

```text
input -> simulation -> render adapters -> WebGL/glyph presentation
                    -> DOM UI
                    -> audio
```

## Boundaries

### `simulation/`
Owns serializable world state: entities, combat, progression, weather state, loot and multiplayer snapshots. It must not import Three.js.

### `render/`
Owns cameras, scene composition, materials, animation, particles, water, weather presentation and the glyph pipeline. Render state mirrors simulation state but does not define gameplay rules.

### `physics/`
Will own Rapier bodies/colliders and a narrow bridge to simulation entities.

### `ui/`
DOM-based menus, HUD and settings. It remains usable independently from the WebGL scene and pauses/gates gameplay input when modal surfaces are active.

### `core/`
Browser/platform services such as fullscreen, input mapping, lifecycle and asset manifests.

## Planned glyph pipeline

The final renderer should be material-aware rather than a simple monochrome ASCII post-process.

```text
Three.js scene
  -> low-resolution render targets
  -> material/depth/normal metadata
  -> glyph selection + orientation
  -> palette/light mapping
  -> final compositing
```

This makes it possible for water, grass, stone, fog, spell effects and shadows to use different glyph vocabularies while staying part of the same world.
