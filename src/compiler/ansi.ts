/**
 * Fast, secure ANSI escape code to HTML converter.
 * Escapes raw HTML entities and maps ANSI color/style sequences to CSS classes or inline styles.
 */

const ANSI_COLORS: Record<number, string> = {
  // Standard colors (xterm / VS Code standard)
  30: '#161b22', // Black
  31: '#f85149', // Red
  32: '#3fb950', // Green
  33: '#d29922', // Yellow
  34: '#58a6ff', // Blue
  35: '#bc8cff', // Magenta
  36: '#39c5cf', // Cyan
  37: '#d0d7de', // White
  // Bright colors
  90: '#8b949e', // Bright Black / Gray
  91: '#ff7b72', // Bright Red
  92: '#56d364', // Bright Green
  93: '#e3b341', // Bright Yellow
  94: '#79c0ff', // Bright Blue
  95: '#d2a8ff', // Bright Magenta
  96: '#56b6c2', // Bright Cyan
  97: '#e6edf3', // Bright Light Grey
};

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function ansiToHtml(input: string): string {
  if (!input) return '';

  const parts = input.split(/(\x1b\[[0-9;]*[a-zA-Z])/g);
  let html = '';
  let currentColor: string | null = null;
  let isBold = false;
  let isUnderline = false;

  for (const part of parts) {
    if (part.startsWith('\x1b[')) {
      const match = part.match(/\x1b\[([0-9;]*)m/);
      if (match) {
        const codes = match[1] === '' ? [0] : match[1].split(';').map(Number);
        for (const code of codes) {
          if (code === 0) {
            currentColor = null;
            isBold = false;
            isUnderline = false;
          } else if (code === 1) {
            isBold = true;
          } else if (code === 4) {
            isUnderline = true;
          } else if (ANSI_COLORS[code]) {
            currentColor = ANSI_COLORS[code];
          }
        }
      }
    } else if (part.length > 0) {
      const escaped = escapeHtml(part);
      const styles: string[] = [];
      if (currentColor) styles.push(`color: ${currentColor}`);
      if (isBold) styles.push('font-weight: 600');
      if (isUnderline) styles.push('text-decoration: underline');

      if (styles.length > 0) {
        html += `<span style="${styles.join('; ')}">${escaped}</span>`;
      } else {
        html += escaped;
      }
    }
  }

  return html;
}
