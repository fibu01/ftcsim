// Tree-walking interpreter for the Java subset. Every eval is a generator so a LinearOpMode's
// while (opModeIsActive()) loop can yield to the simulator once per tick.
import { Expr, Stmt, ClassDecl, Method, Program, TypeRef } from './ast';
import { JavaError } from './lexer';

export type Prim = 'int' | 'long' | 'double' | 'float' | 'boolean' | 'char' | 'String' | 'null' | 'void' | 'ref';
export interface Value { t: Prim; v: any }
export const V = {
  int: (v: number): Value => ({ t: 'int', v: v | 0 }),
  long: (v: number): Value => ({ t: 'long', v: Math.trunc(v) }),
  double: (v: number): Value => ({ t: 'double', v }),
  bool: (v: boolean): Value => ({ t: 'boolean', v }),
  str: (v: string): Value => ({ t: 'String', v }),
  ref: (v: any): Value => ({ t: 'ref', v }),
  null: (): Value => ({ t: 'null', v: null }),
  void: (): Value => ({ t: 'void', v: undefined }),
};
const INT_T = new Set(['int', 'long', 'char']);

// Something the OpMode waits on. The runner decides how many ticks it costs.
export class Yield { constructor(public kind: 'tick' | 'sleep' | 'waitForStart' | 'budget', public ms = 0) {} }

// A native (simulator) object the Java code can call methods on and read fields from.
export interface Native {
  jclass: string;
  jcall?(name: string, args: Value[], line: number): Value | Yield | Generator<Yield, Value, Value>;
  jget?(name: string, line: number): Value;
  jset?(name: string, v: Value, line: number): void;
}
// A native class: static members and a constructor.
export interface NativeClass {
  jclass: string;
  jstatic?(name: string, line: number): Value;
  jcallStatic?(name: string, args: Value[], line: number): Value;
  jnew?(args: Value[], line: number): Native;
}
export interface JEnum extends Native { jclass: string; name: string; ordinal: number }

export class JArray { constructor(public elem: string, public items: Value[]) {} }
export class Instance {
  fields = new Map<string, Value>();
  constructor(public cls: UserClass) {}
}
export class Lambda { constructor(public params: string[], public body: Expr | Stmt, public env: Env, public self: Instance | null) {} }

class Env {
  vars = new Map<string, Value>();
  constructor(public parent: Env | null) {}
  lookup(name: string): Env | null { let e: Env | null = this; while (e) { if (e.vars.has(name)) return e; e = e.parent; } return null; }
}

class Signal { constructor(public kind: 'return' | 'break' | 'continue', public value?: Value) {} }
export class JavaThrow extends Error { constructor(public value: Value, public line: number) { super('Java exception'); } }

export class UserClass {
  statics = new Map<string, Value>();
  methods = new Map<string, Method[]>();
  constructor(public decl: ClassDecl, public interp: Interpreter) {
    for (const m of decl.methods) { if (!this.methods.has(m.name)) this.methods.set(m.name, []); this.methods.get(m.name)!.push(m); }
  }
  find(name: string, argc: number): Method | null {
    const list = this.methods.get(name); if (!list) return this.parent()?.find(name, argc) ?? null;
    return list.find(m => m.params.length === argc) ?? list[0];
  }
  parent(): UserClass | null { return this.decl.ext ? this.interp.classes.get(this.decl.ext) ?? null : null; }
  isSubclassOf(name: string): boolean { let c: UserClass | null = this; while (c) { if (c.decl.name === name || c.decl.ext === name) return true; c = c.parent(); } return false; }
}

export function defaultValue(type: TypeRef, dims = 0): Value {
  if (dims > 0 || type.dims > 0) return V.null();
  switch (type.name) {
    case 'int': case 'short': case 'byte': return V.int(0);
    case 'long': return V.long(0);
    case 'double': case 'float': return V.double(0);
    case 'boolean': return V.bool(false);
    case 'char': return { t: 'char', v: 0 };
    default: return V.null();
  }
}

export function coerce(v: Value, type: TypeRef, line: number): Value {
  if (type.dims > 0) return v;
  switch (type.name) {
    case 'int': case 'short': case 'byte':
      if (v.t === 'double' || v.t === 'float') throw new JavaError(`Can't assign a double to an int without a cast`, line, 'compile');
      return v.t === 'boolean' || v.t === 'String' ? bad(v, 'int', line) : V.int(v.v);
    case 'long': return v.t === 'double' || v.t === 'float' ? bad(v, 'long', line) : V.long(v.v);
    case 'double': case 'float': return v.t === 'boolean' || v.t === 'String' || v.t === 'ref' ? bad(v, 'double', line) : V.double(v.v);
    case 'boolean': return v.t === 'boolean' ? v : bad(v, 'boolean', line);
    case 'String': return v.t === 'String' || v.t === 'null' ? v : bad(v, 'String', line);
    case 'var': return v;
    default: return v;
  }
}
function bad(v: Value, want: string, line: number): never { throw new JavaError(`Can't assign ${describe(v)} to ${want}`, line, 'compile'); }
export function describe(v: Value): string { return v.t === 'ref' ? (v.v?.jclass ?? v.v?.cls?.decl.name ?? (v.v instanceof JArray ? 'array' : 'object')) : v.t; }

export function truthy(v: Value, line: number): boolean { if (v.t !== 'boolean') throw new JavaError(`Expected a boolean condition, got ${describe(v)}`, line, 'compile'); return v.v; }

export function toJavaString(v: Value): string {
  switch (v.t) {
    case 'String': return v.v;
    case 'null': return 'null';
    case 'boolean': return v.v ? 'true' : 'false';
    case 'char': return typeof v.v === 'number' ? String.fromCharCode(v.v) : v.v;
    case 'int': case 'long': return String(v.v);
    case 'double': case 'float': return fmtDouble(v.v);
    case 'ref': {
      const o = v.v;
      if (o instanceof JArray) return '[' + o.elem + '@' + o.items.length + ']';
      if (o instanceof Instance) return o.cls.decl.name + '@' + 'obj';
      if (o && typeof o.jtoString === 'function') return o.jtoString();
      if (o && o.name && o.jclass) return o.name;
      return String(o?.jclass ?? o);
    }
    default: return String(v.v);
  }
}
export function fmtDouble(d: number): string {
  if (Number.isNaN(d)) return 'NaN'; if (!Number.isFinite(d)) return d > 0 ? 'Infinity' : '-Infinity';
  if (Number.isInteger(d) && Math.abs(d) < 1e7) return d.toFixed(1);
  return String(d);
}

export class Interpreter {
  classes = new Map<string, UserClass>();
  natives = new Map<string, NativeClass>();
  steps = 0;
  budget = 20000; // statements per resume before a forced yield
  onBudget: (() => void) | null = null;
  constructor(program: Program) {
    const addAll = (list: ClassDecl[]) => { for (const c of list) { this.classes.set(c.name, new UserClass(c, this)); addAll(c.inner); } };
    addAll(program.classes);
  }

  registerNative(nc: NativeClass) { this.natives.set(nc.jclass, nc); }

  *initStatics(cls: UserClass): Generator<Yield, void, Value> {
    for (const f of cls.decl.fields) if (f.isStatic) cls.statics.set(f.name, f.init ? coerce(yield* this.eval(f.init, new Env(null), null, cls), { name: f.type.name, dims: f.type.dims + f.dims }, f.line) : defaultValue(f.type, f.dims));
    if (cls.decl.isEnum) cls.decl.enumConsts.forEach((n, i) => cls.statics.set(n, V.ref({ jclass: cls.decl.name, name: n, ordinal: i })));
  }

  // Create an instance, initialize fields, run the constructor.
  *construct(cls: UserClass, args: Value[], line: number, presetFields?: Map<string, Value>): Generator<Yield, Instance, Value> {
    const inst = new Instance(cls);
    const chain: UserClass[] = []; for (let c: UserClass | null = cls; c; c = c.parent()) chain.unshift(c);
    if (presetFields) for (const [k, v] of presetFields) inst.fields.set(k, v);
    for (const c of chain) {
      for (const f of c.decl.fields) if (!f.isStatic) {
        const env = new Env(null);
        inst.fields.set(f.name, f.init ? coerce(yield* this.eval(f.init, env, inst, c), { name: f.type.name, dims: f.type.dims + f.dims }, f.line) : defaultValue(f.type, f.dims));
      }
    }
    const ctor = cls.decl.ctors.find(c => c.params.length === args.length) ?? cls.decl.ctors[0];
    if (ctor) yield* this.invoke(ctor, cls, inst, args, line);
    else if (args.length) throw new JavaError(`${cls.decl.name} has no constructor taking ${args.length} arguments`, line);
    return inst;
  }

  *invoke(m: Method, cls: UserClass, self: Instance | null, args: Value[], line: number): Generator<Yield, Value, Value> {
    if (!m.body) throw new JavaError(`Method ${m.name} has no body`, line);
    if (m.params.length !== args.length) throw new JavaError(`${m.name} expects ${m.params.length} arguments, got ${args.length}`, line);
    const env = new Env(null);
    m.params.forEach((p, i) => env.vars.set(p.name, coerce(args[i], p.type, line)));
    try { yield* this.exec(m.body, env, self, cls); }
    catch (s) { if (s instanceof Signal && s.kind === 'return') return s.value ?? V.void(); throw s; }
    return V.void();
  }

  *callLambda(l: Lambda, args: Value[], line: number): Generator<Yield, Value, Value> {
    const env = new Env(l.env); l.params.forEach((p, i) => env.vars.set(p, args[i]));
    const cls = l.self?.cls ?? null;
    if ('k' in l.body && (l.body as Stmt).k === 'block') {
      try { yield* this.exec(l.body as Stmt, env, l.self, cls); } catch (s) { if (s instanceof Signal && s.kind === 'return') return s.value ?? V.void(); throw s; }
      return V.void();
    }
    return yield* this.eval(l.body as Expr, env, l.self, cls);
    void line;
  }

  private tick(line: number): Yield | null {
    if (++this.steps >= this.budget) { this.steps = 0; this.onBudget?.(); return new Yield('budget'); }
    void line; return null;
  }

  *exec(s: Stmt, env: Env, self: Instance | null, cls: UserClass | null): Generator<Yield, void, Value> {
    const y = this.tick(s.line); if (y) yield y;
    switch (s.k) {
      case 'block': { const inner = new Env(env); for (const st of s.body) yield* this.exec(st, inner, self, cls); return; }
      case 'empty': return;
      case 'vardecl':
        for (const d of s.decls) {
          const type = { name: s.type.name, dims: s.type.dims + d.dims };
          let v = d.init ? yield* this.evalInit(d.init, type, env, self, cls) : defaultValue(type);
          if (d.init) v = coerce(v, type, s.line);
          if (env.vars.has(d.name)) throw new JavaError(`Variable ${d.name} is already defined`, s.line);
          env.vars.set(d.name, v);
        }
        return;
      case 'expr': yield* this.eval(s.e, env, self, cls); return;
      case 'if': if (truthy(yield* this.eval(s.c, env, self, cls), s.line)) yield* this.exec(s.then, env, self, cls); else if (s.else) yield* this.exec(s.else, env, self, cls); return;
      case 'while':
        while (truthy(yield* this.eval(s.c, env, self, cls), s.line)) {
          try { yield* this.exec(s.body, env, self, cls); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (sig instanceof Signal && sig.kind === 'continue') continue; throw sig; }
        }
        return;
      case 'dowhile':
        do {
          try { yield* this.exec(s.body, env, self, cls); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (sig instanceof Signal && sig.kind === 'continue') continue; throw sig; }
        } while (truthy(yield* this.eval(s.c, env, self, cls), s.line));
        return;
      case 'for': {
        const inner = new Env(env);
        for (const st of s.init) yield* this.exec(st, inner, self, cls);
        while (!s.c || truthy(yield* this.eval(s.c, inner, self, cls), s.line)) {
          try { yield* this.exec(s.body, inner, self, cls); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (!(sig instanceof Signal && sig.kind === 'continue')) throw sig; }
          for (const u of s.update) yield* this.eval(u, inner, self, cls);
        }
        return;
      }
      case 'foreach': {
        const it = yield* this.eval(s.iter, env, self, cls);
        const items: Value[] = it.v instanceof JArray ? it.v.items : Array.isArray(it.v) ? it.v : null as any;
        if (!items) throw new JavaError('for-each needs an array', s.line);
        for (const item of items) {
          const inner = new Env(env); inner.vars.set(s.name, coerce(item, s.type, s.line));
          try { yield* this.exec(s.body, inner, self, cls); } catch (sig) { if (sig instanceof Signal && sig.kind === 'break') break; if (!(sig instanceof Signal && sig.kind === 'continue')) throw sig; }
        }
        return;
      }
      case 'return': throw new Signal('return', s.e ? yield* this.eval(s.e, env, self, cls) : undefined);
      case 'break': throw new Signal('break');
      case 'continue': throw new Signal('continue');
      case 'throw': { const v = yield* this.eval(s.e, env, self, cls); throw new JavaThrow(v, s.line); }
      case 'switch': {
        const v = yield* this.eval(s.e, env, self, cls);
        let matched = false;
        try {
          for (const c of s.cases) {
            if (!matched && c.values) { for (const ce of c.values) { const cv = yield* this.eval(ce, env, self, cls); if (this.equals(v, cv)) { matched = true; break; } } }
            else if (!matched && !c.values) matched = true;
            if (matched) { const inner = new Env(env); for (const st of c.body) yield* this.exec(st, inner, self, cls); }
          }
        } catch (sig) { if (!(sig instanceof Signal && sig.kind === 'break')) throw sig; }
        return;
      }
      case 'try': {
        try { yield* this.exec(s.body, env, self, cls); }
        catch (e) {
          if (e instanceof Signal) throw e;
          const c = s.catches[0];
          if (!c) throw e;
          const inner = new Env(env);
          const msg = e instanceof JavaThrow ? e.value : V.ref({ jclass: 'Exception', jcall: (n: string) => n === 'getMessage' ? V.str((e as Error).message) : V.void(), jtoString: () => (e as Error).message });
          inner.vars.set(c.name, msg);
          yield* this.exec(c.body, inner, self, cls);
        }
        finally { if (s.fin) yield* this.exec(s.fin, env, self, cls); }
        return;
      }
    }
  }

  private *evalInit(e: Expr, type: TypeRef, env: Env, self: Instance | null, cls: UserClass | null): Generator<Yield, Value, Value> {
    if (e.k === 'arrayinit') return yield* this.arrayInit(e, { name: type.name, dims: type.dims }, env, self, cls);
    return yield* this.eval(e, env, self, cls);
  }
  private *arrayInit(e: Expr & { k: 'arrayinit' }, type: TypeRef, env: Env, self: Instance | null, cls: UserClass | null): Generator<Yield, Value, Value> {
    const items: Value[] = [];
    const elemType = { name: type.name, dims: type.dims - 1 };
    for (const it of e.items) items.push(it.k === 'arrayinit' ? yield* this.arrayInit(it, elemType, env, self, cls) : coerce(yield* this.eval(it, env, self, cls), elemType, e.line));
    return V.ref(new JArray(type.name, items));
  }

  equals(a: Value, b: Value): boolean {
    if (a.t === 'ref' || b.t === 'ref' || a.t === 'null' || b.t === 'null') return a.v === b.v;
    if (a.t === 'String' || b.t === 'String') return a.v === b.v;
    return Number(a.v) === Number(b.v) || (a.t === 'boolean' && a.v === b.v);
  }

  *eval(e: Expr, env: Env, self: Instance | null, cls: UserClass | null): Generator<Yield, Value, Value> {
    switch (e.k) {
      case 'lit':
        if (e.t === 'char') return { t: 'char', v: (e.v as string).charCodeAt(0) };
        return { t: e.t, v: e.v } as Value;
      case 'this': if (!self) throw new JavaError("'this' used in a static context", e.line); return V.ref(self);
      case 'name': return this.lookupName(e.name, env, self, cls, e.line);
      case 'field': {
        // Static access like DcMotor.Direction.REVERSE or Math.PI resolves through natives first.
        const st = this.tryStatic(e, env, self, cls);
        if (st) return st;
        const obj = yield* this.eval(e.obj, env, self, cls);
        return this.getField(obj, e.name, e.line);
      }
      case 'index': {
        const arr = yield* this.eval(e.arr, env, self, cls); const idx = yield* this.eval(e.idx, env, self, cls);
        if (!(arr.v instanceof JArray)) throw new JavaError('Indexing something that is not an array', e.line, 'runtime');
        const i = idx.v | 0; if (i < 0 || i >= arr.v.items.length) throw new JavaError(`ArrayIndexOutOfBoundsException: index ${i}, length ${arr.v.items.length}`, e.line, 'runtime');
        return arr.v.items[i];
      }
      case 'call': return yield* this.call(e, env, self, cls);
      case 'new': {
        const args: Value[] = []; for (const a of e.args) args.push(yield* this.eval(a, env, self, cls));
        const uc = this.classes.get(e.type.name);
        if (uc) return V.ref(yield* this.construct(uc, args, e.line));
        const nc = this.natives.get(e.type.name);
        if (nc?.jnew) return V.ref(nc.jnew(args, e.line));
        throw new JavaError(`Unsupported SDK call: new ${e.type.name}(...)`, e.line, 'unsupported');
      }
      case 'newarray': {
        if (e.init) return yield* this.arrayInit(e.init as Expr & { k: 'arrayinit' }, e.type, env, self, cls);
        const sizes: number[] = []; for (const s of e.sizes) sizes.push((yield* this.eval(s, env, self, cls)).v | 0);
        const make = (d: number): Value => {
          if (d >= sizes.length) return V.null();
          const n = sizes[d]; if (n < 0) throw new JavaError('NegativeArraySizeException', e.line, 'runtime');
          const items: Value[] = []; for (let i = 0; i < n; i++) items.push(d + 1 < e.type.dims ? make(d + 1) : defaultValue({ name: e.type.name, dims: 0 }));
          return V.ref(new JArray(e.type.name, items));
        };
        return make(0);
      }
      case 'arrayinit': return yield* this.arrayInit(e, { name: 'Object', dims: 1 }, env, self, cls);
      case 'unary': {
        const v = yield* this.eval(e.e, env, self, cls);
        switch (e.op) {
          case '-': return INT_T.has(v.t) ? (v.t === 'long' ? V.long(-v.v) : V.int(-v.v)) : V.double(-v.v);
          case '+': return v;
          case '!': return V.bool(!truthy(v, e.line));
          case '~': return V.int(~v.v);
        }
        throw new JavaError('Bad unary op', e.line);
      }
      case 'incdec': {
        const old = yield* this.eval(e.target, env, self, cls);
        const nv: Value = old.t === 'double' || old.t === 'float' ? V.double(old.v + (e.op === '++' ? 1 : -1)) : old.t === 'long' ? V.long(old.v + (e.op === '++' ? 1 : -1)) : V.int(old.v + (e.op === '++' ? 1 : -1));
        yield* this.assignTo(e.target, nv, env, self, cls);
        return e.prefix ? nv : old;
      }
      case 'binary': {
        if (e.op === '&&') { const l = yield* this.eval(e.l, env, self, cls); if (!truthy(l, e.line)) return V.bool(false); return V.bool(truthy(yield* this.eval(e.r, env, self, cls), e.line)); }
        if (e.op === '||') { const l = yield* this.eval(e.l, env, self, cls); if (truthy(l, e.line)) return V.bool(true); return V.bool(truthy(yield* this.eval(e.r, env, self, cls), e.line)); }
        const l = yield* this.eval(e.l, env, self, cls); const r = yield* this.eval(e.r, env, self, cls);
        return this.binop(e.op, l, r, e.line);
      }
      case 'assign': {
        let v = yield* this.eval(e.value, env, self, cls);
        if (e.op !== '=') { const cur = yield* this.eval(e.target, env, self, cls); v = this.binop(e.op.slice(0, -1), cur, v, e.line); if (INT_T.has(cur.t) && (v.t === 'double')) v = cur.t === 'long' ? V.long(v.v) : V.int(v.v); }
        yield* this.assignTo(e.target, v, env, self, cls);
        return v;
      }
      case 'ternary': return truthy(yield* this.eval(e.c, env, self, cls), e.line) ? yield* this.eval(e.a, env, self, cls) : yield* this.eval(e.b, env, self, cls);
      case 'cast': {
        const v = yield* this.eval(e.e, env, self, cls);
        switch (e.type.name) {
          case 'int': case 'short': case 'byte': return V.int(Math.trunc(v.v));
          case 'long': return V.long(v.v);
          case 'double': case 'float': return V.double(Number(v.v));
          case 'char': return { t: 'char', v: v.v | 0 };
          default: return v;
        }
      }
      case 'classlit': return V.ref({ jclass: 'Class', name: e.type.name });
      case 'lambda': return V.ref(new Lambda(e.params, e.body, env, self));
    }
  }

  private lookupName(name: string, env: Env, self: Instance | null, cls: UserClass | null, line: number): Value {
    const scope = env.lookup(name); if (scope) return scope.vars.get(name)!;
    if (self?.fields.has(name)) return self.fields.get(name)!;
    for (let c: UserClass | null = cls; c; c = c.parent()) if (c.statics.has(name)) return c.statics.get(name)!;
    if (self?.cls) for (let c: UserClass | null = self.cls; c; c = c.parent()) { if (c.statics.has(name)) return c.statics.get(name)!; }
    if (self?.fields.has('$base') && name === 'time') return this.getField(self.fields.get('$base')!, name, line);
    if (this.classes.has(name)) return V.ref({ jclass: 'Class', name, userClass: this.classes.get(name) });
    if (this.natives.has(name)) return V.ref({ jclass: 'Class', name, nativeClass: this.natives.get(name) });
    throw new JavaError(`Cannot find symbol: ${name}`, line, 'compile');
  }

  // DcMotor.Direction.REVERSE, Math.PI, MyClass.CONST
  private tryStatic(e: Expr & { k: 'field' }, env: Env, self: Instance | null, cls: UserClass | null): Value | null {
    const path = this.dottedPath(e); if (!path) return null;
    if (env.lookup(path[0]) || self?.fields.has(path[0])) return null;
    const head = this.classes.get(path[0]);
    if (head && path.length === 2) { if (head.statics.has(path[1])) return head.statics.get(path[1])!; return null; }
    // Native: join progressively (DcMotor.Direction -> "DcMotor.Direction")
    for (let i = path.length - 1; i >= 1; i--) {
      const clsName = path.slice(0, i).join('.');
      const nc = this.natives.get(clsName) ?? this.natives.get(path[i - 1]);
      if (nc?.jstatic) {
        let v = nc.jstatic(path[i], e.line);
        for (let j = i + 1; j < path.length; j++) v = this.getField(v, path[j], e.line);
        return v;
      }
    }
    return null;
    void cls;
  }
  private dottedPath(e: Expr): string[] | null {
    if (e.k === 'name') return [e.name];
    if (e.k === 'field') { const p = this.dottedPath(e.obj); return p ? [...p, e.name] : null; }
    return null;
  }

  getField(obj: Value, name: string, line: number): Value {
    if (obj.t === 'null') throw new JavaError(`NullPointerException: reading '${name}' of null`, line, 'runtime');
    const o = obj.v;
    if (o instanceof Instance) { if (o.fields.has(name)) return o.fields.get(name)!; for (let c: UserClass | null = o.cls; c; c = c.parent()) if (c.statics.has(name)) return c.statics.get(name)!; throw new JavaError(`No field '${name}' on ${o.cls.decl.name}`, line, 'compile'); }
    if (o instanceof JArray) { if (name === 'length') return V.int(o.items.length); throw new JavaError(`Arrays have no field '${name}'`, line); }
    if (o && o.jclass === 'Class' && o.userClass) { const uc = o.userClass as UserClass; if (uc.statics.has(name)) return uc.statics.get(name)!; }
    if (o && o.jclass === 'Class' && o.nativeClass?.jstatic) return o.nativeClass.jstatic(name, line);
    if (o && typeof o.jget === 'function') return o.jget(name, line);
    throw new JavaError(`Unsupported SDK call: field '${name}' on ${describe(obj)}`, line, 'unsupported');
  }

  private *assignTo(target: Expr, v: Value, env: Env, self: Instance | null, cls: UserClass | null): Generator<Yield, void, Value> {
    if (target.k === 'name') {
      const scope = env.lookup(target.name);
      if (scope) { scope.vars.set(target.name, this.fit(scope.vars.get(target.name)!, v, target.line)); return; }
      if (self?.fields.has(target.name)) { self.fields.set(target.name, this.fit(self.fields.get(target.name)!, v, target.line)); return; }
      for (let c: UserClass | null = cls; c; c = c.parent()) if (c.statics.has(target.name)) { c.statics.set(target.name, this.fit(c.statics.get(target.name)!, v, target.line)); return; }
      throw new JavaError(`Cannot find symbol: ${target.name}`, target.line, 'compile');
    }
    if (target.k === 'field') {
      const obj = yield* this.eval(target.obj, env, self, cls);
      if (obj.v instanceof Instance) { obj.v.fields.set(target.name, this.fit(obj.v.fields.get(target.name) ?? v, v, target.line)); return; }
      if (obj.v && typeof obj.v.jset === 'function') { obj.v.jset(target.name, v, target.line); return; }
      if (obj.v?.jclass === 'Class' && obj.v.userClass) { (obj.v.userClass as UserClass).statics.set(target.name, v); return; }
      throw new JavaError(`Can't assign field '${target.name}' on ${describe(obj)}`, target.line);
    }
    if (target.k === 'index') {
      const arr = yield* this.eval(target.arr, env, self, cls); const idx = yield* this.eval(target.idx, env, self, cls);
      if (!(arr.v instanceof JArray)) throw new JavaError('Indexing something that is not an array', target.line, 'runtime');
      const i = idx.v | 0; if (i < 0 || i >= arr.v.items.length) throw new JavaError(`ArrayIndexOutOfBoundsException: index ${i}, length ${arr.v.items.length}`, target.line, 'runtime');
      arr.v.items[i] = this.fit(arr.v.items[i], v, target.line); return;
    }
    throw new JavaError('Bad assignment target', target.line);
  }
  // Keep the declared primitive kind of a variable when assigning (int stays int, double stays double).
  private fit(old: Value, v: Value, line: number): Value {
    if (old.t === 'int' || old.t === 'long') { if (v.t === 'double' || v.t === 'float') throw new JavaError(`Can't assign a double to an ${old.t} without a cast`, line, 'compile'); if (v.t === 'boolean' || v.t === 'String') bad(v, old.t, line); return old.t === 'int' ? V.int(v.v) : V.long(v.v); }
    if (old.t === 'double' || old.t === 'float') { if (v.t === 'boolean' || v.t === 'String' || v.t === 'ref') bad(v, 'double', line); return V.double(v.v); }
    if (old.t === 'boolean' && v.t !== 'boolean') bad(v, 'boolean', line);
    if (old.t === 'String' && v.t !== 'String' && v.t !== 'null') bad(v, 'String', line);
    return v;
  }

  binop(op: string, l: Value, r: Value, line: number): Value {
    if (op === '+' && (l.t === 'String' || r.t === 'String')) return V.str(toJavaString(l) + toJavaString(r));
    if (op === '==' || op === '!=') { const eq = this.equals(l, r); return V.bool(op === '==' ? eq : !eq); }
    if (l.t === 'boolean' || r.t === 'boolean') {
      if (l.t !== 'boolean' || r.t !== 'boolean') throw new JavaError(`Operator ${op} can't mix boolean and ${l.t === 'boolean' ? r.t : l.t}`, line, 'compile');
      switch (op) { case '&': return V.bool(l.v && r.v); case '|': return V.bool(l.v || r.v); case '^': return V.bool(l.v !== r.v); }
      throw new JavaError(`Operator ${op} on booleans`, line, 'compile');
    }
    if (l.t === 'ref' || r.t === 'ref' || l.t === 'null' || r.t === 'null' || l.t === 'String' || r.t === 'String') throw new JavaError(`Operator ${op} on ${describe(l)} and ${describe(r)}`, line, 'compile');
    const a = l.v as number, b = r.v as number;
    const isInt = INT_T.has(l.t) && INT_T.has(r.t);
    const long = l.t === 'long' || r.t === 'long';
    const mk = (x: number) => (isInt ? (long ? V.long(x) : V.int(x)) : V.double(x));
    switch (op) {
      case '+': return mk(a + b);
      case '-': return mk(a - b);
      case '*': return mk(a * b);
      case '/': if (isInt) { if (b === 0) throw new JavaError('ArithmeticException: / by zero', line, 'runtime'); return mk(Math.trunc(a / b)); } return V.double(a / b);
      case '%': if (isInt) { if (b === 0) throw new JavaError('ArithmeticException: / by zero', line, 'runtime'); return mk(a % b); } return V.double(a % b);
      case '<': return V.bool(a < b); case '>': return V.bool(a > b); case '<=': return V.bool(a <= b); case '>=': return V.bool(a >= b);
      case '&': return V.int(a & b); case '|': return V.int(a | b); case '^': return V.int(a ^ b);
      case '<<': return V.int(a << b); case '>>': return V.int(a >> b); case '>>>': return V.int(a >>> b);
    }
    throw new JavaError(`Unknown operator ${op}`, line);
  }

  private *call(e: Expr & { k: 'call' }, env: Env, self: Instance | null, cls: UserClass | null): Generator<Yield, Value, Value> {
    const args: Value[] = []; for (const a of e.args) args.push(yield* this.eval(a, env, self, cls));
    if (!e.obj) {
      // Method on this class (or parent), or a lambda variable, or an inherited native method (LinearOpMode's).
      const target = self?.cls ?? cls;
      const m = target?.find(e.name, args.length);
      if (m) return yield* this.invoke(m, target!, m.isStatic ? null : self, args, e.line);
      const scope = env.lookup(e.name); if (scope && scope.vars.get(e.name)!.v instanceof Lambda) return yield* this.callLambda(scope.vars.get(e.name)!.v, args, e.line);
      if (self?.fields.has('$base')) return yield* this.nativeCall(self.fields.get('$base')!, e.name, args, e.line);
      throw new JavaError(`Cannot find method ${e.name}(${args.length} args)`, e.line, 'compile');
    }
    // Static native call: Math.abs, String.format, Range.clip
    const path = this.dottedPath(e.obj);
    if (path && !env.lookup(path[0]) && !self?.fields.has(path[0])) {
      const uc = this.classes.get(path[0]);
      if (uc && path.length === 1) { const m = uc.find(e.name, args.length); if (m) return yield* this.invoke(m, uc, m.isStatic ? null : self, args, e.line); }
      const nc = this.natives.get(path.join('.')) ?? (path.length === 1 ? this.natives.get(path[0]) : undefined);
      if (nc?.jcallStatic && !uc) return nc.jcallStatic(e.name, args, e.line);
    }
    const obj = yield* this.eval(e.obj, env, self, cls);
    if (obj.t === 'null') throw new JavaError(`NullPointerException: calling ${e.name}() on null`, e.line, 'runtime');
    if (obj.v instanceof Instance) {
      const m = obj.v.cls.find(e.name, args.length);
      if (m) return yield* this.invoke(m, obj.v.cls, obj.v, args, e.line);
      if (obj.v.fields.has('$base')) return yield* this.nativeCall(obj.v.fields.get('$base')!, e.name, args, e.line);
      throw new JavaError(`No method ${e.name} on ${obj.v.cls.decl.name}`, e.line, 'compile');
    }
    if (obj.v instanceof Lambda) return yield* this.callLambda(obj.v, args, e.line);
    if (obj.t === 'String') return this.stringMethod(obj.v, e.name, args, e.line);
    if (obj.v instanceof JArray) { if (e.name === 'clone') return V.ref(new JArray(obj.v.elem, obj.v.items.slice())); throw new JavaError(`Arrays have no method ${e.name}`, e.line); }
    if (INT_T.has(obj.t) || obj.t === 'double' || obj.t === 'boolean') throw new JavaError(`Can't call ${e.name}() on a ${obj.t}`, e.line, 'compile');
    return yield* this.nativeCall(obj, e.name, args, e.line);
  }

  *nativeCall(obj: Value, name: string, args: Value[], line: number): Generator<Yield, Value, Value> {
    const o = obj.v;
    if (o?.jclass === 'Class' && o.nativeClass?.jcallStatic) return o.nativeClass.jcallStatic(name, args, line);
    if (!o || typeof o.jcall !== 'function') {
      if (name === 'toString') return V.str(toJavaString(obj));
      if (name === 'equals' && args.length === 1) return V.bool(this.equals(obj, args[0]));
      if (name === 'ordinal' && o && typeof o.ordinal === 'number') return V.int(o.ordinal);
      if (name === 'name' && o && typeof o.name === 'string') return V.str(o.name);
      throw new JavaError(`Unsupported SDK call: ${describe(obj)}.${name}()`, line, 'unsupported');
    }
    const r = o.jcall(name, args, line);
    if (r instanceof Yield) { const back = yield r; return back ?? V.void(); }
    if (r && typeof (r as any).next === 'function') return yield* (r as Generator<Yield, Value, Value>);
    return r as Value;
  }

  private stringMethod(s: string, name: string, args: Value[], line: number): Value {
    switch (name) {
      case 'length': return V.int(s.length);
      case 'equals': return V.bool(args[0]?.t === 'String' && args[0].v === s);
      case 'equalsIgnoreCase': return V.bool(args[0]?.t === 'String' && args[0].v.toLowerCase() === s.toLowerCase());
      case 'toUpperCase': return V.str(s.toUpperCase());
      case 'toLowerCase': return V.str(s.toLowerCase());
      case 'trim': return V.str(s.trim());
      case 'charAt': return { t: 'char', v: s.charCodeAt(args[0].v) };
      case 'contains': return V.bool(s.includes(toJavaString(args[0])));
      case 'startsWith': return V.bool(s.startsWith(toJavaString(args[0])));
      case 'endsWith': return V.bool(s.endsWith(toJavaString(args[0])));
      case 'indexOf': return V.int(s.indexOf(toJavaString(args[0])));
      case 'substring': return V.str(args.length === 2 ? s.substring(args[0].v, args[1].v) : s.substring(args[0].v));
      case 'isEmpty': return V.bool(s.length === 0);
      case 'toString': return V.str(s);
      case 'concat': return V.str(s + toJavaString(args[0]));
      case 'replace': return V.str(s.split(toJavaString(args[0])).join(toJavaString(args[1])));
      case 'hashCode': { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return V.int(h); }
    }
    throw new JavaError(`String.${name}() is not supported`, line, 'unsupported');
  }
}

// Java-style String.format for the common cases: %d %s %f %.2f %4.2f %x %b %%
export function javaFormat(fmt: string, args: Value[], line: number): string {
  let i = 0;
  return fmt.replace(/%(-)?(\d+)?(?:\.(\d+))?([dsfxXbcen%])/g, (_m, minus, width, prec, conv) => {
    if (conv === '%') return '%';
    if (conv === 'n') return '\n';
    const a = args[i++]; if (!a) throw new JavaError('MissingFormatArgumentException: not enough arguments for format', line, 'runtime');
    let s: string;
    switch (conv) {
      case 'd': if (a.t === 'double' || a.t === 'float') throw new JavaError('IllegalFormatConversionException: %d given a double', line, 'runtime'); s = String(Math.trunc(a.v)); break;
      case 'f': case 'e': s = Number(a.v).toFixed(prec ? parseInt(prec) : 6); break;
      case 'x': s = (a.v >>> 0).toString(16); break;
      case 'X': s = (a.v >>> 0).toString(16).toUpperCase(); break;
      case 'b': s = String(!!a.v); break;
      case 'c': s = String.fromCharCode(a.v); break;
      default: s = toJavaString(a); if (prec) s = s.slice(0, parseInt(prec));
    }
    if (width) { const w = parseInt(width); s = minus ? s.padEnd(w) : s.padStart(w); }
    return s;
  });
}
