# okzVM Libraries

Optional helper libraries for common tasks. You don't need them — you can write everything from scratch using `file.readBinary()` and the native API. They're here to save you time on the boring parts.

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

Builds 3D scenes for `screen.render3D()`. Handles vertices, triangles, textured quads, boxes, floors, columns, and merging objects.

```lua
import scene3d

local ground = SCENE3D.ground(20, 2, { {80, 100, 60}; {70, 90, 55} })
local box = SCENE3D.box(0, 0, 1, 1, 1, 200, 100, 50)
local scene = SCENE3D.merge({ ground, box })

while true do
  screen.render3D({
    vertices = scene.verts;
    triangles = scene.tris;
    camera = { x = 0; y = 3; z = 8; rx = -0.3; ry = 0; fov = 60 };
    scale = 0.5;
  })
  screen.sync()
end
```

### Functions

- `SCENE3D.vert(x, y, z, u?, v?)` — vertex with optional UV
- `SCENE3D.tri(i0, i1, i2, r, g, b, a?)` — colored triangle
- `SCENE3D.texTri(i0, i1, i2, texture, texW, texH)` — textured triangle
- `SCENE3D.texQuad(x, y, z, w, h, pixels, fw, fh)` — textured quad from pixel data
- `SCENE3D.texBox(cx, w, h, d, pixels, fw, fh)` — textured box
- `SCENE3D.box(cx, cz, w, h, d, r, g, b, a?, cy?)` — colored box (cx, cz = center, cy = y offset)
- `SCENE3D.ground(size, tileSize, colors)` — checkerboard ground (colors = array of {r,g,b})
- `SCENE3D.column(cx, cz, radius, height, r, g, b)` — cylinder
- `SCENE3D.texturedGround(size, texture, texW, texH, tileScale, subdivs)` — textured ground
- `SCENE3D.texturedGroundBlend(...)` — dual-texture ground
- `SCENE3D.merge(objects)` — merge objects into one scene
- `SCENE3D.billboard(x, y, z, w, h, pixels)` — billboard sprite
- `SCENE3D.terrain(size, heightmap, colors, cells)` — heightmap terrain

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