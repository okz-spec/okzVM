export type ASTNode =
  | ProgramNode
  | BlockNode
  | StatementNode
  | ExpressionNode;

export type ProgramNode = {
  type: 'program';
  body: StatementNode[];
};

export type BlockNode = {
  type: 'block';
  statements: StatementNode[];
};

export type StatementNode =
  | ExpressionStatementNode
  | FunctionDeclNode
  | VariableDeclNode
  | IfNode
  | WhileNode
  | ForNode
  | ForInNode
  | RepeatNode
  | ReturnNode
  | BreakNode
  | ContinueNode
  | ClassDeclNode
  | ImportNode
  | AssignNode
  | BlockNode;

export type ExpressionStatementNode = {
  type: 'expression_statement';
  expression: ExpressionNode;
};

export type FunctionDeclNode = {
  type: 'function_decl';
  name: string | null;
  params: string[];
  body: BlockNode;
};

export type VariableDeclNode = {
  type: 'variable_decl';
  names: string[];
  initializer: ExpressionNode | null;
  isLocal: boolean;
};

export type AssignNode = {
  type: 'assign';
  targets: AssignTarget[];
  value: ExpressionNode;
};

export type AssignTarget =
  | { type: 'name'; name: string }
  | { type: 'index'; object: ExpressionNode; index: ExpressionNode }
  | { type: 'field'; object: ExpressionNode; field: string };

export type IfNode = {
  type: 'if';
  condition: ExpressionNode;
  thenBranch: BlockNode;
  elseIfBranches: Array<{ condition: ExpressionNode; block: BlockNode }>;
  elseBranch: BlockNode | null;
};

export type WhileNode = {
  type: 'while';
  condition: ExpressionNode;
  body: BlockNode;
};

export type ForNode = {
  type: 'for';
  variable: string;
  start: ExpressionNode;
  end: ExpressionNode;
  step: ExpressionNode | null;
  body: BlockNode;
};

export type ForInNode = {
  type: 'for_in';
  variables: string[];
  iterator: ExpressionNode;
  body: BlockNode;
};

export type RepeatNode = {
  type: 'repeat';
  body: BlockNode;
  condition: ExpressionNode;
};

export type ReturnNode = {
  type: 'return';
  values: ExpressionNode[];
};

export type BreakNode = {
  type: 'break';
};

export type ContinueNode = {
  type: 'continue';
};

export type ClassDeclNode = {
  type: 'class_decl';
  name: string;
  methods: FunctionDeclNode[];
};

export type ImportNode = {
  type: 'import';
  module: string;
};

export type ExpressionNode =
  | LiteralNode
  | VariableNode
  | BinaryNode
  | UnaryNode
  | CallNode
  | IndexNode
  | FieldNode
  | TableNode
  | ArrayNode
  | FunctionExprNode
  | MethodCallNode;

export type LiteralNode = {
  type: 'literal';
  value: number | string | boolean | null;
};

export type VariableNode = {
  type: 'variable';
  name: string;
};

export type BinaryNode = {
  type: 'binary';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
};

export type UnaryNode = {
  type: 'unary';
  operator: string;
  operand: ExpressionNode;
};

export type CallNode = {
  type: 'call';
  callee: ExpressionNode;
  args: ExpressionNode[];
};

export type MethodCallNode = {
  type: 'method_call';
  object: ExpressionNode;
  method: string;
  args: ExpressionNode[];
};

export type IndexNode = {
  type: 'index';
  object: ExpressionNode;
  index: ExpressionNode;
};

export type FieldNode = {
  type: 'field';
  object: ExpressionNode;
  field: string;
};

export type TableNode = {
  type: 'table';
  fields: Array<{ key: ExpressionNode; value: ExpressionNode }>;
};

export type ArrayNode = {
  type: 'array';
  elements: ExpressionNode[];
};

export type FunctionExprNode = {
  type: 'function_expr';
  params: string[];
  body: BlockNode;
};

export function astToString(node: ASTNode, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  switch (node.type) {
    case 'program':
      return node.body.map(s => astToString(s, indent)).join('\n');
    case 'block':
      return node.statements.map(s => astToString(s, indent)).join('\n');
    case 'expression_statement':
      return `${pad}${astToString(node.expression, indent)}`;
    case 'function_decl':
      return `${pad}function ${node.name || '(anon)'}(${node.params.join(',')})...end`;
    case 'variable_decl':
      const varName = node.names.length > 0 ? node.names.join(', ') : '?';
      return `${pad}${node.isLocal ? 'local ' : ''}${varName} = ${node.initializer ? astToString(node.initializer, indent) : 'nil'}`;
    case 'if':
      return `${pad}if ${astToString(node.condition)} then...end`;
    case 'while':
      return `${pad}while ${astToString(node.condition)} do...end`;
    case 'for':
      return `${pad}for ${node.variable} in ${astToString(node.start)}..${astToString(node.end)} do...end`;
    case 'return':
      return `${pad}return ${node.values.map(v => astToString(v, indent)).join(', ')}`;
    case 'break':
      return `${pad}break`;
    case 'continue':
      return `${pad}continue`;
    case 'import':
      return `${pad}import ${node.module}`;
    case 'literal':
      return `${node.value === null ? 'nil' : String(node.value)}`;
    case 'variable':
      return node.name;
    case 'binary':
      return `(${astToString(node.left)} ${node.operator} ${astToString(node.right)})`;
    case 'unary':
      return `(${node.operator}${astToString(node.operand)})`;
    case 'call':
      return `${astToString(node.callee)}(${node.args.map(a => astToString(a)).join(',')})`;
    case 'assign':
      return `${node.targets.map(t => t.type === 'name' ? t.name : '[...]').join(',')} = ${astToString(node.value)}`;
    default:
      return `${pad}${node.type}`;
  }
}