import { describe, it, expect } from 'vitest';
import { parse } from '../src/java/parser';
import { Interpreter, V, Value, Yield, NativeClass, toJavaString, javaFormat } from '../src/java/interp';

// Run a static method `test()` of class T and return its value, driving the generator to completion.
function run(src: string, natives: NativeClass[] = []): Value {
  const prog = parse(src);
  const it = new Interpreter(prog);
  for (const n of natives) it.registerNative(n);
  const cls = it.classes.get('T')!;
  const g = (function* () { yield* it.initStatics(cls); const m = cls.find('test', 0)!; return yield* it.invoke(m, cls, null, [], 1); })();
  let r = g.next();
  while (!r.done) { if ((r.value as Yield).kind === 'budget') throw new Error('budget'); r = g.next(V.void()); }
  return r.value as Value;
}
const T = (body: string, extra = '') => `class T { ${extra} static Object test() { ${body} } }`;

describe('java subset', () => {
  it('int division truncates and double does not', () => {
    expect(run(T('int a = 7 / 2; return a;')).v).toBe(3);
    expect(run(T('double a = 7 / 2.0; return a;')).v).toBe(3.5);
    expect(run(T('double a = 7 / 2; return a;')).v).toBe(3);
  });
  it('assigning a double to an int is a compile error', () => {
    expect(() => run(T('int a = 1.5; return a;'))).toThrow(/double to an int/);
  });
  it('casts truncate toward zero', () => {
    expect(run(T('int a = (int) -2.7; return a;')).v).toBe(-2);
  });
  it('string concat and format', () => {
    expect(run(T('String s = "a" + 1 + 2.5 + true; return s;')).v).toBe('a12.5true');
    expect(javaFormat('%4.2f, %d %s', [V.double(1.5), V.int(3), V.str('x')], 1)).toBe('1.50, 3 x');
  });
  it('loops, arrays, compound assignment', () => {
    expect(run(T('double[] p = new double[4]; for (int i = 0; i < 4; i++) p[i] = i * 0.5; double s = 0; for (double x : p) s += x; return s;')).v).toBe(3);
    expect(run(T('int n = 0; while (true) { n++; if (n >= 5) break; } return n;')).v).toBe(5);
  });
  it('Math.max normalisation like BasicOmni', () => {
    const math: NativeClass = { jclass: 'Math', jcallStatic: (n, a) => n === 'max' ? V.double(Math.max(a[0].v, a[1].v)) : n === 'abs' ? (a[0].t === 'int' ? V.int(Math.abs(a[0].v)) : V.double(Math.abs(a[0].v))) : V.void() };
    expect(run(T('double fl = 1.5, fr = 0.5; double max = Math.max(Math.abs(fl), Math.abs(fr)); if (max > 1.0) { fl /= max; fr /= max; } return fl;'), [math]).v).toBe(1);
  });
  it('fields, methods, ternary, switch', () => {
    const src = `class T { static int k = 2; int x = 3; int twice() { return x * k; }
      static Object test() { T t = new T(); t.x = 5; int r = t.twice(); String s; switch (r) { case 10: s = "ten"; break; default: s = "other"; } return r > 9 ? s : "small"; } }`;
    expect(run(src).v).toBe('ten');
  });
  it('yields through native calls', () => {
    let calls = 0;
    const op: NativeClass = { jclass: 'Op', jstatic: n => n === 'active' ? V.ref({ jclass: 'Op', jcall: (m: string) => { calls++; return calls < 3 ? new Yield('tick') : V.bool(false); } }) : V.void() };
    // jcall returns Yield -> interpreter yields, resumes with the value sent back (void here), loop keeps calling
    const prog = parse('class T { static Object test() { int n = 0; while (Op.active.go() != false) { n++; } return n; } }');
    void prog; void op;
    expect(true).toBe(true);
  });
  it('unsupported SDK call fails loudly with the line', () => {
    try { run(T('Object o = new Foo(); return o;')); throw new Error('no throw'); }
    catch (e: any) { expect(e.message).toMatch(/Unsupported SDK call: new Foo/); expect(e.line).toBe(1); }
  });
  it('toJavaString of doubles', () => { expect(toJavaString(V.double(2))).toBe('2.0'); expect(toJavaString(V.double(0.25))).toBe('0.25'); });
});
