/*
 * compiler-worker.js
 * Runs inside a dedicated Web Worker to compile and execute C code in WebAssembly
 * with CacheStorage persistence and stream progress reporting.
 */

self.importScripts('shared.js');

const CACHE_NAME = 'c-compiler-wasm-cache-v1';
let api = null;
let isInitialized = false;

// Approximate sizes for progress calculation
const FILE_SIZES = {
  'memfs': 345442,
  'sysroot.tar': 9297920,
  'clang': 31214472,
  'lld': 19490094
};

const TOTAL_BYTES = Object.values(FILE_SIZES).reduce((a, b) => a + b, 0);
const downloadedBytes = {
  'memfs': 0,
  'sysroot.tar': 0,
  'clang': 0,
  'lld': 0
};

function reportTotalProgress(currentFile, statusMsg) {
  let loaded = 0;
  for (const k in downloadedBytes) {
    loaded += downloadedBytes[k];
  }
  const percent = Math.min(100, Math.round((loaded / TOTAL_BYTES) * 100));
  self.postMessage({
    type: 'init_progress',
    file: currentFile,
    loaded,
    total: TOTAL_BYTES,
    percent,
    message: statusMsg
  });
}

async function getCachedOrFetchBuffer(filename, baseUrl = './') {
  const url = new URL(filename, self.location.href).href;
  const expectedSize = FILE_SIZES[filename] || 1000000;

  let cache = null;
  try {
    if ('caches' in self) {
      cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      if (match) {
        const buf = await match.arrayBuffer();
        downloadedBytes[filename] = expectedSize;
        reportTotalProgress(filename, `Loaded ${filename} from local cache`);
        return buf;
      }
    }
  } catch (err) {
    console.warn('Cache API error, falling back to network fetch:', err);
  }

  // Network fetch with streaming progress
  reportTotalProgress(filename, `Downloading ${filename}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filename}: HTTP ${response.status}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : expectedSize;

  if (!response.body) {
    const buf = await response.arrayBuffer();
    downloadedBytes[filename] = total;
    reportTotalProgress(filename, `Downloaded ${filename}`);
    if (cache) {
      try { await cache.put(url, new Response(buf.slice(0))); } catch (e) {}
    }
    return buf;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    downloadedBytes[filename] = received;
    reportTotalProgress(filename, `Downloading ${filename} (${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`);
  }

  const fullBuffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    fullBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  downloadedBytes[filename] = expectedSize;
  reportTotalProgress(filename, `Cached ${filename}`);

  if (cache) {
    try {
      await cache.put(url, new Response(fullBuffer.buffer));
    } catch (e) {
      console.warn('Failed to cache response:', e);
    }
  }

  return fullBuffer.buffer;
}

// Map to store preloaded WebAssembly buffer / modules
const memoryBuffers = {};

async function initCompiler() {
  if (isInitialized) return;

  reportTotalProgress('memfs', 'Initializing compiler subsystem...');

  // 1. Fetch memfs and sysroot
  const memfsBuf = await getCachedOrFetchBuffer('memfs');
  const sysrootBuf = await getCachedOrFetchBuffer('sysroot.tar');
  memoryBuffers['memfs'] = memfsBuf;
  memoryBuffers['sysroot.tar'] = sysrootBuf;

  // 2. Fetch clang and lld
  const clangBuf = await getCachedOrFetchBuffer('clang');
  const lldBuf = await getCachedOrFetchBuffer('lld');
  memoryBuffers['clang'] = clangBuf;
  memoryBuffers['lld'] = lldBuf;

  reportTotalProgress('sysroot.tar', 'Extracting C standard headers (libc, math, stdio)...');

  api = new API({
    readBuffer(name) {
      const base = name.split('/').pop();
      if (memoryBuffers[base]) return Promise.resolve(memoryBuffers[base]);
      return getCachedOrFetchBuffer(base);
    },
    compileStreaming(name) {
      const base = name.split('/').pop();
      if (memoryBuffers[base]) {
        return WebAssembly.compile(memoryBuffers[base]);
      }
      return getCachedOrFetchBuffer(base).then(buf => WebAssembly.compile(buf));
    },
    hostWrite(str) {
      self.postMessage({ type: 'output', text: str });
    },
    showTiming: false
  });

  await api.ready;

  // Precompile clang and lld into memory
  reportTotalProgress('clang', 'Compiling Clang WASM engine...');
  await api.getModule('clang');
  reportTotalProgress('lld', 'Compiling LLD Linker WASM engine...');
  await api.getModule('lld');

  isInitialized = true;
  self.postMessage({
    type: 'ready',
    message: 'WASM C Compiler is ready for execution.'
  });
}

function parseDiagnostics(output) {
  const diagnostics = [];
  // Match test.c:line:col: error/warning/note: message
  const regex = /(?:test\.(?:c|cpp|cc)):(\d+):(\d+):\s*(error|warning|note):\s*([^\n\r]+)/g;
  let match;
  while ((match = regex.exec(output)) !== null) {
    diagnostics.push({
      line: parseInt(match[1], 10),
      column: parseInt(match[2], 10),
      severity: match[3],
      message: match[4]
    });
  }
  return diagnostics;
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'init': {
      try {
        await initCompiler();
      } catch (err) {
        self.postMessage({
          type: 'error',
          stage: 'init',
          message: err.message || String(err)
        });
      }
      break;
    }

    case 'compile_and_run': {
      if (!isInitialized) {
        await initCompiler();
      }

      const { code, stdin, options } = msg;
      const startTime = performance.now();
      let capturedOutput = '';

      // Override hostWrite to collect for diagnostic parsing and streaming
      const originalHostWrite = api.hostWrite;
      api.hostWrite = (str) => {
        capturedOutput += str;
        self.postMessage({ type: 'output', text: str });
      };

      try {
        self.postMessage({ type: 'status', status: 'compiling' });
        const lang = options?.lang || 'c';
        const std = options?.std || 'c11';
        const opt = options?.opt || '2';
        const input = lang === 'c++' ? 'test.cpp' : 'test.c';
        const obj = 'test.o';
        const wasm = 'test.wasm';

        // 1. Compile C source to object
        api.memfs.addFile(input, code);
        const clang = await api.getModule(api.clangFilename);
        await api.run(
          clang, 'clang', '-cc1', '-emit-obj',
          ...api.clangCommonArgs,
          `-std=${std}`,
          `-O${opt}`,
          '-o', obj,
          '-x', lang,
          input
        );

        // 2. Link object to WebAssembly binary
        self.postMessage({ type: 'status', status: 'linking' });
        await api.link(obj, wasm, {
          libs: ['-lc', '-lc++', '-lc++abi', '-lcanvas']
        });

        // 3. Instantiate and run
        self.postMessage({ type: 'status', status: 'running' });
        const wasmBuffer = api.memfs.getFileContents(wasm);
        const module = await WebAssembly.compile(wasmBuffer);

        // Set Stdin before execution
        api.memfs.setStdinStr(stdin || '');

        const app = new App(module, api.memfs, wasm);
        await app.run();

        const durationMs = Math.round(performance.now() - startTime);
        const diagnostics = parseDiagnostics(capturedOutput);

        self.postMessage({
          type: 'completed',
          success: true,
          exitCode: 0,
          durationMs,
          diagnostics
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        const diagnostics = parseDiagnostics(capturedOutput);
        const exitCode = (err && typeof err.code === 'number') ? err.code : 1;

        self.postMessage({
          type: 'completed',
          success: false,
          exitCode,
          durationMs,
          error: err.message,
          diagnostics
        });
      } finally {
        api.hostWrite = originalHostWrite;
      }
      break;
    }

    case 'compile_only': {
      if (!isInitialized) {
        await initCompiler();
      }

      const { code, options } = msg;
      const startTime = performance.now();
      let capturedOutput = '';

      const originalHostWrite = api.hostWrite;
      api.hostWrite = (str) => {
        capturedOutput += str;
        self.postMessage({ type: 'output', text: str });
      };

      try {
        self.postMessage({ type: 'status', status: 'compiling' });
        const lang = options?.lang || 'c';
        const std = options?.std || 'c11';
        const opt = options?.opt || '2';
        const input = lang === 'c++' ? 'test.cpp' : 'test.c';
        const obj = 'test.o';
        const wasm = 'test.wasm';

        api.memfs.addFile(input, code);
        const clang = await api.getModule(api.clangFilename);
        await api.run(
          clang, 'clang', '-cc1', '-emit-obj',
          ...api.clangCommonArgs,
          `-std=${std}`,
          `-O${opt}`,
          '-o', obj,
          '-x', lang,
          input
        );

        await api.link(obj, wasm);
        const durationMs = Math.round(performance.now() - startTime);
        const diagnostics = parseDiagnostics(capturedOutput);

        self.postMessage({
          type: 'compile_completed',
          success: true,
          durationMs,
          diagnostics
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        const diagnostics = parseDiagnostics(capturedOutput);
        self.postMessage({
          type: 'compile_completed',
          success: false,
          durationMs,
          error: err.message,
          diagnostics
        });
      } finally {
        api.hostWrite = originalHostWrite;
      }
      break;
    }

    default:
      console.warn('Unknown message type to compiler worker:', msg.type);
  }
};
