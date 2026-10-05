export type CompilerStatus = 'uninitialized' | 'downloading' | 'extracting' | 'ready' | 'compiling' | 'linking' | 'running' | 'completed' | 'error' | 'stopped';

export interface Diagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'note';
  message: string;
}

export interface CompilerOptions {
  lang: 'c' | 'c++';
  std: 'c99' | 'c11' | 'c17' | 'c++14' | 'c++17';
  opt: '0' | '1' | '2' | '3';
  timeoutMs: number;
}

export interface InitProgressEvent {
  file: string;
  loaded: number;
  total: number;
  percent: number;
  message: string;
}

export interface CompletionEvent {
  success: boolean;
  exitCode: number;
  durationMs: number;
  diagnostics: Diagnostic[];
  error?: string;
}
