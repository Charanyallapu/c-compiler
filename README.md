# ⚡ 100% Client-Side WebAssembly C Compiler & Code Runner

A modern, fast, private online C compiler and code runner that compiles and executes C programs **entirely inside the user's web browser** using **WebAssembly (WASM)**.

**Zero backend servers. Zero API requests. Zero external compilation services.** Your C code never leaves your browser.

---

## 🌟 Key Features

1. **Full In-Browser C Compilation**
   - Uses real **LLVM Clang (8.0.1)** and **LLD Linker** compiled to WebAssembly.
   - Compiles standard C code directly into WebAssembly binaries (`.wasm`) in client memory.
   - Compliant with **C11**, **C17**, and **C99** standards.
   - Optimization flags: `-O0`, `-O1`, `-O2`, `-O3`.

2. **Full In-Browser Code Runner**
   - Instantiates and executes the resulting `.wasm` binary directly inside your browser's native WebAssembly engine.
   - Full standard library support: `<stdio.h>`, `<stdlib.h>`, `<string.h>`, `<math.h>`, `<stdbool.h>`, `<time.h>`, `<ctype.h>`.
   - Real-time capturing of `stdout` and `stderr` displayed in an ANSI-colored terminal.

3. **Standard Input (`stdin`) & `scanf` Support**
   - Dedicated standard input box to supply input before or during execution.
   - Seamlessly handles `scanf("%d %d", &a, &b)`, `fgets()`, `getchar()`.
   - Quick preset input buttons (`10 20`, `12`, `50`).

4. **Monaco Code Editor**
   - The same editor engine that powers VS Code.
   - C/C++ syntax highlighting, line numbers, bracket pair colorization, auto-indentation.
   - Inline compilation diagnostic markers (red squiggles for errors, yellow squiggles for warnings) mapped directly to line and column numbers.
   - Keyboard shortcuts:
     - `Ctrl + Enter` (or `Cmd + Enter` on macOS): **Run Code**
     - `Ctrl + S` (or `Cmd + S` on macOS): **Save Code Locally**

5. **Sandbox Security & Infinite Loop Protection**
   - Execution runs completely isolated inside a dedicated **Web Worker**.
   - The browser UI never freezes, even if running an infinite loop (`while(1)`).
   - Instant **Stop** button: terminates the worker immediately and resets cleanly.
   - Automatic configurable **Timeout Watchdog** (default: 10s).
   - Zero `eval()`, zero server transmission, completely isolated WebAssembly linear memory.

6. **Offline Capability & CacheStorage**
   - First visit downloads and caches the compiler WASM binaries in the browser's `CacheStorage`.
   - Subsequent page visits load instantly (< 150ms) without redownloading.
   - Progressive Web App (PWA) Service Worker enables 100% offline usage.

7. **Local Persistence**
   - Auto-saves your code and stdin to `localStorage`.
   - Refreshing the page never loses your work.

8. **Export & Import**
   - Download code as `main.c`.
   - Upload any local `.c` / `.h` file into the editor.
   - Built-in library of code templates (Scanf Addition, Fibonacci, Bubble Sort, Prime Sieve, Math & Trigonometry, Dynamic Memory `malloc`, Compilation Error Demo, Infinite Loop Protection Demo).

---

## 🏗️ Architecture & How It Works

```
┌────────────────────────────────────────────────────────────────────────┐
│                          User's Web Browser                            │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │     Monaco Editor     │             │      Terminal Output       │  │
│  │   (C Code & Errors)   │             │       & Stdin Input        │  │
│  └──────────┬────────────┘             └─────────────▲──────────────┘  │
│             │                                        │                 │
│             │ postMessage(code, stdin)               │ postMessage     │
│             ▼                                        │ (stdout/stderr) │
│  ┌───────────────────────────────────────────────────┴──────────────┐  │
│  │                    Web Worker (Sandbox)                          │  │
│  │                                                                  │  │
│  │  1. In-Memory Virtual FS (MemFS WASM)                            │  │
│  │     - Extracted standard C headers (stdio.h, math.h, stdlib.h)   │  │
│  │     - Virtual libc.a and crt1.o runtime archives                 │  │
│  │                                                                  │  │
│  │  2. LLVM Clang Compiler (WASM)                                   │  │
│  │     - clang -cc1 -emit-obj -std=c11 -O2 test.c -> test.o         │  │
│  │     - Parses error & warning diagnostics with line/col numbers   │  │
│  │                                                                  │  │
│  │  3. LLD Linker (WASM)                                            │  │
│  │     - wasm-ld crt1.o test.o -lc -o test.wasm                     │  │
│  │                                                                  │  │
│  │  4. Native WASM Execution Engine (Browser V8 / SpiderMonkey)     │  │
│  │     - WebAssembly.compile(test.wasm) & instantiate               │  │
│  │     - WASI host_read (stdin) & host_write (stdout/stderr)        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Why this architecture?
1. **Real Clang Compiler**: Rather than an incomplete C subset interpreter or transpiler, this runs the actual LLVM Clang compiler. It catches real syntax errors, provides exact C11/C17 semantics, macros, pointer arithmetic, structs, unions, and typedefs.
2. **Direct WASM Execution**: The C code compiles directly to a native WebAssembly module (`wasm32-wasi`). The browser executes it at near-native speed using its built-in JIT WASM compiler, rather than emulating an x86 CPU.
3. **WASI Abstraction**: WASI system calls (`fd_read`, `fd_write`, `clock_time_get`, `proc_exit`) bridge standard C I/O directly to JavaScript strings and HTML terminal output.
4. **Complete Isolation**: Web Workers keep execution off the main UI thread. Any hung process or timeout can be terminated instantly by `worker.terminate()` without risking UI responsiveness.

---

## 📦 Download Sizes & Caching

| Component | Uncompressed Size | Gzipped / Transferred | Purpose |
| :--- | :--- | :--- | :--- |
| `clang` | 31.2 MB | ~10.7 MB | LLVM Clang C/C++ compiler |
| `lld` | 19.5 MB | ~6.8 MB | LLVM WebAssembly Linker (`wasm-ld`) |
| `sysroot.tar` | 9.3 MB | ~2.5 MB | Standard C library headers (`libc`, `math`, `stdio`) and precompiled `.o`/`.a` |
| `memfs` | 345 KB | ~110 KB | In-memory WASI virtual filesystem |
| App Shell & Monaco | ~4.5 MB | ~1.1 MB | Monaco Editor, CSS, and application bundle |
| **Total Initial Download** | **~64 MB** | **~21 MB** | **Only downloaded once on first visit** |

*All compiler assets are stored permanently in the browser's `CacheStorage` via the Cache API. On subsequent visits, initial load time is under **150ms** and requires **zero network requests**.*

---

## ⚠️ Limitations Compared to a Native GCC Server

1. **Architecture Target**: Target architecture is `wasm32-wasi`. Pointers are 32-bit (`sizeof(void*) == 4`).
2. **POSIX System Calls**: OS-specific calls like `fork()`, `exec()`, `pthread_create()`, or raw socket networking (`sys/socket.h`) are not available inside the browser WASM sandbox.
3. **Execution Limits**: Programs run inside browser Web Workers with configurable execution timeouts (default 10s) and memory caps (stack size 1MB, heap dynamically allocated).
4. **Assembly**: Inline x86 or ARM assembly (`__asm__`) is not supported; standard C and WebAssembly instructions are used.

---

## 🚀 Installation & Local Development

### Prerequisites
- Node.js (v18+ or v20+)
- npm

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Compiler Automated Test Suite
Verify that the WebAssembly compiler compiles and executes all 8 verification tests (Hello World, factorials, scanf input, bubble sort, malloc, math, C17 flag, diagnostics):
```bash
npm run test:compiler
```

### 3. Start Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000`.

### 4. Build for Production
```bash
npm run build
```
The static production assets will be generated in `dist/`.

### 5. Preview Production Build
```bash
npm run preview
```

---

## 🌐 Static Deployment Instructions

The `dist/` directory contains standard static files (`index.html`, JavaScript, CSS, WASM binaries). It can be hosted on **any static web host**.

### GitHub Pages Deployment

#### Method A: Using GitHub Actions (Automated CI/CD)
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run compiler verification tests
        run: npm run test:compiler

      - name: Build static site
        run: npm run build

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

#### Method B: Manual Git Branch
```bash
npm run build
npx gh-pages -d dist
```

---

### Cloudflare Pages Deployment

1. Log into your Cloudflare Dashboard and navigate to **Workers & Pages**.
2. Click **Create Application** > **Pages** > **Connect to Git**.
3. Select your repository.
4. Configure Build settings:
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Click **Save and Deploy**.

---

### Vercel Static Deployment

1. Install Vercel CLI or import repository on [vercel.com](https://vercel.com).
2. Configure project:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Click **Deploy**.

---

## 🔒 Security & Privacy Guarantee

- **No Remote Compilation**: All compilation and execution takes place inside your browser.
- **No Analytics / Telemetry on Code**: Your code is never transmitted to any third-party server.
- **Isolated Sandbox**: Compiled binaries execute strictly within the browser's WebAssembly sandbox with no access to local files or arbitrary JavaScript APIs.
- **No `eval()`**: Compilation generates native WebAssembly bytecode, not JavaScript strings.
