# okzVM Libraries

Optional helper libraries for common tasks. You don't need them - you can write everything from scratch using `file.readBinary()` and the native API. They're here to save you time on the boring parts.

## How to use

Copy the `.okzlib` files you need into your project's `lib/` folder:

```
my-project/
├── main.okz
└── lib/
    └── scene3d.okzlib
```

Then import by name in your code:

```lua
import scene3d
```

## scene3d.okzlib

Builds 3D scenes for `screen.render3D()`. All functions use config tables instead of positional parameters.

```lua
import scene3d

local scene = SCENE3D.merge({
  SCENE3D.ground({ size = 20; tileSize = 2; colors = { {80, 100, 60}; {70, 90, 55} } }),
  SCENE3D.box({ pos = { 0; 0 }; size = { 1; 1; 1 }; color = { 200; 100; 50 } }),
})

while true do
  SCENE3D.render({
    scene = scene;
    camera = { x = 0; y = 3; z = 8; rx = -0.3; ry = 0; fov = 60 };
    scale = 0.5;
  })
  screen.sync()
end
```

### Shape builders

- `SCENE3D.box(cfg)` -- colored box. cfg: `{ pos, y?, size, color, alpha?, rot? }`
- `SCENE3D.texBox(cfg)` -- textured box. cfg: `{ pos, y?, size, texture, texW, texH }`
- `SCENE3D.texQuad(cfg)` -- textured quad. cfg: `{ pos, size, texture, texW, texH }`
- `SCENE3D.column(cfg)` -- pillar. cfg: `{ pos, radius, height, color, alpha?, topAlpha?, sides? }`
- `SCENE3D.billboard(cfg)` -- sprite. cfg: `{ pos, size, pixels }`

### Ground / terrain

- `SCENE3D.ground(cfg)` -- checkerboard. cfg: `{ size, tileSize, colors }`
- `SCENE3D.texturedGround(cfg)` -- tiled texture. cfg: `{ size, texture, texW, texH, tileScale?, subdivs? }`
- `SCENE3D.terrain(cfg)` -- heightmap. cfg: `{ size, heightmap, colors?, cells?, texture?, texW?, texH? }`

### High-level

- `SCENE3D.room(cfg)` -- complete room with floor, ceiling, walls. cfg: `{ size, floor?, ceiling?, walls? }`

### Scene operations

- `SCENE3D.merge(objects, transform?)` -- merge scenes, optional vertex transform callback
- `SCENE3D.translate(scene, tx, ty, tz)` -- move all vertices
- `SCENE3D.scale(scene, sx, sy, sz)` -- scale all vertices
- `SCENE3D.rotateY(scene, angle)` -- rotate around Y axis
- `SCENE3D.render(cfg)` -- render to screen. cfg: `{ scene, camera, scale?, billboards?, ambient?, ... }`

### Serialization

- `SCENE3D.serialize(scene)` -- convert scene to array (for .bin export)
- `SCENE3D.deserialize(data)` -- load scene from array

## Writing your own

If these don't fit your needs, write your own library. That's the whole point:

```lua
-- lib/my3d.okzlib
MY3D = {}
function MY3D.createMesh(verts, tris)
  return { verts = verts; tris = tris }
end
```

Save it as `.okzlib` in `lib/`, import it, use it.