# okzVM language reference

## 1. What this is

okzVM is a small virtual machine that runs a Lua-like language. It draws pixels to a framebuffer, plays audio, reads files, and can run multiple programs at once. You write `.okz` files, and the VM executes them.

All drawing goes into a `Uint8Array` framebuffer (`width * height * 4` bytes, RGBA). The canvas only gets the final image when you call `screen.sync()`.

## 2. Getting started

### Hello world

```lua
while true do
  screen.clear()
  screen.color(255, 255, 255)
  screen.rect(10, 10, 200, 100)
  screen.sync()
end
```

This clears the screen, picks white, draws a rectangle, and shows it. The `while true` loop keeps it running.

### Project structure

```
my-project/
├── main.okz              # entry point (required)
├── assets/               # binary files (sprites, audio, etc.)
│   └── music.wav
└── lib/                  # optional modules
    └── mymodule.okzlib
```

### How to run it

The VM loads `main.okz` from the project directory. Open the Electron window, go to File > Open Project, and point it at your project folder.

## 3. The language

The syntax looks like Lua:

```lua
-- variables
local x = 10
local name = "hello"
local flag = true

-- functions
function add(a, b)
  return a + b
end

-- tables (like dictionaries or objects)
local player = { x = 0; y = 0; hp = 100 }

-- array literals
local numbers = [1, 2, 3, 4, 5]
print(#numbers)  -- 5

-- numeric for loop
for i = 1, 10 do
  print(i)
end

-- while loop
while condition do
  -- body
end

-- repeat/until loop
repeat
  -- body (runs at least once)
until condition

-- break exits the innermost loop
for i = 1, 100 do
  if i == 5 then break end
end

-- continue skips to the next iteration
for i = 1, 10 do
  if i % 2 == 0 then continue end
  print(i)  -- prints only odd numbers
end

-- if/elseif/else
if x > 5 then
  -- body
elseif x > 2 then
  -- body
else
  -- body
end

-- bitwise operations
local result = bit.band(0xFF, 0x0F)  -- 15
```

### Generic for loops

You can iterate over tables with `for ... in`. Two iterator functions are built in: `pairs` and `ipairs`.

`pairs(t)` returns every key-value pair in a table. The order is not guaranteed.

```lua
local scores = { alice = 90; bob = 85; carol = 92 }
for name, score in pairs(scores) do
  print(name .. ": " .. tostring(score))
end
```

`ipairs(t)` walks an array in order, starting at index 1. It stops at the first nil.

```lua
local fruits = { "apple", "banana", "cherry" }
for i, fruit in ipairs(fruits) do
  print(i, fruit)
end
```

### Operator precedence (low to high)

1. `or`
2. `and`
3. comparison: `==`, `~=`, `<`, `>`, `<=`, `>=`
4. bitwise: `&`, `|`, `<<`, `>>`
5. concatenation: `..`
6. addition: `+`, `-`
7. multiplication: `*`, `/`, `%`
8. unary: `not`, `#`, `-`, `~`

### Modules

Modules use the `.okzlib` extension and go in the `lib/` folder. Import them by name:

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

## 4. Built-in functions

### screen (drawing)

- `screen.clear()` clears the screen to black
- `screen.color(r, g, b)` sets the current color (0-255 per channel)
- `screen.pixel(x, y)` draws a single pixel
- `screen.rect(x, y, w, h)` draws a filled rectangle
- `screen.rectOutline(x, y, w, h)` draws a rectangle outline
- `screen.line(x1, y1, x2, y2)` draws a line
- `screen.circle(cx, cy, r)` draws a filled circle
- `screen.circleOutline(cx, cy, r)` draws a circle outline
- `screen.triangle(x1, y1, x2, y2, x3, y3)` draws a filled triangle
- `screen.triangleOutline(x1, y1, x2, y2, x3, y3)` draws a triangle outline
- `screen.polygon(points)` draws a filled polygon from `{x, y}` tables
- `screen.sync()` yields the CPU and blits the framebuffer to the canvas
- `screen.width()` and `screen.height()` return the display size

### screen.render3D (software 3D rasterizer)

This renders a 3D scene to the 2D framebuffer. You pass a config table with vertices, triangles, camera, and optional effects.

Config fields:

- `vertices`: array of `{x, y, z, u?, v?, blend?}`
- `triangles`: array of `{i0, i1, i2, color?, texture?, texW?, texH?}`
- `camera`: `{x, y, z, rx, ry, fov}`
- `scale`: internal resolution multiplier (default 0.5; lower = faster)
- `blendWithFb` (boolean): alpha compositing mode
- `billboards`: array of `{x, y, z, w, h, pw, ph, pixels}`
- `ambient`: 0-1, minimum brightness (default 0.25)
- `lightDir`: `{x, y, z}`, directional light direction
- `lightColor`: `{r, g, b}`, directional light tint
- `lightIntensity`: 0-1, directional light strength
- `lights`: point lights as `{x, y, z, r, g, b, intensity?, radius?}`
- `fogDensity`: exponential fog density
- `fogNear`, `fogFar`: linear fog range
- `fogColor`: `{r, g, b}`
- `shadows`: enable shadow projection (boolean)
- `shadowPlaneY`: ground plane Y for shadows
- `shadowAlpha`: 0-255, shadow darkness
- `shadowColor`: `{r, g, b}`
- `cullBehind`: cull triangles behind camera (boolean)

### math

Constants: `math.pi`, `math.huge`

Trigonometry: `cos`, `sin`, `tan`, `atan2(y, x)`

Numeric: `abs`, `floor`, `ceil`, `sqrt`, `min`, `max`, `log`, `exp`, `pow`

Random: `random()` returns 0-1, `random(n)` returns 1-n, `random(min, max)` returns min-max

Vectors: `vec2(x, y)` and `vec3(x, y, z)` create vector tables. Both support `length()`, `add()`, `sub()`, `scale()`, `dot()`, `normalize()`, `distance()`. vec3 also supports `cross()`.

```lua
local v = math.vec3(1, 2, 3)
print(v:length())       -- 3.74...
local w = v:normalize()
local d = v:distance(math.vec3(4, 5, 6))
```

Helper functions: `vec2Length(v)`, `vec2Add(a, b)`, `vec2Dist(a, b)`

### string

- `byte(s)` returns the byte value of a character
- `char(c)` returns the character for a byte value
- `sub(s, i, j)` returns a substring
- `find(s, p)` finds a pattern in a string
- `lower(s)` converts to lowercase
- `upper(s)` converts to uppercase
- `reverse(s)` reverses a string
- `rep(s, n)` repeats a string n times
- `format(fmt, ...)` does printf-style formatting (`%d`, `%s`, `%f`, `%x`, `%c`, `%%`)

### bit (bitwise operations)

- `band(a, b)` bitwise AND
- `bor(a, b)` bitwise OR
- `bxor(a, b)` bitwise XOR
- `bnot(a)` bitwise NOT
- `lshift(a, b)` left shift
- `rshift(a, b)` right shift

You can also use the operators directly: `&`, `|`, `~`, `<<`, `>>`

### table

- `insert(t, v)` appends a value to an array
- `remove(t)` removes and returns the last element
- `concat(t, sep)` joins array elements into a string
- `keys(t)` returns an array of all keys
- `sort(t, fn?)` sorts an array, optionally with a comparator function

### keyboard

- `isPressed(code)` returns true while a key is held down
- `justPressed(code)` returns true on the frame a key was pressed
- `justReleased(code)` returns true on the frame a key was released

Key codes: `KeyW`, `KeyA`, `KeyS`, `KeyD`, `Space`, `Enter`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, etc.

### mouse

- `x()` and `y()` return the cursor position
- `left()` and `right()` return whether mouse buttons are held
- `wheel()` returns -1, 0, or 1
- `deltaX()` and `deltaY()` return mouse movement since last frame
- `locked()` returns whether pointer lock is active
- `setPointerLock(enabled)` enables or disables pointer lock
- `setPosition(x, y)` moves the cursor

### system

- `deltaTime()` returns time since last frame in seconds
- `elapsedTime()` returns total time since VM started
- `frameCount()` returns total frames rendered
- `fps()` returns the current FPS
- `fpsLimit(n)` sets the FPS limit
- `wait(seconds)` pauses the current process for N seconds
- `log(msg)` writes a message to the VM console
- `cpuSpeed()`, `cpuCores()`, `totalMemory()` return hardware info

### file (filesystem)

- `read(path)` reads a text file and returns its contents
- `readBinary(path)` reads a binary file and returns a byte array
- `readDir(path)` lists files in a directory
- `write(path, content)` writes text to a file
- `exists(path)` checks if a file exists
- `delete(path)` deletes a file

All paths are relative to the project root.

### audio

Playback:
- `load(name, path)` loads an audio file
- `unload(name)` unloads it
- `play(name, opts?)` plays it (opts: `{volume, loop, rate, offset}`)
- `pause(name)`, `resume(name)`, `stop(name)` control playback
- `seek(name, seconds)` seeks to a position
- `position(name)` returns current position
- `isPlaying(name)` returns whether it is playing
- `volume(v)` sets the global volume
- `stopAll()` stops all audio

Generation:
- `tone(freq, dur, type, vol)` generates a sine/square/saw/triangle tone
- `note(name, oct, dur, type, vol)` generates a tone by note name
- `genTone(name, sr, freq, dur, type, amp, duty)` generates a named waveform
- `genNote(name, sr, note, oct, dur, type, amp)` generates a named note waveform
- `create(name, sr, ch, len)` creates an empty audio buffer
- `silence(name)` fills a buffer with silence
- `fill(name, ch, val)` fills a channel with a value

Sample access:
- `sample(name, ch, idx)` reads a sample
- `setSample(name, ch, idx, val)` writes a sample
- `getChannel(name, ch)` returns all samples for a channel
- `setChannel(name, ch, samples)` replaces all samples for a channel

Manipulation:
- `reverse(name)` reverses audio
- `trim(name, start, end)` trims to a range
- `normalize(name)` normalizes volume
- `mix(dest, src, vol)` mixes one buffer into another
- `copy(dest, src)` copies one buffer to another

Info:
- `info(name)` returns a table with sample rate, channels, samples, duration
- `sampleRate(name)`, `channels(name)`, `duration(name)`, `length(name)`
- `fft(name, ch, fftSize)` runs an FFT on a channel

### debug

- `traceback()` prints a call stack trace
- `wireframe()` toggles wireframe rendering mode
- `wireframeStatus()` returns whether wireframe mode is on

### process (multitasking)

- `spawn(path)` reads, compiles, and runs a `.okz` file as a separate process. Returns the PID.
- `list()` returns an array of running process descriptions
- `kill(pid)` terminates a process

Processes share CPU time with round-robin scheduling. Each process gets `instructionsPerFrame / N` instructions per frame, where N is the number of running processes.

### Other global functions

- `print(...)` logs values to the console
- `type(v)` returns a string like `"number"`, `"string"`, `"table"`, etc.
- `tostring(v)` converts a value to a string
- `tonumber(s)` converts a string to a number (returns nil if it can't)
- `pairs(t)` returns an iterator for all key-value pairs in a table
- `ipairs(t)` returns an iterator for array elements in order
- `pcall(fn, ...)` calls a function inside a protected wrapper. Returns `true, result` on success or `false, errorMessage` on failure.

## 5. Examples

### Reading binary files

Use `file.readBinary()` to load custom formats. Parse the bytes yourself:

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

### Iterating a table

```lua
local inventory = {
  { name = "sword"; damage = 10 },
  { name = "shield"; defense = 5 },
  { name = "potion"; heal = 20 },
}

for i, item in ipairs(inventory) do
  print(i, item.name)
end
```

### Protected calls

`pcall` catches errors without killing the process. If the function runs fine, you get back `true` and the return value. If it throws, you get `false` and the error message.

```lua
function risky()
  local x = nil
  return x.value  -- this will error
end

local ok, result = pcall(risky)
if ok then
  print("success: " .. tostring(result))
else
  print("error: " .. result)
end
```

This prints `error: attempt to index a nil value` instead of crashing.

### Closures

Functions can capture variables from their enclosing scope. This is the basis for iterators, callbacks, and many patterns.

```lua
function makeCounter()
  local count = 0
  return function()
    count = count + 1
    return count
  end
end

local counter = makeCounter()
print(counter())  -- 1
print(counter())  -- 2
print(counter())  -- 3
```

Each call to `counter()` increments the captured `count` variable.

### Varargs

Functions can accept a variable number of arguments using `...`. The extra arguments are collected into an array.

```lua
function sum(first, ...)
  local args = ...
  local total = first
  local i = 1
  while i <= #args do
    total = total + args[i]
    i = i + 1
  end
  return total
end

print(sum(10, 20, 30))  -- 60
print(sum(1, 2, 3, 4, 5))  -- 15
```

## 6. Limitations

- No coroutines. Use `process.spawn()` for concurrent execution instead.
- The 3D rasterizer is software-based. It is slow at full resolution. Use `scale < 1.0` for better performance.
- No pattern matching in strings. `string.find` does basic substring search.
- Tables use reference equality, not value equality. Two tables with identical contents are not considered equal.
- `class`, `new`, `method` keywords are recognized by the parser but not implemented at runtime. OOP is not supported yet.
