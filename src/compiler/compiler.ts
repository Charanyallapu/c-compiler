import { CompilerOptions, CompilerStatus, InitProgressEvent, CompletionEvent } from './types';

export class CCompilerClient {
  private worker: Worker | null = null;
  private status: CompilerStatus = 'uninitialized';
  private executionTimeoutTimer: number | null = null;
  private isBusy = false;

  public onStatusChange?: (status: CompilerStatus, detail?: string) => void;
  public onInitProgress?: (progress: InitProgressEvent) => void;
  public onOutput?: (text: string) => void;
  public onComplete?: (event: CompletionEvent) => void;

  constructor() {
    this.createWorker();
  }

  private createWorker() {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch (e) {}
    }

    // Reference compiler-worker.js located in public/compiler/
    const workerUrl = new URL('./compiler/compiler-worker.js', window.location.href);
    this.worker = new Worker(workerUrl.href);
    this.setupWorkerListeners(this.worker);
  }

  private setupWorkerListeners(worker: Worker) {
    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'init_progress':
          this.setStatus('downloading', data.message);
          this.onInitProgress?.(data as InitProgressEvent);
          break;

        case 'ready':
          this.setStatus('ready', data.message);
          break;

        case 'status':
          this.setStatus(data.status);
          break;

        case 'output':
          this.onOutput?.(data.text);
          break;

        case 'completed': {
          this.clearTimeoutTimer();
          this.isBusy = false;
          this.setStatus('completed');
          this.onComplete?.({
            success: data.success,
            exitCode: data.exitCode,
            durationMs: data.durationMs,
            diagnostics: data.diagnostics || [],
            error: data.error
          });
          break;
        }

        case 'compile_completed': {
          this.clearTimeoutTimer();
          this.isBusy = false;
          this.setStatus('completed');
          this.onComplete?.({
            success: data.success,
            exitCode: data.success ? 0 : 1,
            durationMs: data.durationMs,
            diagnostics: data.diagnostics || [],
            error: data.error
          });
          break;
        }

        case 'error':
          this.clearTimeoutTimer();
          this.isBusy = false;
          this.setStatus('error', data.message);
          this.onOutput?.(`\n\x1b[91mError: ${data.message}\x1b[0m\n`);
          break;
      }
    };

    worker.onerror = (err) => {
      this.clearTimeoutTimer();
      this.isBusy = false;
      this.setStatus('error', err.message || 'Worker thread error');
      this.onOutput?.(`\n\x1b[91mWorker internal error: ${err.message}\x1b[0m\n`);
    };
  }

  public init() {
    if (!this.worker) this.createWorker();
    this.setStatus('downloading', 'Checking compiler cache and initializing...');
    this.worker?.postMessage({ type: 'init' });
  }

  public compileAndRun(code: string, stdin: string, options: CompilerOptions) {
    if (this.isBusy) {
      console.warn('Compiler is currently busy');
      return;
    }

    if (!this.worker) {
      this.createWorker();
    }

    this.isBusy = true;
    this.setStatus('compiling');

    // Setup execution watchdog
    this.clearTimeoutTimer();
    const timeoutMs = options.timeoutMs || 10000;
    this.executionTimeoutTimer = window.setTimeout(() => {
      this.handleTimeout(timeoutMs);
    }, timeoutMs);

    this.worker?.postMessage({
      type: 'compile_and_run',
      code,
      stdin,
      options
    });
  }

  public compileOnly(code: string, options: CompilerOptions) {
    if (this.isBusy) {
      console.warn('Compiler is currently busy');
      return;
    }

    if (!this.worker) {
      this.createWorker();
    }

    this.isBusy = true;
    this.setStatus('compiling');

    this.clearTimeoutTimer();
    const timeoutMs = options.timeoutMs || 10000;
    this.executionTimeoutTimer = window.setTimeout(() => {
      this.handleTimeout(timeoutMs);
    }, timeoutMs);

    this.worker?.postMessage({
      type: 'compile_only',
      code,
      options
    });
  }

  public stop() {
    if (!this.isBusy && this.status !== 'running' && this.status !== 'compiling') {
      return;
    }

    this.clearTimeoutTimer();
    this.onOutput?.('\n\x1b[93m[Program stopped by user]\x1b[0m\n');
    
    // Terminate worker immediately to halt infinite loop
    this.createWorker();
    this.isBusy = false;
    this.setStatus('stopped');

    this.onComplete?.({
      success: false,
      exitCode: 130, // SIGINT
      durationMs: 0,
      diagnostics: [],
      error: 'Execution stopped by user'
    });
  }

  private handleTimeout(timeoutMs: number) {
    this.clearTimeoutTimer();
    this.onOutput?.(`\n\x1b[91m[Execution timed out after ${timeoutMs / 1000}s (possible infinite loop). Terminated.]\x1b[0m\n`);

    // Reset worker
    this.createWorker();
    this.isBusy = false;
    this.setStatus('stopped', 'Execution timed out');

    this.onComplete?.({
      success: false,
      exitCode: 124, // Timeout
      durationMs: timeoutMs,
      diagnostics: [],
      error: `Process exceeded timeout limit (${timeoutMs / 1000}s)`
    });
  }

  private clearTimeoutTimer() {
    if (this.executionTimeoutTimer !== null) {
      window.clearTimeout(this.executionTimeoutTimer);
      this.executionTimeoutTimer = null;
    }
  }

  public getStatus(): CompilerStatus {
    return this.status;
  }

  private setStatus(status: CompilerStatus, detail?: string) {
    this.status = status;
    this.onStatusChange?.(status, detail);
  }
}
