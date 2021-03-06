import rules from './rules';

export default [
  ['GET', '/list', [], rules.list],
  ['GET', '/delete/:id', [], rules.deleteRule],
  ['GET', '/edit/:id', [], rules.editRule],
  ['POST', '/upsert', [], rules.upsert],
  ['GET', '/new', [], rules.editRule]
];
