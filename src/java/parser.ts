import { lex, Token, JavaError } from './lexer';
import { Expr, Stmt, TypeRef, ClassDecl, Method, Field, Annotation, Program, Param } from './ast';

const PRIMS = new Set(['int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short', 'void', 'var']);
const MODS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'volatile', 'transient', 'native', 'strictfp', 'default']);

export function parse(src: string): Program {
  return new Parser(lex(src)).program();
}

class Parser {
  private i = 0;
  constructor(private toks: Token[]) {}
  private get t() { return this.toks[this.i]; }
  private peek(k = 1) { return this.toks[Math.min(this.i + k, this.toks.length - 1)]; }
  private is(text: string, k = 0) { const t = k ? this.peek(k) : this.t; return t.text === text && (t.kind === 'op' || t.kind === 'ident'); }
  private accept(text: string) { if (this.is(text)) { this.i++; return true; } return false; }
  private expect(text: string): Token {
    if (!this.is(text)) throw new JavaError(`Expected '${text}' but found '${this.t.kind === 'eof' ? 'end of file' : this.t.text}'`, this.t.line);
    return this.toks[this.i++];
  }
  private ident(): string {
    if (this.t.kind !== 'ident') throw new JavaError(`Expected a name but found '${this.t.text}'`, this.t.line);
    return this.toks[this.i++].text;
  }
  private fail(msg: string): never { throw new JavaError(msg, this.t.line); }

  program(): Program {
    const classes: ClassDecl[] = [];
    while (this.t.kind !== 'eof') {
      if (this.is('package') || this.is('import')) { while (!this.accept(';')) this.i++; continue; }
      if (this.accept(';')) continue;
      classes.push(this.classDecl());
    }
    if (!classes.length) throw new JavaError('No class found. Paste a whole OpMode class.', 1);
    return { classes };
  }

  private annotations(): Annotation[] {
    const out: Annotation[] = [];
    while (this.accept('@')) {
      const name = this.ident(); const args: Record<string, Expr> = {};
      if (this.accept('(')) {
        if (!this.is(')')) {
          if (this.t.kind === 'ident' && this.is('=', 1)) {
            do { const key = this.ident(); this.expect('='); args[key] = this.expr(); } while (this.accept(','));
          } else args['value'] = this.expr();
        }
        this.expect(')');
      }
      out.push({ name, args });
    }
    return out;
  }
  private modifiers(): Set<string> { const m = new Set<string>(); while (MODS.has(this.t.text) && this.t.kind === 'ident') m.add(this.toks[this.i++].text); return m; }

  private classDecl(): ClassDecl {
    const annotations = this.annotations(); this.modifiers();
    const line = this.t.line;
    let isEnum = false;
    if (this.accept('enum')) isEnum = true;
    else if (this.accept('interface')) this.fail('Interfaces are not supported in the simulator');
    else this.expect('class');
    const name = this.ident();
    if (this.accept('<')) this.skipAngles();
    let ext: string | null = null; const impls: string[] = [];
    if (this.accept('extends')) ext = this.qualifiedName();
    if (this.accept('implements')) { do impls.push(this.qualifiedName()); while (this.accept(',')); }
    this.expect('{');
    const cls: ClassDecl = { name, line, ext, impls, annotations, fields: [], methods: [], ctors: [], inner: [], isEnum, enumConsts: [] };
    if (isEnum) {
      while (this.t.kind === 'ident') { cls.enumConsts.push(this.ident()); if (this.accept('(')) { while (!this.is(')')) this.i++; this.expect(')'); } if (!this.accept(',')) break; }
      this.accept(';');
    }
    while (!this.accept('}')) {
      if (this.t.kind === 'eof') this.fail(`Missing '}' for class ${name}`);
      this.member(cls);
    }
    return cls;
  }
  private qualifiedName(): string { let n = this.ident(); while (this.is('.') && this.peek().kind === 'ident') { this.i++; n = this.ident(); } if (this.accept('<')) this.skipAngles(); return n; }
  private skipAngles() { let depth = 1; while (depth > 0) { if (this.t.kind === 'eof') this.fail('Unclosed <'); if (this.is('<')) depth++; else if (this.is('>')) depth--; else if (this.is('>>')) depth -= 2; else if (this.is('>>>')) depth -= 3; this.i++; } }

  private member(cls: ClassDecl) {
    const ann = this.annotations(); void ann;
    if (this.accept(';')) return;
    if (this.is('class') || this.is('enum') || ((this.t.kind === 'ident' && MODS.has(this.t.text)) && (this.is('class', 1) || this.is('enum', 1)))) { cls.inner.push(this.classDecl()); return; }
    const mods = this.modifiers();
    if (this.is('class') || this.is('enum')) { this.i--; cls.inner.push(this.classDecl()); return; }
    if (this.is('{')) { this.fail('Initializer blocks are not supported'); }
    if (this.accept('<')) this.skipAngles();
    const line = this.t.line;
    // constructor
    if (this.t.kind === 'ident' && this.t.text === cls.name && this.is('(', 1)) {
      this.i++; const params = this.params(); const body = this.block();
      cls.ctors.push({ name: cls.name, line, isStatic: false, ret: { name: 'void', dims: 0 }, params, body }); return;
    }
    const type = this.type();
    const name = this.ident();
    if (this.accept('(')) {
      this.i--; const params = this.params();
      let dims = 0; while (this.accept('[')) { this.expect(']'); dims++; }
      if (this.accept('throws')) { do this.qualifiedName(); while (this.accept(',')); }
      const body = this.is('{') ? this.block() : (this.expect(';'), null);
      cls.methods.push({ name, line, isStatic: mods.has('static'), ret: { name: type.name, dims: type.dims + dims }, params, body });
      return;
    }
    // field(s)
    let first = true;
    while (first || this.accept(',')) {
      const fname = first ? name : this.ident(); first = false;
      let dims = 0; while (this.accept('[')) { this.expect(']'); dims++; }
      const init = this.accept('=') ? (this.is('{') ? this.arrayInit() : this.expr()) : null;
      cls.fields.push({ name: fname, line, isStatic: mods.has('static'), type, dims, init });
    }
    this.expect(';');
  }

  private params(): Param[] {
    this.expect('('); const out: Param[] = [];
    if (!this.is(')')) {
      do {
        this.modifiers(); this.annotations();
        const type = this.type();
        if (this.accept('...')) type.dims++;
        const name = this.ident();
        while (this.accept('[')) { this.expect(']'); type.dims++; }
        out.push({ type, name });
      } while (this.accept(','));
    }
    this.expect(')'); return out;
  }

  private type(): TypeRef {
    let name = this.ident();
    while (this.is('.') && this.peek().kind === 'ident') { this.i++; name = this.ident(); }
    if (this.accept('<')) this.skipAngles();
    let dims = 0; while (this.is('[') && this.is(']', 1)) { this.i += 2; dims++; }
    return { name, dims };
  }

  // Is the token stream at a local variable declaration? Type name followed by an identifier.
  private looksLikeDecl(): boolean {
    if (this.t.kind !== 'ident') return false;
    if (MODS.has(this.t.text)) return true;
    let j = this.i;
    const tk = this.toks;
    if (PRIMS.has(tk[j].text)) { j++; }
    else {
      if (tk[j].kind !== 'ident') return false; j++;
      while (tk[j].text === '.' && tk[j + 1]?.kind === 'ident') j += 2;
      if (tk[j].text === '<') { let d = 1; j++; while (d > 0 && tk[j].kind !== 'eof') { if (tk[j].text === '<') d++; else if (tk[j].text === '>') d--; else if (tk[j].text === '>>') d -= 2; j++; } }
    }
    while (tk[j].text === '[' && tk[j + 1]?.text === ']') j += 2;
    return tk[j].kind === 'ident' && !['instanceof'].includes(tk[j].text);
  }

  private block(): Stmt {
    const line = this.expect('{').line; const body: Stmt[] = [];
    while (!this.accept('}')) { if (this.t.kind === 'eof') this.fail("Missing '}'"); body.push(this.stmt()); }
    return { k: 'block', line, body };
  }

  private stmt(): Stmt {
    const line = this.t.line;
    if (this.is('{')) return this.block();
    if (this.accept(';')) return { k: 'empty', line };
    if (this.accept('if')) { this.expect('('); const c = this.expr(); this.expect(')'); const then = this.stmt(); const els = this.accept('else') ? this.stmt() : null; return { k: 'if', line, c, then, else: els }; }
    if (this.accept('while')) { this.expect('('); const c = this.expr(); this.expect(')'); return { k: 'while', line, c, body: this.stmt() }; }
    if (this.accept('do')) { const body = this.stmt(); this.expect('while'); this.expect('('); const c = this.expr(); this.expect(')'); this.expect(';'); return { k: 'dowhile', line, c, body }; }
    if (this.accept('for')) {
      this.expect('(');
      if (this.looksLikeDecl()) {
        const save = this.i; this.modifiers(); const type = this.type(); const name = this.ident();
        if (this.accept(':')) { const iter = this.expr(); this.expect(')'); return { k: 'foreach', line, type, name, iter, body: this.stmt() }; }
        this.i = save;
      }
      const init: Stmt[] = [];
      if (!this.is(';')) { if (this.looksLikeDecl()) init.push(this.varDecl()); else { do init.push({ k: 'expr', line, e: this.expr() }); while (this.accept(',')); } }
      this.expect(';');
      const c = this.is(';') ? null : this.expr(); this.expect(';');
      const update: Expr[] = []; if (!this.is(')')) { do update.push(this.expr()); while (this.accept(',')); }
      this.expect(')');
      return { k: 'for', line, init, c, update, body: this.stmt() };
    }
    if (this.accept('return')) { const e = this.is(';') ? null : this.expr(); this.expect(';'); return { k: 'return', line, e }; }
    if (this.accept('break')) { if (this.t.kind === 'ident') this.fail('Labeled break is not supported'); this.expect(';'); return { k: 'break', line }; }
    if (this.accept('continue')) { if (this.t.kind === 'ident') this.fail('Labeled continue is not supported'); this.expect(';'); return { k: 'continue', line }; }
    if (this.accept('throw')) { const e = this.expr(); this.expect(';'); return { k: 'throw', line, e }; }
    if (this.accept('switch')) {
      this.expect('('); const e = this.expr(); this.expect(')'); this.expect('{');
      const cases: { values: Expr[] | null; body: Stmt[] }[] = [];
      while (!this.accept('}')) {
        let values: Expr[] | null = null;
        if (this.accept('default')) { } else { this.expect('case'); values = [this.expr()]; while (this.accept(',')) values.push(this.expr()); }
        if (this.accept('->')) this.fail('Arrow-style switch is not supported, use case X: ... break;');
        this.expect(':');
        const body: Stmt[] = [];
        while (!this.is('case') && !this.is('default') && !this.is('}')) body.push(this.stmt());
        cases.push({ values, body });
      }
      return { k: 'switch', line, e, cases };
    }
    if (this.accept('try')) {
      if (this.is('(')) this.fail('try-with-resources is not supported');
      const body = this.block(); const catches: { type: TypeRef; name: string; body: Stmt }[] = [];
      while (this.accept('catch')) { this.expect('('); this.modifiers(); const type = this.type(); while (this.accept('|')) this.type(); const name = this.ident(); this.expect(')'); catches.push({ type, name, body: this.block() }); }
      const fin = this.accept('finally') ? this.block() : null;
      return { k: 'try', line, body, catches, fin };
    }
    if (this.is('synchronized') || this.is('assert')) this.fail(`'${this.t.text}' is not supported`);
    if (this.looksLikeDecl()) { const d = this.varDecl(); this.expect(';'); return d; }
    const e = this.expr(); this.expect(';'); return { k: 'expr', line, e };
  }

  private varDecl(): Stmt {
    const line = this.t.line; this.modifiers(); this.annotations();
    const type = this.type(); const decls: { name: string; dims: number; init: Expr | null }[] = [];
    do {
      const name = this.ident(); let dims = 0; while (this.accept('[')) { this.expect(']'); dims++; }
      const init = this.accept('=') ? (this.is('{') ? this.arrayInit() : this.expr()) : null;
      decls.push({ name, dims, init });
    } while (this.accept(','));
    return { k: 'vardecl', line, type, decls };
  }

  private arrayInit(): Expr {
    const line = this.expect('{').line; const items: Expr[] = [];
    while (!this.is('}')) { items.push(this.is('{') ? this.arrayInit() : this.expr()); if (!this.accept(',')) break; }
    this.expect('}'); return { k: 'arrayinit', line, items };
  }

  // Expressions: precedence climbing.
  expr(): Expr { return this.assignment(); }

  private assignment(): Expr {
    const lhs = this.ternary();
    const ops = ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>='];
    if (this.t.kind === 'op' && ops.includes(this.t.text)) {
      const op = this.toks[this.i++].text; const line = lhs.line;
      if (!['name', 'field', 'index'].includes(lhs.k)) throw new JavaError('Left side of assignment must be a variable, field, or array element', line);
      const value = this.is('{') ? this.arrayInit() : this.assignment();
      return { k: 'assign', line, op, target: lhs, value };
    }
    return lhs;
  }
  private ternary(): Expr {
    const c = this.binary(0);
    if (this.accept('?')) { const a = this.ternary(); this.expect(':'); const b = this.ternary(); return { k: 'ternary', line: c.line, c, a, b }; }
    return c;
  }
  private static LEVELS: string[][] = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>=', 'instanceof'], ['<<', '>>', '>>>'], ['+', '-'], ['*', '/', '%']];
  private binary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let l = this.binary(level + 1);
    for (;;) {
      const ops = Parser.LEVELS[level];
      const isOp = (this.t.kind === 'op' || this.t.text === 'instanceof') && ops.includes(this.t.text);
      if (!isOp) return l;
      const op = this.toks[this.i++].text;
      if (op === 'instanceof') throw new JavaError('instanceof is not supported', l.line);
      const r = this.binary(level + 1);
      l = { k: 'binary', line: l.line, op, l, r };
    }
  }
  private unary(): Expr {
    const line = this.t.line;
    if (this.t.kind === 'op') {
      const op = this.t.text;
      if (op === '+' || op === '-' || op === '!' || op === '~') { this.i++; return { k: 'unary', line, op, e: this.unary() }; }
      if (op === '++' || op === '--') { this.i++; return { k: 'incdec', line, op, prefix: true, target: this.unary() }; }
      if (op === '(' && this.isCast()) { this.i++; const type = this.type(); this.expect(')'); return { k: 'cast', line, type, e: this.unary() }; }
    }
    return this.postfix(this.primary());
  }
  private isCast(): boolean {
    const a = this.peek(1), b = this.peek(2);
    if (a.kind !== 'ident') return false;
    if (PRIMS.has(a.text)) return true;
    // (Name) followed by something that starts an operand
    if (b.text !== ')' || !/^[A-Z]/.test(a.text)) return false;
    const c = this.peek(3);
    return c.kind === 'ident' || c.kind === 'string' || c.kind === 'int' || c.kind === 'double' || c.text === '(' || c.text === '!' || c.text === '~';
  }
  private postfix(e: Expr): Expr {
    for (;;) {
      const line = this.t.line;
      if (this.accept('.')) {
        if (this.accept('<')) this.skipAngles();
        if (this.is('class')) { this.i++; e = { k: 'classlit', line, type: this.exprToType(e) }; continue; }
        if (this.is('this')) { this.i++; continue; }
        if (this.is('new')) throw new JavaError('Inner class instantiation (x.new Y()) is not supported', line);
        const name = this.ident();
        if (this.is('(')) { const args = this.args(); e = { k: 'call', line, obj: e, name, args }; }
        else e = { k: 'field', line, obj: e, name };
      } else if (this.accept('[')) { const idx = this.expr(); this.expect(']'); e = { k: 'index', line, arr: e, idx }; }
      else if (this.is('++') || this.is('--')) { const op = this.toks[this.i++].text as '++' | '--'; e = { k: 'incdec', line, op, prefix: false, target: e }; }
      else if (this.is('::')) throw new JavaError('Method references (::) are not supported', line);
      else return e;
    }
  }
  private exprToType(e: Expr): TypeRef {
    if (e.k === 'name') return { name: e.name, dims: 0 };
    if (e.k === 'field') return { name: e.name, dims: 0 };
    throw new JavaError('Bad class literal', e.line);
  }
  private args(): Expr[] {
    this.expect('('); const out: Expr[] = [];
    if (!this.is(')')) { do out.push(this.is('{') ? this.arrayInit() : this.expr()); while (this.accept(',')); }
    this.expect(')'); return out;
  }
  private primary(): Expr {
    const t = this.t, line = t.line;
    switch (t.kind) {
      case 'int': this.i++; return { k: 'lit', line, t: 'int', v: t.value as number };
      case 'long': this.i++; return { k: 'lit', line, t: 'long', v: t.value as number };
      case 'double': this.i++; return { k: 'lit', line, t: 'double', v: t.value as number };
      case 'float': this.i++; return { k: 'lit', line, t: 'float', v: t.value as number };
      case 'string': this.i++; return { k: 'lit', line, t: 'String', v: t.value as string };
      case 'char': this.i++; return { k: 'lit', line, t: 'char', v: t.value as string };
      case 'eof': this.fail('Unexpected end of file');
    }
    if (t.kind === 'op') {
      if (this.accept('(')) {
        // lambda: (a, b) -> ...
        if (this.isLambdaParams()) { const params: string[] = []; while (!this.is(')')) { this.modifiers(); if (this.looksLikeDecl()) this.type(); params.push(this.ident()); this.accept(','); } this.expect(')'); this.expect('->'); return this.lambdaBody(params, line); }
        const e = this.expr(); this.expect(')'); return e;
      }
      this.fail(`Unexpected '${t.text}'`);
    }
    // identifiers and keywords
    if (this.accept('true')) return { k: 'lit', line, t: 'boolean', v: true };
    if (this.accept('false')) return { k: 'lit', line, t: 'boolean', v: false };
    if (this.accept('null')) return { k: 'lit', line, t: 'null', v: null };
    if (this.accept('this')) return { k: 'this', line };
    if (this.accept('super')) { this.fail("'super' calls are not supported in the simulator"); }
    if (this.accept('new')) {
      const type: TypeRef = { name: this.ident(), dims: 0 };
      while (this.is('.') && this.peek().kind === 'ident') { this.i++; type.name = this.ident(); }
      if (this.accept('<')) this.skipAngles();
      if (this.is('[')) {
        const sizes: Expr[] = [];
        while (this.accept('[')) { if (this.is(']')) { this.i++; type.dims++; } else { sizes.push(this.expr()); this.expect(']'); type.dims++; } }
        const init = this.is('{') ? this.arrayInit() : null;
        return { k: 'newarray', line, type, sizes, init };
      }
      const args = this.args();
      if (this.is('{')) this.fail('Anonymous classes are not supported');
      return { k: 'new', line, type, args };
    }
    if (t.kind === 'ident') {
      if (this.is('->', 1)) { this.i++; this.expect('->'); return this.lambdaBody([t.text], line); }
      this.i++;
      if (this.is('(')) { const args = this.args(); return { k: 'call', line, obj: null, name: t.text, args }; }
      return { k: 'name', line, name: t.text };
    }
    this.fail(`Unexpected '${t.text}'`);
  }
  private isLambdaParams(): boolean {
    let j = this.i, depth = 1;
    while (depth > 0 && this.toks[j].kind !== 'eof') { if (this.toks[j].text === '(') depth++; else if (this.toks[j].text === ')') depth--; j++; }
    return this.toks[j]?.text === '->';
  }
  private lambdaBody(params: string[], line: number): Expr {
    const body = this.is('{') ? this.block() : this.expr();
    return { k: 'lambda', line, params, body };
  }
}

export { JavaError };
export type { Program, ClassDecl, Method, Field, Stmt, Expr, TypeRef };
