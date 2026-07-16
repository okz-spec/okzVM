import { Token, TokenType } from '../types';
import * as AST from '../ast/ASTNode';

export class Parser {
  private tokens: Token[] = [];
  private current: number = 0;
  private errors: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): AST.ProgramNode {
    this.current = 0;
    this.errors = [];
    const statements = this.parseStatementsUntil(TokenType.EOF);
    return { type: 'program', body: statements };
  }

  public getErrors(): string[] {
    return this.errors;
  }

  private parseStatementsUntil(...endTypes: TokenType[]): AST.StatementNode[] {
    const statements: AST.StatementNode[] = [];

    while (!this.isAtEnd() && !this.checkAny(endTypes)) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
      this.skipNewlines();
    }

    return statements;
  }

  private parseStatement(): AST.StatementNode | null {
    this.skipNewlines();

    if (this.check(TokenType.FUNCTION)) return this.parseFunctionDecl();
    if (this.check(TokenType.LOCAL)) return this.parseVariableDecl();
    if (this.check(TokenType.IF)) return this.parseIf();
    if (this.check(TokenType.WHILE)) return this.parseWhile();
    if (this.check(TokenType.FOR)) return this.parseFor();
    if (this.check(TokenType.REPEAT)) return this.parseRepeat();
    if (this.check(TokenType.RETURN)) return this.parseReturn();
    if (this.check(TokenType.BREAK)) return this.parseBreak();
    if (this.check(TokenType.CONTINUE)) return this.parseContinue();
    if (this.check(TokenType.IMPORT)) return this.parseImport();
    if (this.check(TokenType.CLASS)) return this.parseClass();

    return this.parseExpressionOrAssign();
  }

  private parseFunctionDecl(): AST.FunctionDeclNode {
    this.consume(TokenType.FUNCTION, "Expected 'function'");
    const name = this.check(TokenType.IDENTIFIER) ? this.advance().lexeme : null;

    this.consume(TokenType.LPAREN, "Expected '(' after function name");
    const params = this.parseParamList();
    this.consume(TokenType.RPAREN, "Expected ')' after parameters");
    this.skipNewlines();

    const body = this.parseBlock();
    this.consume(TokenType.END, "Expected 'end' after function body");

    return { type: 'function_decl', name, params, body };
  }

  private parseVariableDecl(): AST.VariableDeclNode {
    this.consume(TokenType.LOCAL, "Expected 'local'");

    if (this.check(TokenType.FUNCTION)) {
      this.advance();
      const name = this.consume(TokenType.IDENTIFIER, "Expected function name").lexeme;
      this.skipNewlines();
      this.consume(TokenType.LPAREN, "Expected '('");
      const params = this.parseParamList();
      this.consume(TokenType.RPAREN, "Expected ')'");
      this.skipNewlines();
      const body = this.parseBlock();
      this.consume(TokenType.END, "Expected 'end' after function body");
      const funcExpr: AST.FunctionExprNode = { type: 'function_expr', params: params || [], body };
      return { type: 'variable_decl', names: [name], initializer: funcExpr, isLocal: true };
    }

    const names: string[] = [];
    names.push(this.consume(TokenType.IDENTIFIER, "Expected variable name").lexeme);
    while (this.check(TokenType.COMMA)) {
      this.advance();
      if (this.check(TokenType.IDENTIFIER)) {
        names.push(this.advance().lexeme);
      } else {
        break;
      }
    }

    let initializer: AST.ExpressionNode | null = null;
    if (this.check(TokenType.ASSIGN)) {
      this.advance();
      initializer = this.parseExpression();
    }

    this.skipNewlines();
    return { type: 'variable_decl', names, initializer, isLocal: true };
  }

  private parseIf(): AST.IfNode {
    this.consume(TokenType.IF, "Expected 'if'");
    const condition = this.parseExpression();
    this.skipNewlines();
    this.consume(TokenType.THEN, "Expected 'then'");
    this.skipNewlines();

    const thenBranch = this.parseBlock();
    this.skipNewlines();

    const elseIfBranches: Array<{ condition: AST.ExpressionNode; block: AST.BlockNode }> = [];
    while (this.check(TokenType.ELSEIF)) {
      this.advance();
      const cond = this.parseExpression();
      this.skipNewlines();
      this.consume(TokenType.THEN, "Expected 'then' after elseif");
      this.skipNewlines();
      const block = this.parseBlock();
      this.skipNewlines();
      elseIfBranches.push({ condition: cond, block });
    }

    let elseBranch: AST.BlockNode | null = null;
    if (this.check(TokenType.ELSE)) {
      this.advance();
      this.skipNewlines();
      elseBranch = this.parseBlock();
      this.skipNewlines();
    }

    this.consume(TokenType.END, "Expected 'end' after if");

    return { type: 'if', condition, thenBranch, elseIfBranches, elseBranch };
  }

  private parseWhile(): AST.WhileNode {
    this.consume(TokenType.WHILE, "Expected 'while'");
    const condition = this.parseExpression();
    this.skipNewlines();
    this.consume(TokenType.DO, "Expected 'do'");
    this.skipNewlines();
    const body = this.parseBlock();
    this.consume(TokenType.END, "Expected 'end' after while");
    return { type: 'while', condition, body };
  }

  private parseFor(): AST.StatementNode {
    this.consume(TokenType.FOR, "Expected 'for'");
    const firstId = this.consume(TokenType.IDENTIFIER, "Expected variable name").lexeme;

    // Generic for: for k[, v] in iterator(table) do ... end
    let secondId: string | null = null;
    if (this.check(TokenType.COMMA)) {
      this.advance();
      secondId = this.check(TokenType.IDENTIFIER) ? this.advance().lexeme : null;
    }

    if (this.check(TokenType.IN)) {
      this.advance();
      const expr = this.parseExpression();
      this.skipNewlines();
      this.consume(TokenType.DO, "Expected 'do'");
      this.skipNewlines();
      const body = this.parseBlock();
      this.consume(TokenType.END, "Expected 'end' after for");

      const keysVar = '_ks';
      const iVar = '_i';
      const keyExpr: AST.ExpressionNode = { type: 'index', object: { type: 'variable', name: keysVar }, index: { type: 'variable', name: iVar } };
      const lenExpr: AST.ExpressionNode = { type: 'unary', operator: '#', operand: { type: 'variable', name: keysVar } };
      const iPlus1: AST.ExpressionNode = { type: 'binary', operator: '+', left: { type: 'variable', name: iVar }, right: { type: 'literal', value: 1 } };
      const cond: AST.ExpressionNode = { type: 'binary', operator: '<=', left: { type: 'variable', name: iVar }, right: lenExpr };
      const bodyStmts: AST.StatementNode[] = [];
      bodyStmts.push({ type: 'assign', targets: [{ type: 'name', name: firstId }], value: keyExpr });
      if (secondId) {
        bodyStmts.push({ type: 'assign', targets: [{ type: 'name', name: secondId }], value: {
          type: 'index', object: expr, index: { type: 'variable', name: firstId }
        }});
      }
      bodyStmts.push({ type: 'assign', targets: [{ type: 'name', name: iVar }], value: iPlus1 });
      bodyStmts.push(...body.statements);

      return {
        type: 'block', statements: [
          { type: 'variable_decl', names: [keysVar], initializer: {
            type: 'call', callee: { type: 'field', object: { type: 'variable', name: 'table' }, field: 'keys' }, args: [expr]
          }, isLocal: true },
          { type: 'variable_decl', names: [iVar], initializer: { type: 'literal', value: 1 }, isLocal: true },
          { type: 'while', condition: cond, body: { type: 'block', statements: bodyStmts } },
        ]
      };
    }

    this.consume(TokenType.ASSIGN, "Expected '=' after variable");
    const start = this.parseExpression();
    this.consume(TokenType.COMMA, "Expected ',' after start");
    const end = this.parseExpression();

    let step: AST.ExpressionNode | null = null;
    if (this.check(TokenType.COMMA)) {
      this.advance();
      step = this.parseExpression();
    }

    this.skipNewlines();
    this.consume(TokenType.DO, "Expected 'do'");
    this.skipNewlines();
    const body = this.parseBlock();
    this.consume(TokenType.END, "Expected 'end' after for");
    return { type: 'for', variable: firstId, start, end, step, body };
  }

  private parseRepeat(): AST.RepeatNode {
    this.consume(TokenType.REPEAT, "Expected 'repeat'");
    this.skipNewlines();
    const body = this.parseBlock();
    this.skipNewlines();
    this.consume(TokenType.UNTIL, "Expected 'until'");
    const condition = this.parseExpression();
    return { type: 'repeat', body, condition };
  }

  private parseReturn(): AST.ReturnNode {
    this.consume(TokenType.RETURN, "Expected 'return'");
    let value: AST.ExpressionNode | null = null;
    if (!this.check(TokenType.END) && !this.checkNewline() && !this.check(TokenType.EOF)) {
      value = this.parseExpression();
      if (this.check(TokenType.COMMA)) {
        const values: AST.ExpressionNode[] = [value];
        while (this.check(TokenType.COMMA)) {
          this.advance();
          values.push(this.parseExpression());
        }
        value = { type: 'array', elements: values };
      }
    }
    return { type: 'return', value };
  }

  private parseBreak(): AST.BreakNode {
    this.advance();
    return { type: 'break' };
  }

  private parseContinue(): AST.ContinueNode {
    this.advance();
    return { type: 'continue' };
  }

  private parseImport(): AST.ImportNode {
    this.consume(TokenType.IMPORT, "Expected 'import'");
    const module = this.consume(TokenType.IDENTIFIER, "Expected module name").lexeme;
    while (this.check(TokenType.DOT)) {
      // import module.submodule
      // We'll just concatenate for now
    }
    return { type: 'import', module };
  }

  private parseClass(): AST.ClassDeclNode {
    this.consume(TokenType.CLASS, "Expected 'class'");
    const name = this.consume(TokenType.IDENTIFIER, "Expected class name").lexeme;
    this.consume(TokenType.NEWLINE, "Expected newline after class name");
    this.skipNewlines();

    const methods: AST.FunctionDeclNode[] = [];
    while (!this.check(TokenType.END) && !this.isAtEnd()) {
      if (this.check(TokenType.FUNCTION)) {
        const fnDecl = this.parseFunctionDecl();
        // Allow named methods
        methods.push(fnDecl);
      } else if (this.check(TokenType.IDENTIFIER)) {
        const methodName = this.advance().lexeme;
        this.consume(TokenType.LPAREN, "Expected '('");
        const params = this.parseParamList();
        this.consume(TokenType.RPAREN, "Expected ')'");
        this.skipNewlines();
        const body = this.parseBlock();
        this.consume(TokenType.END, "Expected 'end'");
        methods.push({
          type: 'function_decl',
          name: methodName,
          params,
          body,
        });
      }
      this.skipNewlines();
    }
    this.consume(TokenType.END, "Expected 'end' after class");
    return { type: 'class_decl', name, methods };
  }

  private compoundOpMap: Record<string, string> = {
    [TokenType.PLUS_EQUAL]: '+',
    [TokenType.MINUS_EQUAL]: '-',
    [TokenType.STAR_EQUAL]: '*',
    [TokenType.SLASH_EQUAL]: '/',
    [TokenType.PERCENT_EQUAL]: '%',
  };

  private parseExpressionOrAssign(): AST.StatementNode | null {
    this.skipNewlines();
    const expr = this.parseExpression();
    if (!expr) return null;

    if (this.check(TokenType.ASSIGN)) {
      return this.parseAssignment(expr);
    }

    const compoundToken = this.checkAny(Object.keys(this.compoundOpMap));
    if (compoundToken) {
      return this.parseCompoundAssign(expr);
    }

    return { type: 'expression_statement', expression: expr };
  }

  private parseAssignment(expr: AST.ExpressionNode): AST.AssignNode {
    const targets: AST.AssignTarget[] = [];
    this.collectAssignTargets(expr, targets);
    this.consume(TokenType.ASSIGN, "Expected '='");
    const value = this.parseExpression();
    return { type: 'assign', targets, value };
  }

  private parseCompoundAssign(expr: AST.ExpressionNode): AST.AssignNode {
    const token = this.advance();
    const op = this.compoundOpMap[token.type];
    const rhs = this.parseExpression();

    const lhs = this.cloneExpr(expr);
    const value: AST.ExpressionNode = { type: 'binary', operator: op, left: lhs, right: rhs };

    const targets: AST.AssignTarget[] = [];
    this.collectAssignTargets(expr, targets);
    return { type: 'assign', targets, value };
  }

  private cloneExpr(expr: AST.ExpressionNode): AST.ExpressionNode {
    if (expr.type === 'variable') return { type: 'variable', name: expr.name };
    if (expr.type === 'field') return { type: 'field', object: expr.object, field: expr.field };
    if (expr.type === 'index') return { type: 'index', object: expr.object, index: expr.index };
    return expr;
  }

  private collectAssignTargets(expr: AST.ExpressionNode, targets: AST.AssignTarget[]): void {
    if (expr.type === 'variable') {
      targets.push({ type: 'name', name: expr.name });
    } else if (expr.type === 'index') {
      targets.push({ type: 'index', object: expr.object, index: expr.index });
    } else if (expr.type === 'field') {
      targets.push({ type: 'field', object: expr.object, field: expr.field });
    }
  }

  // Expression parsing with precedence
  private parseExpression(): AST.ExpressionNode {
    return this.parseOr();
  }

  private parseOr(): AST.ExpressionNode {
    let left = this.parseAnd();
    while (this.check(TokenType.OR)) {
      const op = this.advance().lexeme;
      const right = this.parseAnd();
      left = { type: 'binary', operator: op.toUpperCase(), left, right };
    }
    return left;
  }

  private parseAnd(): AST.ExpressionNode {
    let left = this.parseComparison();
    while (this.check(TokenType.AND)) {
      const op = this.advance().lexeme;
      const right = this.parseComparison();
      left = { type: 'binary', operator: op.toUpperCase(), left, right };
    }
    return left;
  }

  private parseComparison(): AST.ExpressionNode {
    let left = this.parseBitwise();

    const ops = [
      TokenType.EQUAL_EQUAL, TokenType.BANG_EQUAL,
      TokenType.LESS, TokenType.GREATER,
      TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL,
    ];
    while (this.checkAny(ops)) {
      const op = this.advance().lexeme;
      const right = this.parseBitwise();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  private parseBitwise(): AST.ExpressionNode {
    let left = this.parseConcat();

    const bitOps = [TokenType.AMPERSAND, TokenType.PIPE, TokenType.BIT_LSHIFT, TokenType.BIT_RSHIFT];
    while (this.checkAny(bitOps)) {
      const op = this.advance().lexeme;
      const right = this.parseConcat();
      const bitName = op === '&' ? 'band' : op === '|' ? 'bor' : op === '<<' ? 'lshift' : 'rshift';
      const object: AST.ExpressionNode = { type: 'variable', name: 'bit' };
      const field: AST.ExpressionNode = { type: 'field', object, field: bitName };
      left = { type: 'call', callee: field, args: [left, right] };
    }

    return left;
  }

  private parseConcat(): AST.ExpressionNode {
    let left = this.parseAddition();
    while (this.check(TokenType.DOT_DOT)) {
      this.advance();
      const right = this.parseAddition();
      left = { type: 'binary', operator: '..', left, right };
    }
    return left;
  }

  private parseAddition(): AST.ExpressionNode {
    let left = this.parseMultiplication();

    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.advance().lexeme;
      const right = this.parseMultiplication();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  private parseMultiplication(): AST.ExpressionNode {
    let left = this.parseUnary();

    while (this.check(TokenType.STAR) || this.check(TokenType.SLASH) || this.check(TokenType.PERCENT)) {
      const op = this.advance().lexeme;
      const right = this.parseUnary();
      left = { type: 'binary', operator: op, left, right };
    }

    return left;
  }

  private parseUnary(): AST.ExpressionNode {
    if (this.check(TokenType.MINUS) || this.check(TokenType.BANG) || this.check(TokenType.NOT) || this.check(TokenType.HASH) || this.check(TokenType.TILDE)) {
      const op = this.advance().lexeme;
      const right = this.parseUnary();
      if (op === '~') {
        return { type: 'call', callee: { type: 'field', object: { type: 'variable', name: 'bit' }, field: 'bnot' }, args: [right] };
      }
      return { type: 'unary', operator: op, operand: right };
    }

    return this.parseCall();
  }

  private parseCall(): AST.ExpressionNode {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        const args = this.parseArgList();
        this.consume(TokenType.RPAREN, "Expected ')' after arguments");
        expr = { type: 'call', callee: expr, args };
      } else if (this.check(TokenType.DOT)) {
        this.advance();
        const field = this.consume(TokenType.IDENTIFIER, "Expected field name after '.'").lexeme;
        expr = { type: 'field', object: expr, field };
      } else if (this.check(TokenType.COLON)) {
        this.advance();
        const method = this.consume(TokenType.IDENTIFIER, "Expected method name after ':'").lexeme;
        const args = this.check(TokenType.LPAREN) ? this.parseArgList() : [];
        expr = { type: 'method_call', object: expr, method, args };
      } else if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const index = this.parseExpression();
        this.consume(TokenType.RBRACKET, "Expected ']' after index");
        expr = { type: 'index', object: expr, index };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): AST.ExpressionNode {
    this.skipNewlines();

    if (this.check(TokenType.NUMBER)) {
      return { type: 'literal', value: this.advance().literal };
    }
    if (this.check(TokenType.STRING)) {
      return { type: 'literal', value: this.advance().literal };
    }
    if (this.check(TokenType.BOOLEAN)) {
      return { type: 'literal', value: this.advance().literal };
    }
    if (this.check(TokenType.NIL)) {
      this.advance();
      return { type: 'literal', value: null };
    }

    if (this.check(TokenType.IDENTIFIER)) {
      const name = this.advance().lexeme;
      return { type: 'variable', name };
    }

    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    if (this.check(TokenType.LBRACE)) {
      return this.parseTable();
    }

    if (this.check(TokenType.LBRACKET)) {
      return this.parseArray();
    }

    if (this.check(TokenType.FUNCTION)) {
      return this.parseFunctionExpr();
    }

    throw new Error(`Unexpected token: ${this.peek().lexeme} at line ${this.peek().line}`);
  }

  private parseTable(): AST.TableNode {
    this.consume(TokenType.LBRACE, "Expected '{'");
    const fields: Array<{ key: AST.ExpressionNode; value: AST.ExpressionNode }> = [];

    this.skipNewlines();
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.RBRACE)) break;

      // [expr] = expr
      if (this.check(TokenType.LBRACKET)) {
        this.advance();
        const key = this.parseExpression();
        this.consume(TokenType.RBRACKET, "Expected ']'");
        this.consume(TokenType.ASSIGN, "Expected '='");
        const value = this.parseExpression();
        fields.push({ key, value });
      } else if (this.check(TokenType.IDENTIFIER) && this.checkNext(TokenType.ASSIGN)) {
        // name = value
        const key: AST.ExpressionNode = { type: 'literal', value: this.advance().lexeme };
        this.advance(); // =
        const value = this.parseExpression();
        fields.push({ key, value });
      } else {
        const value = this.parseExpression();
        fields.push({ key: { type: 'literal', value: null }, value });
      }

      this.skipNewlines();
      if (this.check(TokenType.COMMA) || this.check(TokenType.SEMICOLON)) this.advance();
      this.skipNewlines();
    }

    this.consume(TokenType.RBRACE, "Expected '}'");
    return { type: 'table', fields };
  }

  private parseArray(): AST.ArrayNode {
    this.consume(TokenType.LBRACKET, "Expected '['");
    const elements: AST.ExpressionNode[] = [];

    this.skipNewlines();
    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      elements.push(this.parseExpression());
      this.skipNewlines();
      if (this.check(TokenType.COMMA)) this.advance();
      this.skipNewlines();
    }

    this.consume(TokenType.RBRACKET, "Expected ']'");
    return { type: 'array', elements };
  }

  private parseFunctionExpr(): AST.FunctionExprNode {
    this.consume(TokenType.FUNCTION, "Expected 'function'");
    this.consume(TokenType.LPAREN, "Expected '('");
    const params = this.parseParamList();
    this.consume(TokenType.RPAREN, "Expected ')'");
    this.skipNewlines();
    const body = this.parseBlock();
    this.consume(TokenType.END, "Expected 'end'");
    return { type: 'function_expr', params, body };
  }

  private parseBlock(): AST.BlockNode {
    const statements = this.parseStatementsUntil(TokenType.END, TokenType.ELSE, TokenType.ELSEIF, TokenType.UNTIL);
    return { type: 'block', statements };
  }

  private parseParamList(): string[] {
    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      params.push(this.consume(TokenType.IDENTIFIER, "Expected parameter name").lexeme);
      while (this.check(TokenType.COMMA)) {
        this.advance();
        params.push(this.consume(TokenType.IDENTIFIER, "Expected parameter name").lexeme);
      }
    }
    return params;
  }

  private parseArgList(): AST.ExpressionNode[] {
    const args: AST.ExpressionNode[] = [];
    if (!this.check(TokenType.RPAREN) && !this.checkNewline()) {
      args.push(this.parseExpression());
      while (this.check(TokenType.COMMA)) {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    return args;
  }

  private skipNewlines(): void {
    while (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
      this.advance();
    }
  }

  // Helper methods
  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private checkNext(type: TokenType): boolean {
    if (this.current + 1 >= this.tokens.length) return false;
    return this.tokens[this.current + 1].type === type;
  }

  private checkNewline(): boolean {
    return this.check(TokenType.NEWLINE) || this.peek()?.type === TokenType.EOF;
  }

  private checkAny(types: TokenType[]): boolean {
    return types.some(t => this.check(t));
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    const token = this.peek();
    this.errors.push(`${message} at line ${token.line}, column ${token.column} (got '${token.lexeme}')`);
    this.advance();
    return token;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private isAtEnd(): boolean {
    return this.current >= this.tokens.length || this.peek().type === TokenType.EOF;
  }
}