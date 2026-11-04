// Tokenizer for the Java subset. Keeps line numbers for error messages.
export type TokKind = 'ident' | 'int' | 'long' | 'double' | 'float' | 'string' | 'char' | 'op' | 'eof';
export interface Token { kind: TokKind; text: string; line: number; col: number; value?: number | string }

export class JavaError extends Error {
  constructor(msg: string, public line: number, public kind: 'compile' | 'runtime' | 'unsupported' = 'compile') { super(msg); }
}

const OPS = ['>>>=', '<<=', '>>=', '>>>', '...', '->', '::', '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '&', '|', '^', '@'];

export function lex(src: string): Token[] {
  const out: Token[] = [];
  let i = 0, line = 1, col = 1;
  const n = src.length;
  const adv = (k = 1) => { for (let j = 0; j < k; j++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { adv(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') { adv(2); while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv(); adv(2); continue; }
    const startLine = line, startCol = col;
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      const text = src.slice(i, j); adv(j - i);
      out.push({ kind: 'ident', text, line: startLine, col: startCol }); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) { j += 2; while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++; }
      else {
        while (j < n && /[0-9_]/.test(src[j])) j++;
        let isFloat = false;
        if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) { isFloat = true; j++; while (j < n && /[0-9_]/.test(src[j])) j++; }
        else if (src[j] === '.' && !/[A-Za-z_]/.test(src[j + 1] ?? '')) { isFloat = true; j++; }
        if (src[j] === 'e' || src[j] === 'E') { isFloat = true; j++; if (src[j] === '+' || src[j] === '-') j++; while (j < n && /[0-9]/.test(src[j])) j++; }
        const suffix = src[j];
        const text = src.slice(i, j).replace(/_/g, '');
        let kind: TokKind = isFloat ? 'double' : 'int';
        if (suffix === 'd' || suffix === 'D') { kind = 'double'; j++; }
        else if (suffix === 'f' || suffix === 'F') { kind = 'float'; j++; }
        else if (suffix === 'L' || suffix === 'l') { kind = 'long'; j++; }
        const full = src.slice(i, j); adv(j - i);
        out.push({ kind, text: full, line: startLine, col: startCol, value: parseFloat(text) }); continue;
      }
      const text = src.slice(i, j).replace(/_/g, ''); adv(j - i);
      out.push({ kind: 'int', text, line: startLine, col: startCol, value: parseInt(text, 16) }); continue;
    }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '"') { if (src[j] === '\\') { const e = src[j + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; } else { if (src[j] === '\n') throw new JavaError('Unterminated string', startLine); s += src[j++]; } }
      if (j >= n) throw new JavaError('Unterminated string', startLine);
      adv(j + 1 - i); out.push({ kind: 'string', text: s, line: startLine, col: startCol, value: s }); continue;
    }
    if (c === "'") {
      let j = i + 1, s = '';
      if (src[j] === '\\') { const e = src[j + 1]; s = e === 'n' ? '\n' : e === 't' ? '\t' : e; j += 2; } else s = src[j++];
      if (src[j] !== "'") throw new JavaError('Bad char literal', startLine);
      adv(j + 1 - i); out.push({ kind: 'char', text: s, line: startLine, col: startCol, value: s }); continue;
    }
    const op = OPS.find(o => src.startsWith(o, i));
    if (!op) throw new JavaError(`Unexpected character '${c}'`, startLine);
    adv(op.length); out.push({ kind: 'op', text: op, line: startLine, col: startCol });
  }
  out.push({ kind: 'eof', text: '', line, col });
  return out;
}
