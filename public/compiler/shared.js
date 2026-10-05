/*
 * Modern WebAssembly C Compiler & Runtime (LLVM Clang + LLD + MemFS)
 * Enhanced for in-browser client-side compilation and execution.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStr(u8, o, len = -1) {
  let str = '';
  let end = u8.length;
  if (len !== -1) end = o + len;
  for (let i = o; i < end && u8[i] !== 0; ++i) {
    str += String.fromCharCode(u8[i]);
  }
  return str;
}

function debounceLazy(f, ms) {
  let waiting = 0;
  let running = false;

  const wait = async () => {
    ++waiting;
    await sleep(ms);
    return --waiting === 0;
  };

  const wrapped = async (...args) => {
    if (await wait()) {
      while (running) await wait();
      running = true;
      try {
        await f(...args);
      } finally {
        running = false;
      }
    }
  };
  return wrapped;
}

const ESUCCESS = 0;

class ProcExit extends Error {
  constructor(code) {
    super(`process exited with code ${code}.`);
    this.code = code;
  }
}

class NotImplemented extends Error {
  constructor(modname, fieldname) {
    super(`${modname}.${fieldname} not implemented.`);
  }
}

class AbortError extends Error {
  constructor(msg = 'abort') {
    super(msg);
  }
}

class AssertError extends Error {
  constructor(msg) {
    super(msg);
  }
}

function assert(cond) {
  if (!cond) {
    throw new AssertError('assertion failed.');
  }
}

function getInstance(module, imports) {
  return WebAssembly.instantiate(module, imports);
}

function getImportObject(obj, names) {
  const result = {};
  for (let name of names) {
    result[name] = obj[name].bind(obj);
  }
  return result;
}

function msToSec(start, end) {
  return ((end - start) / 1000).toFixed(2);
}

class Memory {
  constructor(memory) {
    this.memory = memory;
    this.buffer = this.memory.buffer;
    this.u8 = new Uint8Array(this.buffer);
    this.u32 = new Uint32Array(this.buffer);
  }

  check() {
    if (this.buffer.byteLength === 0) {
      this.buffer = this.memory.buffer;
      this.u8 = new Uint8Array(this.buffer);
      this.u32 = new Uint32Array(this.buffer);
    }
  }

  read8(o) { return this.u8[o]; }
  read32(o) { return this.u32[o >> 2]; }
  write8(o, v) { this.u8[o] = v; }
  write32(o, v) { this.u32[o >> 2] = v; }
  write64(o, vlo, vhi = 0) {
    this.write32(o, vlo);
    this.write32(o + 4, vhi);
  }

  readStr(o, len) {
    return readStr(this.u8, o, len);
  }

  writeStr(o, str) {
    o += this.write(o, str);
    this.write8(o, 0);
    return str.length + 1;
  }

  write(o, buf) {
    if (buf instanceof ArrayBuffer) {
      return this.write(o, new Uint8Array(buf));
    } else if (typeof buf === 'string') {
      return this.write(o, buf.split('').map((x) => x.charCodeAt(0)));
    } else {
      const dst = new Uint8Array(this.buffer, o, buf.length);
      dst.set(buf);
      return buf.length;
    }
  }
}

class MemFS {
  constructor(options) {
    const compileStreaming = options.compileStreaming;
    this.hostWrite = options.hostWrite;
    this.stdinStr = options.stdinStr || '';
    this.stdinStrPos = 0;
    this.memfsFilename = options.memfsFilename;

    this.hostMem_ = null;

    const env = getImportObject(
      this,
      ['abort', 'host_write', 'host_read', 'memfs_log', 'copy_in', 'copy_out']
    );

    this.ready = compileStreaming(this.memfsFilename)
      .then((module) => WebAssembly.instantiate(module, { env }))
      .then((instance) => {
        this.instance = instance;
        this.exports = instance.exports;
        this.mem = new Memory(this.exports.memory);
        this.exports.init();
      });
  }

  set hostMem(mem) {
    this.hostMem_ = mem;
  }

  setStdinStr(str) {
    this.stdinStr = str || '';
    this.stdinStrPos = 0;
  }

  addDirectory(path) {
    this.mem.check();
    this.mem.write(this.exports.GetPathBuf(), path);
    this.exports.AddDirectoryNode(path.length);
  }

  addFile(path, contents) {
    const length =
      contents instanceof ArrayBuffer ? contents.byteLength : contents.length;
    this.mem.check();
    this.mem.write(this.exports.GetPathBuf(), path);
    const inode = this.exports.AddFileNode(path.length, length);
    const addr = this.exports.GetFileNodeAddress(inode);
    this.mem.check();
    this.mem.write(addr, contents);
  }

  getFileContents(path) {
    this.mem.check();
    this.mem.write(this.exports.GetPathBuf(), path);
    const inode = this.exports.FindNode(path.length);
    const addr = this.exports.GetFileNodeAddress(inode);
    const size = this.exports.GetFileNodeSize(inode);
    return new Uint8Array(this.mem.buffer, addr, size);
  }

  abort() {
    throw new AbortError();
  }

  host_write(fd, iovs, iovs_len, nwritten_out) {
    this.hostMem_.check();
    assert(fd <= 2);
    let size = 0;
    let str = '';
    for (let i = 0; i < iovs_len; ++i) {
      const buf = this.hostMem_.read32(iovs);
      iovs += 4;
      const len = this.hostMem_.read32(iovs);
      iovs += 4;
      str += this.hostMem_.readStr(buf, len);
      size += len;
    }
    this.hostMem_.write32(nwritten_out, size);
    this.hostWrite(str);
    return ESUCCESS;
  }

  host_read(fd, iovs, iovs_len, nread) {
    this.hostMem_.check();
    assert(fd === 0);
    let size = 0;
    for (let i = 0; i < iovs_len; ++i) {
      const buf = this.hostMem_.read32(iovs);
      iovs += 4;
      const len = this.hostMem_.read32(iovs);
      iovs += 4;
      const lenToWrite = Math.min(
        len,
        this.stdinStr.length - this.stdinStrPos
      );
      if (lenToWrite === 0) {
        break;
      }
      this.hostMem_.write(
        buf,
        this.stdinStr.substr(this.stdinStrPos, lenToWrite)
      );
      size += lenToWrite;
      this.stdinStrPos += lenToWrite;
      if (lenToWrite !== len) {
        break;
      }
    }
    this.hostMem_.write32(nread, size);
    return ESUCCESS;
  }

  memfs_log(buf, len) {
    this.mem.check();
    console.log(this.mem.readStr(buf, len));
  }

  copy_out(clang_dst, memfs_src, size) {
    this.hostMem_.check();
    const dst = new Uint8Array(this.hostMem_.buffer, clang_dst, size);
    this.mem.check();
    const src = new Uint8Array(this.mem.buffer, memfs_src, size);
    dst.set(src);
  }

  copy_in(memfs_dst, clang_src, size) {
    this.mem.check();
    const dst = new Uint8Array(this.mem.buffer, memfs_dst, size);
    this.hostMem_.check();
    const src = new Uint8Array(this.hostMem_.buffer, clang_src, size);
    dst.set(src);
  }
}

const RAF_PROC_EXIT_CODE = 0xc0c0a;

class App {
  constructor(module, memfs, name, ...args) {
    this.argv = [name, ...args];
    this.environ = { USER: 'user', HOME: '/', TERM: 'xterm-256color' };
    this.memfs = memfs;
    this.allowRequestAnimationFrame = false;
    this.handles = new Map();
    this.nextHandle = 0;

    const env = getImportObject(this, [
      'canvas_arc',
      'canvas_arcTo',
      'canvas_beginPath',
      'canvas_bezierCurveTo',
      'canvas_clearRect',
      'canvas_clip',
      'canvas_closePath',
      'canvas_createImageData',
      'canvas_destroyHandle',
      'canvas_ellipse',
      'canvas_fill',
      'canvas_fillRect',
      'canvas_fillText',
      'canvas_imageDataSetData',
      'canvas_lineTo',
      'canvas_measureText',
      'canvas_moveTo',
      'canvas_putImageData',
      'canvas_quadraticCurveTo',
      'canvas_rect',
      'canvas_requestAnimationFrame',
      'canvas_restore',
      'canvas_rotate',
      'canvas_save',
      'canvas_scale',
      'canvas_setFillStyle',
      'canvas_setFont',
      'canvas_setGlobalAlpha',
      'canvas_setHeight',
      'canvas_setLineCap',
      'canvas_setLineDashOffset',
      'canvas_setLineJoin',
      'canvas_setLineWidth',
      'canvas_setMiterLimit',
      'canvas_setShadowBlur',
      'canvas_setShadowColor',
      'canvas_setShadowOffsetX',
      'canvas_setShadowOffsetY',
      'canvas_setStrokeStyle',
      'canvas_setTextAlign',
      'canvas_setTextBaseline',
      'canvas_setTransform',
      'canvas_setWidth',
      'canvas_stroke',
      'canvas_strokeRect',
      'canvas_strokeText',
      'canvas_transform',
      'canvas_translate',
    ]);

    const wasi_unstable = getImportObject(this, [
      'proc_exit',
      'environ_sizes_get',
      'environ_get',
      'args_sizes_get',
      'args_get',
      'random_get',
      'clock_time_get',
      'poll_oneoff',
      'sched_yield'
    ]);

    Object.assign(wasi_unstable, this.memfs.exports);
    const wasi_snapshot_preview1 = wasi_unstable;

    this.ready = getInstance(module, {
      wasi_unstable,
      wasi_snapshot_preview1,
      env
    }).then((instance) => {
      this.instance = instance;
      this.exports = this.instance.exports;
      this.mem = new Memory(this.exports.memory);
      this.memfs.hostMem = this.mem;
    });
  }

  async run() {
    await this.ready;
    try {
      if (this.exports._start) {
        this.exports._start();
      } else if (this.exports.main) {
        this.exports.main(0, 0);
      }
    } catch (exn) {
      let writeStack = true;
      if (exn instanceof ProcExit) {
        if (exn.code === RAF_PROC_EXIT_CODE) {
          return true;
        }
        this.allowRequestAnimationFrame = false;
        if (exn.code === 0) {
          return false;
        }
        writeStack = false;
      }

      let msg = `\x1b[91mProcess finished with code ${exn.code !== undefined ? exn.code : 'error'}\x1b[0m\n`;
      if (writeStack) {
        msg = `\x1b[91mError: ${exn.message}\x1b[0m\n`;
      }
      this.memfs.hostWrite(msg);
      throw exn;
    }
  }

  proc_exit(code) {
    throw new ProcExit(code);
  }

  sched_yield() {
    return ESUCCESS;
  }

  environ_sizes_get(environ_count_out, environ_buf_size_out) {
    this.mem.check();
    let size = 0;
    const names = Object.getOwnPropertyNames(this.environ);
    for (const name of names) {
      const value = this.environ[name];
      size += name.length + value.length + 2;
    }
    this.mem.write64(environ_count_out, names.length);
    this.mem.write64(environ_buf_size_out, size);
    return ESUCCESS;
  }

  environ_get(environ_ptrs, environ_buf) {
    this.mem.check();
    const names = Object.getOwnPropertyNames(this.environ);
    for (const name of names) {
      this.mem.write32(environ_ptrs, environ_buf);
      environ_ptrs += 4;
      environ_buf += this.mem.writeStr(
        environ_buf,
        `${name}=${this.environ[name]}`
      );
    }
    this.mem.write32(environ_ptrs, 0);
    return ESUCCESS;
  }

  args_sizes_get(argc_out, argv_buf_size_out) {
    this.mem.check();
    let size = 0;
    for (let arg of this.argv) {
      size += arg.length + 1;
    }
    this.mem.write64(argc_out, this.argv.length);
    this.mem.write64(argv_buf_size_out, size);
    return ESUCCESS;
  }

  args_get(argv_ptrs, argv_buf) {
    this.mem.check();
    for (let arg of this.argv) {
      this.mem.write32(argv_ptrs, argv_buf);
      argv_ptrs += 4;
      argv_buf += this.mem.writeStr(argv_buf, arg);
    }
    this.mem.write32(argv_ptrs, 0);
    return ESUCCESS;
  }

  random_get(buf, buf_len) {
    this.mem.check();
    const data = new Uint8Array(this.mem.buffer, buf, buf_len);
    for (let i = 0; i < buf_len; ++i) {
      data[i] = (Math.random() * 256) | 0;
    }
    return ESUCCESS;
  }

  clock_time_get(clock_id, precision, time_out) {
    this.mem.check();
    // Clock in nanoseconds
    const now = BigInt(Date.now()) * 1000000n;
    const vlo = Number(now & 0xffffffffn);
    const vhi = Number((now >> 32n) & 0xffffffffn);
    this.mem.write64(time_out, vlo, vhi);
    return ESUCCESS;
  }

  poll_oneoff(in_ptr, out_ptr, nsubscriptions, nevents_out) {
    this.mem.check();
    this.mem.write32(nevents_out, 0);
    return ESUCCESS;
  }

  // Canvas stubs
  canvas_destroyHandle() {}
  canvas_setWidth() {}
  canvas_setHeight() {}
  canvas_requestAnimationFrame() {}
  canvas_createImageData() { return -1; }
  canvas_putImageData() {}
  canvas_imageDataSetData() {}
  canvas_arc() {}
  canvas_arcTo() {}
  canvas_beginPath() {}
  canvas_bezierCurveTo() {}
  canvas_clearRect() {}
  canvas_clip() {}
  canvas_closePath() {}
  canvas_ellipse() {}
  canvas_fill() {}
  canvas_fillRect() {}
  canvas_fillText() {}
  canvas_lineTo() {}
  canvas_measureText() { return 0; }
  canvas_moveTo() {}
  canvas_quadraticCurveTo() {}
  canvas_rect() {}
  canvas_restore() {}
  canvas_rotate() {}
  canvas_save() {}
  canvas_scale() {}
  canvas_setTransform() {}
  canvas_stroke() {}
  canvas_strokeRect() {}
  canvas_strokeText() {}
  canvas_transform() {}
  canvas_translate() {}
  canvas_setFillStyle() {}
  canvas_setFont() {}
  canvas_setGlobalAlpha() {}
  canvas_setLineCap() {}
  canvas_setLineDashOffset() {}
  canvas_setLineJoin() {}
  canvas_setLineWidth() {}
  canvas_setMiterLimit() {}
  canvas_setShadowBlur() {}
  canvas_setShadowColor() {}
  canvas_setShadowOffsetX() {}
  canvas_setShadowOffsetY() {}
  canvas_setStrokeStyle() {}
  canvas_setTextAlign() {}
  canvas_setTextBaseline() {}
}

class Tar {
  constructor(buffer) {
    this.u8 = new Uint8Array(buffer);
    this.offset = 0;
  }

  readStr(len) {
    const result = readStr(this.u8, this.offset, len);
    this.offset += len;
    return result;
  }

  readOctal(len) {
    return parseInt(this.readStr(len), 8);
  }

  alignUp() {
    this.offset = (this.offset + 511) & ~511;
  }

  readEntry() {
    if (this.offset + 512 > this.u8.length) {
      return null;
    }

    const entry = {
      filename: this.readStr(100),
      mode: this.readOctal(8),
      owner: this.readOctal(8),
      group: this.readOctal(8),
      size: this.readOctal(12),
      mtim: this.readOctal(12),
      checksum: this.readOctal(8),
      type: this.readStr(1),
      linkname: this.readStr(100),
    };

    if (this.readStr(8) !== 'ustar  ') {
      return null;
    }

    entry.ownerName = this.readStr(32);
    entry.groupName = this.readStr(32);
    entry.devMajor = this.readStr(8);
    entry.devMinor = this.readStr(8);
    entry.filenamePrefix = this.readStr(155);
    this.alignUp();

    if (entry.type === '0') {
      entry.contents = this.u8.subarray(this.offset, this.offset + entry.size);
      this.offset += entry.size;
      this.alignUp();
    } else if (entry.type !== '5') {
      assert(false);
    }
    return entry;
  }

  untar(memfs) {
    let entry;
    while ((entry = this.readEntry())) {
      switch (entry.type) {
        case '0':
          memfs.addFile(entry.filename, entry.contents);
          break;
        case '5':
          memfs.addDirectory(entry.filename);
          break;
      }
    }
  }
}

class API {
  constructor(options) {
    this.moduleCache = {};
    this.readBuffer = options.readBuffer;
    this.compileStreaming = options.compileStreaming;
    this.hostWrite = options.hostWrite;
    this.onProgress = options.onProgress || (() => {});
    this.clangFilename = options.clang || 'clang';
    this.lldFilename = options.lld || 'lld';
    this.sysrootFilename = options.sysroot || 'sysroot.tar';
    this.showTiming = options.showTiming || false;

    this.clangCommonArgs = [
      '-disable-free',
      '-isysroot',
      '/',
      '-internal-isystem',
      '/include/c++/v1',
      '-internal-isystem',
      '/include',
      '-internal-isystem',
      '/lib/clang/8.0.1/include',
      '-ferror-limit',
      '19',
      '-fmessage-length',
      '80',
      '-fcolor-diagnostics',
    ];

    this.memfs = new MemFS({
      compileStreaming: this.compileStreaming,
      hostWrite: this.hostWrite,
      memfsFilename: options.memfs || 'memfs',
    });
    this.ready = this.memfs.ready.then(() => {
      return this.untar(this.memfs, this.sysrootFilename);
    });
  }

  hostLog(message) {
    const yellowArrow = '\x1b[1;93m>\x1b[0m ';
    this.hostWrite(`${yellowArrow}${message}`);
  }

  async hostLogAsync(message, promise) {
    const start = +new Date();
    this.hostLog(`${message}...`);
    const result = await promise;
    const end = +new Date();
    this.hostWrite(' done.');
    if (this.showTiming) {
      const green = '\x1b[92m';
      const normal = '\x1b[0m';
      this.hostWrite(` ${green}(${msToSec(start, end)}s)${normal}\n`);
    }
    this.hostWrite('\n');
    return result;
  }

  async getModule(name) {
    if (this.moduleCache[name]) return this.moduleCache[name];
    const module = await this.hostLogAsync(
      `Loading module ${name}`,
      this.compileStreaming(name)
    );
    this.moduleCache[name] = module;
    return module;
  }

  async untar(memfs, filename) {
    await this.memfs.ready;
    const promise = (async () => {
      const tar = new Tar(await this.readBuffer(filename));
      tar.untar(this.memfs);
    })();
    await this.hostLogAsync(`Extracting runtime headers (${filename})`, promise);
  }

  async compile(options) {
    const input = options.input || 'test.c';
    const contents = options.contents;
    const obj = options.obj || 'test.o';
    const lang = options.lang || 'c';
    const std = options.std || (lang === 'c' ? 'c11' : 'c++14');
    const opt = options.opt !== undefined ? options.opt : '2';
    const extraArgs = options.extraArgs || [];

    await this.ready;
    this.memfs.addFile(input, contents);
    const clang = await this.getModule(this.clangFilename);
    return await this.run(
      clang,
      'clang',
      '-cc1',
      '-emit-obj',
      ...this.clangCommonArgs,
      `-std=${std}`,
      `-O${opt}`,
      ...extraArgs,
      '-o',
      obj,
      '-x',
      lang,
      input
    );
  }

  async link(obj, wasm, options = {}) {
    const stackSize = options.stackSize || 1024 * 1024;
    const libdir = 'lib/wasm32-wasi';
    const crt1 = `${libdir}/crt1.o`;
    await this.ready;
    const lld = await this.getModule(this.lldFilename);
    const libs = options.libs || ['-lc', '-lc++', '-lc++abi', '-lcanvas'];
    return await this.run(
      lld,
      'wasm-ld',
      '--no-threads',
      '--export-dynamic',
      '-z',
      `stack-size=${stackSize}`,
      `-L${libdir}`,
      crt1,
      obj,
      ...libs,
      '-o',
      wasm
    );
  }

  async run(module, ...args) {
    this.hostLog(`${args.join(' ')}\n`);
    const start = +new Date();
    const app = new App(module, this.memfs, ...args);
    const instantiate = +new Date();
    const stillRunning = await app.run();
    const end = +new Date();
    this.hostWrite('\n');
    if (this.showTiming) {
      const green = '\x1b[92m';
      const normal = '\x1b[0m';
      let msg = `${green}(${msToSec(start, instantiate)}s`;
      msg += `/${msToSec(instantiate, end)}s)${normal}\n`;
      this.hostWrite(msg);
    }
    return stillRunning ? app : null;
  }

  async compileLinkRun(contents, stdin = '', compileOptions = {}) {
    const lang = compileOptions.lang || 'c';
    const input = lang === 'c++' ? 'test.cpp' : 'test.c';
    const obj = 'test.o';
    const wasm = 'test.wasm';

    this.memfs.setStdinStr(stdin || '');
    await this.compile({ input, contents, obj, ...compileOptions });
    await this.link(obj, wasm, compileOptions);

    const buffer = this.memfs.getFileContents(wasm);
    const testMod = await this.hostLogAsync(
      `Instantiating ${wasm}`,
      WebAssembly.compile(buffer)
    );
    return await this.run(testMod, wasm);
  }
}

// Export for Web Worker and Node environments
if (typeof self !== 'undefined') {
  self.API = API;
  self.MemFS = MemFS;
  self.Tar = Tar;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API, MemFS, Tar };
}
