# Contributing to okzVM

Thanks for thinking about contributing.

Here's what you need to know.

## Getting the project running

```bash
git clone https://github.com/okz-spec/okzVM.git
cd okzVM
npm install
npm run dev
```

The Electron window opens with the dev server.

Changes to `src/renderer/` hot-reload. Changes to `src/vm/` or `src/main/` require a restart.

## What to work on

Check the issues tab for things that need doing.

If you want to work on something that is not listed there, open an issue first so we can talk about it before you start.

Good first contributions:

* Fixing bugs in the compiler or runtime
* Adding missing math functions or string operations
* Improving error messages
* Writing examples or documentation
* Improving 3D renderer performance
* Adding tests for things that currently have none

## Code style

* No trailing whitespace
* No unnecessary blank lines
* No em dashes in comments or documentation
* Comments should sound like a person wrote them, not a bot
* Keep functions reasonably focused
* Use descriptive variable names. `i` and `j` are fine for loop counters, everywhere else use names that actually tell you what the value is
* Don't reformat unrelated code just because you're touching a file

There is no need to turn every function into a collection of tiny abstractions. If the code is readable, it is probably fine.

## Architecture

The VM has a few layers:

1. **Compiler** (`src/compiler/`) - Lua-like source to bytecode
2. **Runtime** (`src/vm/`) - stack machine that executes bytecode
3. **Renderer** (`src/renderer/`) - React UI for the Electron window
4. **Main process** (`src/main/`) - Electron main process, window management, menus

The runtime is the interesting part.

`Process.ts` is the bytecode interpreter.

`GlobalsAPI.ts` is where all the native functions live.

`Renderer3D.ts` is the 3D software rasterizer.

## Testing

There's a basic test harness in `src/test/`.

Run it with:

```bash
npm test
```

If you're adding a new feature, add a test for it.

If you're fixing a bug, add a test that would have caught it.

## Pull requests

1. Fork the repo
2. Create a branch for your change
3. Make your changes
4. Run the tests
5. Run `npm run build` to make sure it compiles
6. Open a PR with a clear description of what you changed and why

Keep PRs focused.

One feature or fix per PR is preferred.

If you're doing a big refactor, break it into smaller PRs where possible. Nobody wants to review a 2000-line PR that changes the compiler, renderer, and half the runtime at the same time.

## What not to do

* Don't add dependencies unless absolutely necessary. The VM is meant to be lean
* Don't add built-in parsers for file formats. Developers write their own using `file.readBinary()`
* Don't add GUI widgets or UI frameworks. The UI is minimal on purpose
* Don't add closures or coroutines. These require rewriting the compiler and aren't planned
* Don't rewrite working systems just to make them look more modern
* Don't reformat half the codebase in a PR that was supposed to fix one bug

### About AI-generated code

Using AI tools is fine.

Submitting code you don't understand is not.

If you use AI to help write something, read the code, test it, and make sure it actually fits the project. Don't paste a generated implementation into a PR and hope nobody notices.

## Before opening a PR

Make sure:

* The project builds
* Tests pass
* New features have tests where appropriate
* Bug fixes have regression tests where possible
* You didn't add a dependency for something that could have been done directly
* You understand the code you are submitting

## Questions?

Open an issue and ask.