export class LayoutManager {
  private editorPane: HTMLElement;
  private rightPane: HTMLElement;
  private terminalPane: HTMLElement;
  private stdinPane: HTMLElement;
  private hSplitter: HTMLElement;
  private vSplitter: HTMLElement;
  private onResizeCallback?: () => void;

  constructor(
    editorPane: HTMLElement,
    rightPane: HTMLElement,
    terminalPane: HTMLElement,
    stdinPane: HTMLElement,
    hSplitter: HTMLElement,
    vSplitter: HTMLElement
  ) {
    this.editorPane = editorPane;
    this.rightPane = rightPane;
    this.terminalPane = terminalPane;
    this.stdinPane = stdinPane;
    this.hSplitter = hSplitter;
    this.vSplitter = vSplitter;

    this.setupHorizontalSplitter();
    this.setupVerticalSplitter();
    this.setupWindowResize();
  }

  public setOnResize(cb: () => void) {
    this.onResizeCallback = cb;
  }

  private setupHorizontalSplitter(): void {
    let isDragging = false;

    this.hSplitter.addEventListener('mousedown', (e) => {
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerRect = this.editorPane.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const offsetLeft = e.clientX - containerRect.left;
      const totalWidth = containerRect.width;
      const minWidth = 250;

      if (offsetLeft >= minWidth && totalWidth - offsetLeft >= minWidth) {
        const percent = (offsetLeft / totalWidth) * 100;
        this.editorPane.style.width = `${percent}%`;
        this.rightPane.style.width = `${100 - percent}%`;
        this.onResizeCallback?.();
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.onResizeCallback?.();
      }
    });
  }

  private setupVerticalSplitter(): void {
    let isDragging = false;

    this.vSplitter.addEventListener('mousedown', (e) => {
      isDragging = true;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rightRect = this.rightPane.getBoundingClientRect();
      const offsetTop = e.clientY - rightRect.top;
      const totalHeight = rightRect.height;
      const minHeight = 100;

      if (offsetTop >= minHeight && totalHeight - offsetTop >= minHeight) {
        const percent = (offsetTop / totalHeight) * 100;
        this.terminalPane.style.height = `${percent}%`;
        this.stdinPane.style.height = `${100 - percent}%`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  private setupWindowResize(): void {
    window.addEventListener('resize', () => {
      this.onResizeCallback?.();
    });
  }

  public setViewMode(mode: 'terminal' | 'stdin' | 'split'): void {
    if (mode === 'terminal') {
      this.terminalPane.style.display = 'flex';
      this.terminalPane.style.height = '100%';
      this.stdinPane.style.display = 'none';
      this.vSplitter.style.display = 'none';
    } else if (mode === 'stdin') {
      this.terminalPane.style.display = 'none';
      this.stdinPane.style.display = 'flex';
      this.stdinPane.style.height = '100%';
      this.vSplitter.style.display = 'none';
    } else {
      this.terminalPane.style.display = 'flex';
      this.terminalPane.style.height = '62%';
      this.stdinPane.style.display = 'flex';
      this.stdinPane.style.height = '38%';
      this.vSplitter.style.display = 'block';
    }
  }
}
