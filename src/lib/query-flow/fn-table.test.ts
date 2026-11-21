import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDeclaration } from './expression.ts';
import { declarationLines } from './compile.ts';

const fn = (name: string, args: string[], body: string) => ({ id: name, name, args, body, description: '' });

test('a table function (a query body) is accepted and ends with ;', () => {
  assert.equal(checkDeclaration({ fn: fn('limpiar', ['t', 'minimo'], 'from t where Monto >= minimo select *') }), null);
  const lines = declarationLines({ nodes: [], edges: [], functions: [fn('limpiar', ['t', 'minimo'], 'from t where Monto >= minimo select *'), fn('doble', ['x'], 'x * 2')] });
  assert.equal(lines[0], 'fn limpiar(t, minimo) = from t where Monto >= minimo select *;');
  assert.equal(lines[1], 'fn doble(x) = x * 2'); // scalar functions are written as before
});

test('the cross-two-tables example is valid, a recursive one is not', () => {
  assert.equal(checkDeclaration({ fn: fn('cruzar', ['a', 'b'], 'from a join b as b on Cliente = b.Nombre select *') }), null);
  assert.match(String(checkDeclaration({ fn: fn('loop', ['t'], 'from loop(t) select *') })), /itself|recurs/i);
});
