# okzVM: language reference

## 1. Overview

okzVM is a lightweight stack-based virtual machine with a Lua-inspired scripting language. Pixel graphics, a software3D rasterizer, audio, file I/O, and multitasking.

All drawing writes to a single `Uint8Array` framebuffer (`width × height × 4` RGBA). Canvas is used only for the final blit in `screen.sync()`.

## 2. Quick start

### Hello world

```lua
while true do
  screen.clear()
  screen.color(255, 255, 255)
  screen.rect(10, 10, 200, 100)
  screen.sync()
end
```

### Project structure

```
my-project/
├── main.okz              # Entry point (required)
├── assets/               # Binary files (sprites, audio, etc.)
│   └── music.wav
└── lib/                  # Modules (optional)
    └── mymodule.okzlib   # Your custom module
```

### Running

The VM loads `main.okz` from the project directory. This file is the first process. Open the project via File > Open Project in the Electron window.

## 3. Language

The language is Lua-inspired. Key syntax:

```lua
-- Variables
local x = 10
local name = "hello"
local flag = true

-- Functions
function add(a, b)
  return a + b
end

-- Tables
local player = { x = 0; y = 0; hp = 100 }

-- Loops
for i = 1, 10 do
  print(i)
end

while condition do
  -- body
end

-- Conditionals
if x > 5 then
  -- body
elseif x > 2 then
  -- body
else
  -- body
end

-- Bitwise operators
local result = bit.band(0xFF, 0x0F)  -- 15
```

### Operator precedence (low to high)

1. `or`
2. `and`
3. Comparison: `==`, `~=`, `<`, `>`, `<=`, `>=`
4. Bitwise: `&`, `|`, `<<`, `>>`
5. Concatenation: `..`
6. Addition: `+`, `-`
7. Multiplication: `*`, `/`, `%`
8. Unary: `not`, `#`, `-`, `~`

### Modules

Modules use the `.okzlib` extension and are placed in `lib/`. Import by name:

```lua
-- lib/utils.okzlib
UTILS = {}
function UTILS.dist(x1, y1, x2, y2)
  local dx = x1 - x2; local dy = y1 - y2
  return math.sqrt(dx * dx + dy * dy)
end
```

```lua
-- main.okz
import utils
local d = UTILS.dist(0, 0, 3, 4)  -- 5
```

## 4. Native API

### screen.*, pixel graphics

- `screen.clear()`: clear to black
- `screen.color(r, g, b)`: set color (0-255)
- `screen.pixel(x, y)`: draw pixel
- `screen.rect(x, y, w, h)`: filled rectangle
- `screen.rectOutline(x, y, w, h)`: rectangle outline
- `screen.line(x1, y1, x2, y2)`: line
- `screen.circle(cx, cy, r)`: filled circle
- `screen.circleOutline(cx, cy, r)`: circle outline
- `screen.triangle(x1, y1, x2, y2, x3, y3)`: filled triangle
- `screen.triangleOutline(x1, y1, x2, y2, x3, y3)`: triangle outline
- `screen.polygon(points)`: filled polygon from `{x, y}` tables
- `screen.sync()`: yield CPU, blit framebuffer to canvas
- `screen.width()` / `screen.height()`: display size

### screen.render3D(config)

Software 3D rasterizer. Config fields:

- `vertices`: array of `{x, y, z, u?, v?, blend?}`
- `triangles`: array of `{i0, i1, i2, color?, texture?, texW?, texH?, texture2?, texW2?, texH2?}`
- `camera`: `{x, y, z, rx, ry, fov}`
- `scale`: internal resolution (default 0.5)
- `blendWithFb` (boolean): alpha compositing mode
- `billboards`: array of `{x, y, z, w, h, pw, ph, pixels}`
- `ambient`: 0-1, minimum brightness (default 0.25)
- `lightDir`: `{x, y, z}`, directional light
- `lightColor`: `{r, g, b}`, directional tint
- `lightIntensity`: 0-1, directional strength
- `lights`: point lights `{x, y, z, r, g, b, intensity?, radius?}`
- `fogDensity`: exponential fog
- `fogNear`, `fogFar`: linear fog range
- `fogColor`: `{r, g, b}`
- `shadows`: enable shadow projection
- `shadowPlaneY`: ground plane Y for shadows
- `shadowAlpha`: 0-255, shadow darkness
- `shadowColor`: `{r, g, b}`
- `cullBehind`: cull triangles behind camera

### math.*

- Constants: `math.pi`, `math.huge`
- Trig: `cos`, `sin`, `tan`, `atan2(y,x)`
- Numeric: `abs`, `floor`, `ceil`, `sqrt`, `min`, `max`, `log`, `exp`, `pow`
- Random: `random()`, `random(n)`, `random(min, max)`
- Vectors: `vec2(x,y)`, `vec3(x,y,z)` with `length()`, `add()`, `sub()`, `scale()`, `dot()`, `normalize()`, `distance()`
- Vector helpers: `vec2Length(v)`, `vec2Add(a,b)`, `vec2Dist(a,b)`

### string.*

- `byte(s)`, `char(c)`, `sub(s, i, j)`, `find(s, p)`
- `lower(s)`, `upper(s)`, `reverse(s)`, `rep(s, n)`
- `format(fmt, ...)`: printf-style (`%d`, `%s`, `%f`, `%x`, `%c`, `%%`)

### bit.*

- `band(a,b)`, `bor(a,b)`, `bxor(a,b)`, `bnot(a)`, `lshift(a,b)`, `rshift(a,b)`
- Used by bitwise operators: `&`, `|`, `~`, `<<`, `>>`

### table.*

- `insert(t, v)`, `remove(t)`, `concat(t, sep)`, `keys(t)`
- `sort(t, fn?)`: quicksort with optional comparator

### keyboard.*

- `isPressed(code)`, `justPressed(code)`, `justReleased(code)`
- Key codes: `KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`, `Enter`, `ArrowUp`, etc.

### mouse.*

- `x()`, `y()`, `left()`, `right()`, `wheel()`, `deltaX()`, `deltaY()`, `locked()`
- `setPointerLock(enabled)`: enable/disable pointer lock
- `setPosition(x, y)`: warp cursor
- `wheel()` returns -1, 0, or 1

### system.*

- `deltaTime()`, `elapsedTime()`, `frameCount()`
- `fps()`, `fpsLimit(n)`: get/set FPS limit
- `wait(seconds)`: yield process for N seconds
- `log(msg)`: log to VM console
- `cpuSpeed()`, `cpuCores()`, `totalMemory()`

### file.*, filesystem

- `read(path)`: read text file
- `readBinary(path)`: read binary file, returns byte array
- `readDir(path)`: list directory
- `write(path, content)`: write text file
- `exists(path)`: check if file exists
- `delete(path)`: delete file
- Paths resolve relative to project root

### audio.*

Playback:
- `load(name, path)`, `unload(name)`
- `play(name, opts?)`, `pause(name)`, `resume(name)`, `stop(name)`
- `seek(name, seconds)`, `position(name)`, `isPlaying(name)`
- `volume(v)`, `stopAll()`

Generation:
- `tone(freq, dur, type, vol)`, `note(name, oct, dur, type, vol)`
- `genTone(name, sr, freq, dur, type, amp, duty)`, `genNote(name, sr, note, oct, dur, type, amp)`
- `create(name, sr, ch, len)`, `silence(name)`, `fill(name, ch, val)`

Sample access:
- `sample(name, ch, idx)`, `setSample(name, ch, idx, val)`
- `getChannel(name, ch)`, `setChannel(name, ch, samples)`

Manipulation:
- `reverse(name)`, `trim(name, start, end)`, `normalize(name)`
- `mix(dest, src, vol)`, `copy(dest, src)`

Info:
- `info(name)`, `sampleRate(name)`, `channels(name)`, `duration(name)`, `length(name)`
- `fft(name, ch, fftSize)`

### debug.*

- `traceback()`: call stack traceback
- `wireframe()`: toggle wireframe mode
- `wireframeStatus()`: query wireframe state

### process.*, multitasking

- `spawn(path)`: read, compile, and run a `.okz` file as a new process. Returns PID.
- `list()`: array of process descriptions
- `kill(pid)`: terminate a process

Processes share CPU time via round-robin scheduler. Each gets `instructionsPerFrame / N` instructions per frame.

### Other globals

- `print(...)`: log to console
- `type(v)`: return type string
- `tostring(v)`, `tonumber(s)`
- `pairs(t)`, `ipairs(t)`: iterate helpers
- `pcall(fn, ...)`: protected call, returns `{true, result}` or `{false, errorMessage}`

## 5. Examples

### Reading binary files

Use `file.readBinary()` to load custom formats. Write your own parser in Lua:

```lua
local bytes = file.readBinary("assets/sprite.bin")
local frameW = bytes[1]
local frameH = bytes[2]
local pixels = {}
for i = 3, #bytes do
  local r = bytes[i]; local g = bytes[i+1]; local b = bytes[i+2]; local a = bytes[i+3]
  pixels[(i-3)/4 + 1] = { r = r; g = g; b = b; a = a }
end
```

### Audio playback

```lua
audio.load("music", "assets/music.wav")
audio.play("music", { volume = 0.5, loop = true })
```

### 3D rendering with custom sprites

```lua
screen.render3D({
  camera = { x = 0; y = 2; z = 5; rx = -0.3; ry = 0; fov = 60 };
  billboards = {
    { x = 0; y = 0; z = 0; w = 1; h = 1;
      pw = frameW; ph = frameH; pixels = pixels }
  };
  scale = 0.5;
})
```

### Multitasking

```lua
-- main.okz
local pid = process.spawn("worker.okz")
system.log("Worker started: pid " .. tostring(pid))

while true do
  screen.clear()
  screen.color(255, 255, 255)
  screen.rect(10, 10, 100, 50)
  screen.sync()
end
```

```lua
-- worker.okz
local count = 0
while true do
  count = count + 1
  if count % 1000 == 0 then
    system.log("Worker tick: " .. tostring(count))
  end
  screen.sync()
end
```

## 6. Limitations

- No closures/upvalues (nested functions can't capture outer locals)
- No generic for loop (`for k,v in pairs(t)` is transformed to while)
- No threading/coroutines (but multi-process via `process.spawn()`)
- 3D renderer is software-based (slow at full resolution; use `scale < 1.0` for performance)