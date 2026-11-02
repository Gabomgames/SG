import {parse} from 'acorn';

// Resolve direct calls against lexical bindings, including destructuring from
// await import(). Property calls, strings and comments are not identifiers.
export function unboundLibraryCalls(source, watched) {
  const ast = parse(source, {ecmaVersion:'latest', sourceType:'module', locations:true});
  const calls = [], names = new Set(watched);
  const scope = (parent, kind) => ({parent, kind, bindings:new Set()});
  function bind(pattern, target) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') target.bindings.add(pattern.name);
    else if (pattern.type === 'RestElement') bind(pattern.argument, target);
    else if (pattern.type === 'AssignmentPattern') bind(pattern.left, target);
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(p => bind(p,target));
    else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(p => bind(p.type === 'RestElement' ? p.argument : p.value,target));
  }
  function visit(node, current) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') bind(node.id,current);
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
      current = scope(current,'function');
      bind(node.id,current);
      node.params.forEach(p => bind(p,current));
    } else if (/^(BlockStatement|CatchClause|ForStatement|ForInStatement|ForOfStatement|SwitchStatement|ClassExpression|ClassDeclaration)$/.test(node.type)) {
      current = scope(current,'block');
      if (node.type === 'CatchClause') bind(node.param,current);
      if (node.type.startsWith('Class')) bind(node.id,current);
    }
    if (node.type === 'ImportDeclaration') node.specifiers.forEach(s => bind(s.local,current));
    if (node.type === 'VariableDeclaration') {
      let target = current;
      if (node.kind === 'var') while (target.parent && target.kind !== 'function') target = target.parent;
      node.declarations.forEach(d => bind(d.id,target));
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && names.has(node.callee.name)) calls.push({name:node.callee.name,line:node.loc.start.line,scope:current});
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => visit(child,current));
      else if (value && typeof value === 'object') visit(value,current);
    }
  }
  visit(ast,scope(null,'module'));
  return calls.filter(call => {
    for (let s = call.scope; s; s = s.parent) if (s.bindings.has(call.name)) return false;
    return true;
  }).map(({name,line}) => ({name,line}));
}
