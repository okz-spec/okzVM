# okzCODE language support for VS Code

Syntax highlighting, snippets, and IntelliSense for .okz and .okzlib files.

## Features

Syntax highlighting for keywords, strings, numbers, comments, operators, and built-in libraries. Code snippets for common patterns (functions, loops, imports, 3D rendering, file I/O). Language configuration with auto-closing brackets, comment toggling, and surrounding pairs.

## Installation

Copy this folder to `~/.vscode/extensions/okzcode-language-0.1.0`, or package it with `npx vsce package` and install the `.vsix` file.

## Snippets

| Prefix | Description |
|--------|-------------|
| `fun` | function declaration |
| `lfun` | local function |
| `for` | numeric for loop |
| `while` | while loop |
| `if` / `ife` | if / else |
| `tbl` | table literal |
| `pcall` | protected call with error handling |
| `loc` | local variable |
| `imp` | import module |
| `sync` | screen.sync() |
| `clear` | clear screen with color |
| `render3d` | screen.render3D() |
| `box` / `floor` | 3D meshes |
| `kbd` / `mouse` | input handlers |
| `fread` / `freadb` / `fwrite` / `freaddir` | file I/O |
| `spawn` | process.spawn() |
| `wait` | system.wait() |
| `fmt` | string.format() |
| `atan2` | math.atan2() |
| `tone` / `aplay` | audio |
| `main` | main loop template |

## Grammar details

File extensions: `.okz`, `.okzlib`. Scope name: `source.okz`. Line comments use `--`. Strings are double or single quoted, with `\n`, `\t`, `\"` escapes. Keywords: `function`, `end`, `if`, `then`, `else`, `elseif`, `while`, `do`, `for`, `in`, `repeat`, `until`, `return`, `local`, `break`, `continue`, `import`, `and`, `or`, `not`, `nil`, `true`, `false`. Built-in modules: `math.*`, `string.*`, `table.*`, `bit.*`, `screen.*`, `keyboard.*`, `mouse.*`, `system.*`, `audio.*`, `process.*`, `file.*`, `debug.*`.