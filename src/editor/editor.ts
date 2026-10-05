import * as monaco from 'monaco-editor';
import { Diagnostic } from '../compiler/types';

// Setup Monaco worker environment for Vite
(self as any).MonacoEnvironment = {
  getWorker: function (_moduleId: any, _label: string) {
    return new Worker(
      new URL('../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' }
    );
  }
};

export class CodeEditor {
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private container: HTMLElement;
  private onRunCallback?: () => void;
  private onSaveCallback?: () => void;
  private onChangeCallback?: (value: string) => void;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public init(
    initialValue: string,
    options: {
      theme?: 'vs-dark' | 'vs-light';
      fontSize?: number;
      tabSize?: number;
      minimap?: boolean;
    } = {}
  ): void {
    // Professional Dark Theme (VS Code Dark+ standard)
    monaco.editor.defineTheme('c-compiler-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569cd6' },
        { token: 'keyword.directive', foreground: 'c586c0' },
        { token: 'type', foreground: '4ec9b0' },
        { token: 'type.identifier', foreground: '4ec9b0' },
        { token: 'string', foreground: 'ce9178' },
        { token: 'string.escape', foreground: 'd7ba7d' },
        { token: 'number', foreground: 'b5cea8' },
        { token: 'delimiter', foreground: 'd4d4d4' },
        { token: 'operator', foreground: 'd4d4d4' },
        { token: 'identifier', foreground: '9cdcfe' }
      ],
      colors: {
        'editor.background': '#18181b',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#222226',
        'editor.selectionBackground': '#264f78',
        'editor.selectionHighlightBackground': '#2d333b',
        'editorCursor.foreground': '#aeafad',
        'editorWhitespace.foreground': '#2e2e34',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#d4d4d4',
        'editorGutter.background': '#18181b',
        'editorBracketMatch.background': '#0064001a',
        'editorBracketMatch.border': '#888888',
        'editorIndentGuide.background': '#2e2e34',
        'editorIndentGuide.activeBackground': '#52525b'
      }
    });

    // Professional Light Theme (VS Code Light+ standard)
    monaco.editor.defineTheme('c-compiler-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '008000', fontStyle: 'italic' },
        { token: 'keyword', foreground: '0000ff' },
        { token: 'keyword.directive', foreground: 'af00db' },
        { token: 'type', foreground: '267f99' },
        { token: 'type.identifier', foreground: '267f99' },
        { token: 'string', foreground: 'a31515' },
        { token: 'number', foreground: '098658' },
        { token: 'delimiter', foreground: '000000' },
        { token: 'identifier', foreground: '1f2328' }
      ],
      colors: {
        'editor.background': '#f6f8fa',
        'editor.foreground': '#1f2328',
        'editor.lineHighlightBackground': '#eef1f5',
        'editor.selectionBackground': '#cce3ff',
        'editorCursor.foreground': '#1f2328',
        'editorLineNumber.foreground': '#8c959f',
        'editorLineNumber.activeForeground': '#1f2328',
        'editorGutter.background': '#f6f8fa'
      }
    });

    const theme = options.theme === 'vs-light' ? 'c-compiler-light' : 'c-compiler-dark';

    this.editor = monaco.editor.create(this.container, {
      value: initialValue,
      language: 'c',
      theme,
      fontSize: options.fontSize || 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      tabSize: options.tabSize || 4,
      minimap: { enabled: options.minimap !== false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      bracketPairColorization: { enabled: true },
      renderWhitespace: 'selection',
      formatOnPaste: true,
      cursorBlinking: 'smooth',
      lineNumbersMinChars: 3
    });

    // Keybindings: Ctrl+Enter (Cmd+Enter) to Run
    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => {
        this.onRunCallback?.();
      }
    );

    // Keybindings: Ctrl+S (Cmd+S) to Save locally
    this.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        this.onSaveCallback?.();
      }
    );

    // Track changes
    this.editor.onDidChangeModelContent(() => {
      if (this.editor) {
        this.onChangeCallback?.(this.editor.getValue());
      }
    });

    // Track cursor position
    this.editor.onDidChangeCursorPosition((e) => {
      this.onCursorCallback?.(e.position.lineNumber, e.position.column);
    });
  }

  private onCursorCallback?: (line: number, col: number) => void;

  public setOnCursorPosition(cb: (line: number, col: number) => void) {
    this.onCursorCallback = cb;
  }

  public format(): void {
    this.editor?.getAction('editor.action.formatDocument')?.run();
  }

  public setOnRun(cb: () => void) {
    this.onRunCallback = cb;
  }

  public setOnSave(cb: () => void) {
    this.onSaveCallback = cb;
  }

  public setOnChange(cb: (value: string) => void) {
    this.onChangeCallback = cb;
  }

  public getValue(): string {
    return this.editor?.getValue() || '';
  }

  public setValue(code: string): void {
    if (this.editor) {
      this.editor.setValue(code);
    }
  }

  public setTheme(theme: 'vs-dark' | 'vs-light'): void {
    monaco.editor.setTheme(theme === 'vs-light' ? 'c-compiler-light' : 'c-compiler-dark');
  }

  public setFontSize(fontSize: number): void {
    this.editor?.updateOptions({ fontSize });
  }

  public setTabSize(tabSize: number): void {
    this.editor?.getModel()?.updateOptions({ tabSize });
  }

  public setMinimap(enabled: boolean): void {
    this.editor?.updateOptions({ minimap: { enabled } });
  }

  public setDiagnostics(diagnostics: Diagnostic[]): void {
    const model = this.editor?.getModel();
    if (!model) return;

    const markers: monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
      startLineNumber: d.line,
      startColumn: d.column || 1,
      endLineNumber: d.line,
      endColumn: d.column ? d.column + 5 : 80,
      message: d.message,
      severity:
        d.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : d.severity === 'warning'
          ? monaco.MarkerSeverity.Warning
          : monaco.MarkerSeverity.Info
    }));

    monaco.editor.setModelMarkers(model, 'clang', markers);
  }

  public clearDiagnostics(): void {
    const model = this.editor?.getModel();
    if (model) {
      monaco.editor.setModelMarkers(model, 'clang', []);
    }
  }

  public resize(): void {
    this.editor?.layout();
  }
}
