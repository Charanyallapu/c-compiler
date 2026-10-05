import { CompilerOptions } from '../compiler/types';

export interface AppSettings {
  theme: 'vs-dark' | 'vs-light';
  fontSize: number;
  tabSize: number;
  minimap: boolean;
  compiler: CompilerOptions;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'vs-dark',
  fontSize: 14,
  tabSize: 4,
  minimap: true,
  compiler: {
    lang: 'c',
    std: 'c11',
    opt: '2',
    timeoutMs: 10000
  }
};

const CODE_KEY = 'c_compiler_saved_code_v1';
const STDIN_KEY = 'c_compiler_saved_stdin_v1';
const SETTINGS_KEY = 'c_compiler_saved_settings_v1';

export class StorageManager {
  public static saveCode(code: string): void {
    try {
      localStorage.setItem(CODE_KEY, code);
    } catch (e) {
      console.warn('Failed to save code to localStorage:', e);
    }
  }

  public static loadCode(defaultCode: string): string {
    try {
      const code = localStorage.getItem(CODE_KEY);
      return code !== null ? code : defaultCode;
    } catch (e) {
      return defaultCode;
    }
  }

  public static saveStdin(stdin: string): void {
    try {
      localStorage.setItem(STDIN_KEY, stdin);
    } catch (e) {}
  }

  public static loadStdin(defaultStdin = ''): string {
    try {
      const stdin = localStorage.getItem(STDIN_KEY);
      return stdin !== null ? stdin : defaultStdin;
    } catch (e) {
      return defaultStdin;
    }
  }

  public static saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  public static loadSettings(): AppSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (data) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (e) {}
    return { ...DEFAULT_SETTINGS };
  }
}
