import { ansiToHtml } from '../compiler/ansi';

export class TerminalPanel {
  private outputElement: HTMLElement;
  private badgeElement: HTMLElement;
  private rawBuffer: string = '';
  private autoScroll: boolean = true;

  constructor(outputElement: HTMLElement, badgeElement: HTMLElement) {
    this.outputElement = outputElement;
    this.badgeElement = badgeElement;

    // Detect user manual scroll to pause autoScroll
    this.outputElement.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.outputElement;
      this.autoScroll = scrollHeight - (scrollTop + clientHeight) < 50;
    });

    this.showWelcome();
  }

  public showWelcome(): void {
    this.outputElement.innerHTML = `
<div class="terminal-welcome">
  <div class="welcome-header">
    <span class="welcome-badge">WASM RUNTIME</span>
    <span class="welcome-version">Clang 15.0.7 &bull; C17 Standard</span>
  </div>
  <p class="welcome-desc">Interactive C execution environment powered by WebAssembly.</p>
  <p class="welcome-prompt">Press <span class="welcome-key">Run</span> or <span class="welcome-key">Ctrl+Enter</span> to compile and execute <code>main.c</code>.</p>
</div>`;
  }

  public append(text: string): void {
    // Remove welcome banner on first output
    const welcome = this.outputElement.querySelector('.terminal-welcome');
    if (welcome) {
      this.outputElement.removeChild(welcome);
    }

    this.rawBuffer += text;
    const html = ansiToHtml(text);
    
    // Efficient DOM insertion
    const temp = document.createElement('span');
    temp.innerHTML = html;
    this.outputElement.appendChild(temp);

    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  public clear(): void {
    this.rawBuffer = '';
    this.showWelcome();
    this.setBadge('Ready', 'badge-idle');
  }

  public scrollToBottom(): void {
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  public getRawText(): string {
    return this.rawBuffer;
  }

  public setBadge(
    label: string,
    type: 'badge-idle' | 'badge-running' | 'badge-success' | 'badge-error' | 'badge-warn'
  ): void {
    this.badgeElement.textContent = label;
    this.badgeElement.className = `terminal-badge ${type}`;
  }
}
