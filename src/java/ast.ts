// AST for the Java subset. Every node carries the source line.
export interface TypeRef { name: string; dims: number }

export type Expr =
  | { k: 'lit'; line: number; t: 'int' | 'long' | 'double' | 'float' | 'boolean' | 'String' | 'char' | 'null'; v: number | string | boolean | null }
  | { k: 'name'; line: number; name: string }
  | { k: 'field'; line: number; obj: Expr; name: string }
  | { k: 'index'; line: number; arr: Expr; idx: Expr }
  | { k: 'call'; line: number; obj: Expr | null; name: string; args: Expr[] }
  | { k: 'new'; line: number; type: TypeRef; args: Expr[] }
  | { k: 'newarray'; line: number; type: TypeRef; sizes: Expr[]; init: Expr | null }
  | { k: 'arrayinit'; line: number; items: Expr[] }
  | { k: 'unary'; line: number; op: string; e: Expr }
  | { k: 'incdec'; line: number; op: '++' | '--'; prefix: boolean; target: Expr }
  | { k: 'binary'; line: number; op: string; l: Expr; r: Expr }
  | { k: 'assign'; line: number; op: string; target: Expr; value: Expr }
  | { k: 'ternary'; line: number; c: Expr; a: Expr; b: Expr }
  | { k: 'cast'; line: number; type: TypeRef; e: Expr }
  | { k: 'classlit'; line: number; type: TypeRef }
  | { k: 'this'; line: number }
  | { k: 'lambda'; line: number; params: string[]; body: Expr | Stmt };

export type Stmt =
  | { k: 'vardecl'; line: number; type: TypeRef; decls: { name: string; dims: number; init: Expr | null }[] }
  | { k: 'expr'; line: number; e: Expr }
  | { k: 'if'; line: number; c: Expr; then: Stmt; else: Stmt | null }
  | { k: 'while'; line: number; c: Expr; body: Stmt }
  | { k: 'dowhile'; line: number; c: Expr; body: Stmt }
  | { k: 'for'; line: number; init: Stmt[]; c: Expr | null; update: Expr[]; body: Stmt }
  | { k: 'foreach'; line: number; type: TypeRef; name: string; iter: Expr; body: Stmt }
  | { k: 'block'; line: number; body: Stmt[] }
  | { k: 'return'; line: number; e: Expr | null }
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number }
  | { k: 'switch'; line: number; e: Expr; cases: { values: Expr[] | null; body: Stmt[] }[] }
  | { k: 'throw'; line: number; e: Expr }
  | { k: 'try'; line: number; body: Stmt; catches: { type: TypeRef; name: string; body: Stmt }[]; fin: Stmt | null }
  | { k: 'empty'; line: number };

export interface Param { type: TypeRef; name: string }
export interface Method { name: string; line: number; isStatic: boolean; ret: TypeRef; params: Param[]; body: Stmt | null }
export interface Field { name: string; line: number; isStatic: boolean; type: TypeRef; dims: number; init: Expr | null }
export interface Annotation { name: string; args: Record<string, Expr> }
export interface ClassDecl {
  name: string; line: number; ext: string | null; impls: string[]; annotations: Annotation[];
  fields: Field[]; methods: Method[]; ctors: Method[]; inner: ClassDecl[]; isEnum: boolean; enumConsts: string[];
}
export interface Program { classes: ClassDecl[] }
