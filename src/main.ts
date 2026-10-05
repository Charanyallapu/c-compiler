import { CCompilerClient } from './compiler/compiler';
import { CodeEditor } from './editor/editor';
import { TEMPLATES } from './editor/templates';
import { TerminalPanel } from './terminal/terminal';
import { StorageManager, AppSettings } from './storage/storage';
import { LayoutManager } from './ui/layout';
import { ModalManager } from './ui/modal';

class App {
  private compiler: CCompilerClient;
  private editor: CodeEditor;
  private terminal: TerminalPanel;
  private settings: AppSettings;
  private stdinInput: HTMLTextAreaElement;
  private layout: LayoutManager;

  // UI Elements
  private btnRun: HTMLButtonElement;
  private btnCompile: HTMLButtonElement;
  private btnStop: HTMLButtonElement;
  private btnClear: HTMLButtonElement;
  private btnReset: HTMLButtonElement;
  private btnDownload: HTMLButtonElement;
  private btnUpload: HTMLButtonElement;
  private fileUploadInput: HTMLInputElement;
  private btnSettings: HTMLButtonElement;
  private btnThemeToggle: HTMLButtonElement;
  private templateSelect: HTMLSelectElement;
  private progressBanner: HTMLElement;
  private progressText: HTMLElement;
  private progressBarFill: HTMLElement;
  private statusIndicator: HTMLElement;
  private executionMetrics: HTMLElement | null;
  private cursorPositionEl: HTMLElement | null;

  constructor() {
    this.settings = StorageManager.loadSettings();

    // Elements
    this.btnRun = document.getElementById('btn-run') as HTMLButtonElement;
    this.btnCompile = document.getElementById('btn-compile') as HTMLButtonElement;
    this.btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    this.btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
    this.btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
    this.btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
    this.btnUpload = document.getElementById('btn-upload') as HTMLButtonElement;
    this.fileUploadInput = document.getElementById('file-upload') as HTMLInputElement;
    this.btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
    this.btnThemeToggle = document.getElementById('btn-theme-toggle') as HTMLButtonElement;
    this.templateSelect = document.getElementById('template-select') as HTMLSelectElement;
    this.stdinInput = document.getElementById('stdin-input') as HTMLTextAreaElement;

    this.progressBanner = document.getElementById('progress-banner') as HTMLElement;
    this.progressText = document.getElementById('progress-text') as HTMLElement;
    this.progressBarFill = document.getElementById('progress-bar-fill') as HTMLElement;
    this.statusIndicator = document.getElementById('status-indicator') as HTMLElement;
    this.executionMetrics = document.getElementById('execution-metrics');
    this.cursorPositionEl = document.getElementById('cursor-position');

    // Initialize Terminal
    const terminalOutput = document.getElementById('terminal-output') as HTMLElement;
    const terminalBadge = document.getElementById('terminal-badge') as HTMLElement;
    this.terminal = new TerminalPanel(terminalOutput, terminalBadge);

    // Initialize Editor
    const editorContainer = document.getElementById('editor-container') as HTMLElement;
    this.editor = new CodeEditor(editorContainer);
    const initialCode = StorageManager.loadCode(TEMPLATES[0].code);
    this.editor.init(initialCode, {
      theme: this.settings.theme,
      fontSize: this.settings.fontSize,
      tabSize: this.settings.tabSize,
      minimap: this.settings.minimap
    });

    this.editor.setOnCursorPosition((line, col) => {
      if (this.cursorPositionEl) {
        this.cursorPositionEl.textContent = `Ln ${line}, Col ${col}`;
      }
    });

    // Initialize Stdin
    const initialStdin = StorageManager.loadStdin(TEMPLATES[0].defaultStdin || '');
    this.stdinInput.value = initialStdin;

    // Initialize Layout Splitters
    const editorPane = document.getElementById('editor-pane') as HTMLElement;
    const rightPane = document.getElementById('right-pane') as HTMLElement;
    const terminalPane = document.getElementById('terminal-pane') as HTMLElement;
    const stdinPane = document.getElementById('stdin-pane') as HTMLElement;
    const hSplitter = document.getElementById('h-splitter') as HTMLElement;
    const vSplitter = document.getElementById('v-splitter') as HTMLElement;

    this.layout = new LayoutManager(
      editorPane,
      rightPane,
      terminalPane,
      stdinPane,
      hSplitter,
      vSplitter
    );
    this.layout.setOnResize(() => this.editor.resize());

    // Initialize Compiler
    this.compiler = new CCompilerClient();
    this.setupCompilerCallbacks();
    this.setupUIEvents();
    this.populateTemplates();
    this.applySettingsToUI();
    ModalManager.setupDismissListeners();

    // Start compiler download/caching
    this.compiler.init();

    // Register Service Worker for offline PWA
    this.registerServiceWorker();
  }

  private setupCompilerCallbacks() {
    this.compiler.onInitProgress = (prog) => {
      this.progressBanner.style.display = 'flex';
      this.progressBarFill.style.width = `${prog.percent}%`;
      this.progressText.textContent = `${prog.message} (${prog.percent}%)`;
    };

    this.compiler.onStatusChange = (status, detail) => {
      this.updateStatusUI(status, detail);
    };

    this.compiler.onOutput = (text) => {
      this.terminal.append(text);
    };

    this.compiler.onComplete = (result) => {
      this.setExecutingState(false);

      if (this.executionMetrics) {
        this.executionMetrics.textContent = `Execution: ${(result.durationMs / 1000).toFixed(2)}s | Exit: ${result.exitCode}`;
      }

      if (result.success) {
        this.terminal.setBadge(
          `Success: Exit code ${result.exitCode} (${(result.durationMs / 1000).toFixed(2)}s)`,
          'badge-success'
        );
      } else if (result.exitCode === 130) {
        this.terminal.setBadge('Stopped by user', 'badge-warn');
      } else if (result.exitCode === 124) {
        this.terminal.setBadge('Timed out', 'badge-error');
      } else {
        this.terminal.setBadge(
          `Error: Exit code ${result.exitCode} (${(result.durationMs / 1000).toFixed(2)}s)`,
          'badge-error'
        );
      }

      // Update Monaco squiggly red/yellow markers
      if (result.diagnostics && result.diagnostics.length > 0) {
        this.editor.setDiagnostics(result.diagnostics);
      } else {
        this.editor.clearDiagnostics();
      }
    };
  }

  private updateStatusUI(status: string, detail?: string) {
    let dotClass = 'dot-idle';
    let text = 'Ready';

    switch (status) {
      case 'downloading':
        dotClass = 'dot-warn';
        text = detail || 'Downloading WASM...';
        break;

      case 'ready':
        this.progressBanner.style.display = 'none';
        dotClass = 'dot-ready';
        text = 'Ready';
        ModalManager.showToast('C Compiler ready');
        break;

      case 'compiling':
        this.setExecutingState(true);
        dotClass = 'dot-active';
        text = 'Compiling...';
        this.terminal.setBadge('Compiling', 'badge-running');
        break;

      case 'linking':
        dotClass = 'dot-active';
        text = 'Linking...';
        this.terminal.setBadge('Linking', 'badge-running');
        break;

      case 'running':
        dotClass = 'dot-active';
        text = 'Running...';
        this.terminal.setBadge('Running', 'badge-running');
        break;

      case 'completed':
        dotClass = 'dot-ready';
        text = 'Ready';
        break;

      case 'stopped':
        this.setExecutingState(false);
        dotClass = 'dot-idle';
        text = detail || 'Stopped';
        break;

      case 'error':
        this.setExecutingState(false);
        dotClass = 'dot-error';
        text = 'Error';
        break;
    }

    this.statusIndicator.innerHTML = `<span class="status-dot ${dotClass}"></span><span>${text}</span>`;
  }

  private setExecutingState(isExecuting: boolean) {
    this.btnRun.disabled = isExecuting;
    this.btnCompile.disabled = isExecuting;
    this.btnStop.disabled = !isExecuting;

    if (isExecuting) {
      this.btnRun.classList.add('loading');
    } else {
      this.btnRun.classList.remove('loading');
    }
  }

  private setupUIEvents() {
    // Run action
    const triggerRun = () => {
      if (this.compiler.getStatus() === 'downloading') {
        ModalManager.showToast('Please wait for the C compiler to finish loading.');
        return;
      }

      // If currently viewing stdin full-height, switch to terminal view so output is visible
      const activeTab = document.querySelector('.pane-tab.active');
      if (activeTab?.getAttribute('data-pane') === 'stdin') {
        const termTab = document.querySelector('.pane-tab[data-pane="terminal"]') as HTMLElement;
        termTab?.click();
      }

      this.editor.clearDiagnostics();
      this.terminal.clear();
      this.terminal.append('\x1b[96m> Compiling and running C program in WebAssembly...\x1b[0m\n');
      
      const code = this.editor.getValue();
      const stdin = this.stdinInput.value;
      this.compiler.compileAndRun(code, stdin, this.settings.compiler);
    };

    // Compile only action
    const triggerCompile = () => {
      if (this.compiler.getStatus() === 'downloading') {
        ModalManager.showToast('Please wait for the C compiler to finish loading.');
        return;
      }
      this.editor.clearDiagnostics();
      this.terminal.clear();
      this.terminal.append('\x1b[96m> Compiling C code to WebAssembly object...\x1b[0m\n');

      const code = this.editor.getValue();
      this.compiler.compileOnly(code, this.settings.compiler);
    };

    this.btnRun.addEventListener('click', triggerRun);
    this.btnCompile.addEventListener('click', triggerCompile);
    this.btnStop.addEventListener('click', () => this.compiler.stop());
    this.btnClear.addEventListener('click', () => this.terminal.clear());

    // Right pane view switcher tabs (Terminal, Input stdin, Split)
    const paneTabs = document.querySelectorAll('.pane-tab');
    paneTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        paneTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.getAttribute('data-pane') as 'terminal' | 'stdin' | 'split';
        if (mode) {
          this.layout.setViewMode(mode);
        }
      });
    });

    // Editor hooks
    this.editor.setOnRun(triggerRun);
    this.editor.setOnSave(() => {
      StorageManager.saveCode(this.editor.getValue());
      StorageManager.saveStdin(this.stdinInput.value);
      ModalManager.showToast('Code saved to local storage!');
    });

    // Auto-save code on change (debounced)
    let autoSaveTimer: number | null = null;
    this.editor.setOnChange((code) => {
      if (autoSaveTimer) window.clearTimeout(autoSaveTimer);
      autoSaveTimer = window.setTimeout(() => {
        StorageManager.saveCode(code);
      }, 500);
    });

    this.stdinInput.addEventListener('input', () => {
      StorageManager.saveStdin(this.stdinInput.value);
    });

    // Reset code
    this.btnReset.addEventListener('click', () => {
      if (confirm('Reset code to default template? Unsaved changes will be replaced.')) {
        const selectedId = this.templateSelect.value;
        const tmpl = TEMPLATES.find((t) => t.id === selectedId) || TEMPLATES[0];
        this.editor.setValue(tmpl.code);
        this.stdinInput.value = tmpl.defaultStdin || '';
        StorageManager.saveCode(tmpl.code);
        StorageManager.saveStdin(this.stdinInput.value);
        this.editor.clearDiagnostics();
        ModalManager.showToast('Code reset to template');
      }
    });

    // Download .c file
    this.btnDownload.addEventListener('click', () => {
      const code = this.editor.getValue();
      const blob = new Blob([code], { type: 'text/x-c;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'main.c';
      a.click();
      URL.revokeObjectURL(url);
      ModalManager.showToast('Downloaded main.c');
    });

    // Upload .c file
    this.btnUpload.addEventListener('click', () => {
      this.fileUploadInput.click();
    });

    this.fileUploadInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          this.editor.setValue(content);
          StorageManager.saveCode(content);
          ModalManager.showToast(`Loaded ${file.name}`);
        }
      };
      reader.readAsText(file);
      this.fileUploadInput.value = '';
    });

    // Copy terminal output
    const btnCopyOutput = document.getElementById('btn-copy-output');
    btnCopyOutput?.addEventListener('click', () => {
      const text = this.terminal.getRawText();
      if (!text) {
        ModalManager.showToast('Terminal is empty');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        ModalManager.showToast('Output copied to clipboard!');
      });
    });

    // Clear terminal button in terminal header
    const btnClearTerm = document.getElementById('btn-clear-term');
    btnClearTerm?.addEventListener('click', () => {
      this.terminal.clear();
      ModalManager.showToast('Terminal cleared');
    });

    // Format code button in editor tab strip
    const btnFormat = document.getElementById('btn-format');
    btnFormat?.addEventListener('click', () => {
      this.editor.format();
      ModalManager.showToast('Code formatted');
    });

    // Settings Modal
    this.btnSettings.addEventListener('click', () => {
      ModalManager.open('modal-settings');
    });

    const settingsForm = document.getElementById('form-settings') as HTMLFormElement;
    settingsForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettingsFromUI();
      ModalManager.close('modal-settings');
      ModalManager.showToast('Settings saved!');
    });

    // Theme Toggle
    this.btnThemeToggle.addEventListener('click', () => {
      const newTheme = this.settings.theme === 'vs-dark' ? 'vs-light' : 'vs-dark';
      this.setTheme(newTheme);
    });

    // Quick Stdin Presets with Active State Highlight
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        presetBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const val = btn.getAttribute('data-value');
        if (val !== null) {
          this.stdinInput.value = val;
          StorageManager.saveStdin(val);
        }
      });
    });

    // Mobile tabs switcher
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const editorPane = document.getElementById('editor-pane');
        const terminalPane = document.getElementById('terminal-pane');
        const stdinPane = document.getElementById('stdin-pane');

        if (window.innerWidth <= 768) {
          if (editorPane) editorPane.style.display = tab === 'code' ? 'flex' : 'none';
          if (terminalPane) terminalPane.style.display = tab === 'output' ? 'flex' : 'none';
          if (stdinPane) stdinPane.style.display = tab === 'stdin' ? 'flex' : 'none';
          this.editor.resize();
        }
      });
    });
  }

  private populateTemplates() {
    this.templateSelect.innerHTML = '';
    TEMPLATES.forEach((tmpl) => {
      const opt = document.createElement('option');
      opt.value = tmpl.id;
      opt.textContent = tmpl.name;
      this.templateSelect.appendChild(opt);
    });

    this.templateSelect.addEventListener('change', () => {
      const tmpl = TEMPLATES.find((t) => t.id === this.templateSelect.value);
      if (tmpl) {
        this.editor.setValue(tmpl.code);
        this.stdinInput.value = tmpl.defaultStdin || '';
        StorageManager.saveCode(tmpl.code);
        StorageManager.saveStdin(this.stdinInput.value);
        this.editor.clearDiagnostics();
        ModalManager.showToast(`Loaded template: ${tmpl.name}`);
      }
    });
  }

  private applySettingsToUI() {
    (document.getElementById('setting-std') as HTMLSelectElement).value = this.settings.compiler.std;
    (document.getElementById('setting-opt') as HTMLSelectElement).value = this.settings.compiler.opt;
    (document.getElementById('setting-timeout') as HTMLSelectElement).value = String(
      this.settings.compiler.timeoutMs / 1000
    );
    (document.getElementById('setting-font-size') as HTMLInputElement).value = String(
      this.settings.fontSize
    );
    (document.getElementById('setting-tab-size') as HTMLSelectElement).value = String(
      this.settings.tabSize
    );
    (document.getElementById('setting-minimap') as HTMLInputElement).checked = this.settings.minimap;

    this.setTheme(this.settings.theme, false);
  }

  private saveSettingsFromUI() {
    const std = (document.getElementById('setting-std') as HTMLSelectElement).value as any;
    const opt = (document.getElementById('setting-opt') as HTMLSelectElement).value as any;
    const timeoutSec = parseInt(
      (document.getElementById('setting-timeout') as HTMLSelectElement).value,
      10
    );
    const fontSize = parseInt(
      (document.getElementById('setting-font-size') as HTMLInputElement).value,
      10
    );
    const tabSize = parseInt(
      (document.getElementById('setting-tab-size') as HTMLSelectElement).value,
      10
    );
    const minimap = (document.getElementById('setting-minimap') as HTMLInputElement).checked;

    this.settings.compiler.std = std;
    this.settings.compiler.opt = opt;
    this.settings.compiler.timeoutMs = timeoutSec * 1000;
    this.settings.fontSize = fontSize;
    this.settings.tabSize = tabSize;
    this.settings.minimap = minimap;

    this.editor.setFontSize(fontSize);
    this.editor.setTabSize(tabSize);
    this.editor.setMinimap(minimap);

    StorageManager.saveSettings(this.settings);
  }

  private setTheme(theme: 'vs-dark' | 'vs-light', save = true) {
    this.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme === 'vs-light' ? 'light' : 'dark');
    this.editor.setTheme(theme);

    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    if (sunIcon && moonIcon) {
      if (theme === 'vs-light') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
      } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
      }
    }

    if (save) {
      StorageManager.saveSettings(this.settings);
    }
  }

  private registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker
        .register('./sw.js')
        .then(() => console.log('Service Worker registered successfully'))
        .catch((err) => console.log('Service Worker registration skipped:', err));
    }
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
