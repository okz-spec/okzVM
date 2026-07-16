import * as AST from '../ast/ASTNode';
import { Instruction, BytecodeChunk, Value } from '../../vm/types';

export class BytecodeGenerator {
  private instructions: Instruction[] = [];
  private constants: Value[] = [];
  private globals: string[] = [];
  private localCount: number = 0;
  private locals: Map<string, number> = new Map();
  private loops: Array<{ breakAddr: number; continueAddr: number; startAddr: number; continuePatches: number[] }> = [];
  private functionEnds: number[] = [];

  public generate(program: AST.ProgramNode): BytecodeChunk {
    this.instructions = [];
    this.constants = [];
    this.globals = [];
    this.locals = new Map();
    this.localCount = 0;
    this.loops = [];

    this.visitProgram(program);
    this.emit('HALT');

    this.peephole();

    return {
      instructions: this.instructions,
      constants: this.constants,
      globals: this.globals,
    };
  }

  // Peephole optimizer. Three dead-code elimination passes: JMP-to-next,
  // double-NOT, and DUP+POP. The i++ skip after pair-elimination is correct
  // but easy to break if you add a new pattern. This is the kind of code
  // that works perfectly for months, then breaks in a subtle way when someone
  // adds a new opcode without checking the optimizer.
  private peephole(): void {
    const instrs = this.instructions;
    for (let i = 0; i < instrs.length - 1; i++) {
      const cur = instrs[i];
      const next = instrs[i + 1];

      // JMP to next instruction → NOP
      if (cur.opcode === 'JMP' && cur.operands[0] === i + 1) {
        instrs[i].opcode = 'NOP';
        instrs[i].operands = [];
        continue;
      }

      // NOT; NOT → NOP
      if (i + 1 < instrs.length && cur.opcode === 'NOT' && next.opcode === 'NOT') {
        instrs[i].opcode = 'NOP';
        instrs[i].operands = [];
        instrs[i + 1].opcode = 'NOP';
        instrs[i + 1].operands = [];
        i++;
        continue;
      }

      // DUP; POP → NOP NOP
      if (cur.opcode === 'DUP' && next.opcode === 'POP') {
        instrs[i].opcode = 'NOP';
        instrs[i].operands = [];
        instrs[i + 1].opcode = 'NOP';
        instrs[i + 1].operands = [];
        i++;
        continue;
      }
    }
  }

  private visitProgram(node: AST.ProgramNode): void {
    for (const stmt of node.body) {
      this.visitStatement(stmt);
    }
  }

  private visitBlock(node: AST.BlockNode): void {
    const savedLocals = new Map(this.locals);
    const savedCount = this.localCount;

    for (const stmt of node.statements) {
      this.visitStatement(stmt);
      if (this.localCount > this.funcMaxLocals) {
        this.funcMaxLocals = this.localCount;
      }
    }

    this.locals = savedLocals;
    this.localCount = savedCount;
  }

  private visitStatement(stmt: AST.StatementNode): void {
    switch (stmt.type) {
      case 'expression_statement':
        this.visitExpression(stmt.expression);
        this.emit('POP');
        break;

      case 'function_decl':
        this.visitFunctionDecl(stmt);
        break;

      case 'variable_decl':
        this.visitVariableDecl(stmt);
        break;

      case 'assign':
        this.visitAssign(stmt);
        break;

      case 'if':
        this.visitIf(stmt);
        break;

      case 'while':
        this.visitWhile(stmt);
        break;

      case 'for':
        this.visitFor(stmt);
        break;

      case 'repeat':
        this.visitRepeat(stmt);
        break;

      case 'return':
        this.visitReturn(stmt);
        break;

      case 'break':
        this.visitBreak();
        break;

      case 'continue':
        this.visitContinue();
        break;

      case 'import':
        this.visitImport(stmt);
        break;
    }
  }

  private funcMaxLocals: number = 0;

  // Forward-jump function compilation with backpatching.
  // Emit a JMP 0 placeholder, compile the function body inline, then patch
  // the jump to skip over it. The function body lives inside the enclosing
  // instruction stream (Lua-style "functions are constants"). The funcMaxLocals
  // tracking is needed because visitBlock saves/restores locals but funcMaxLocals
  // must survive across calls or nested functions corrupt the outer count.
  private visitFunctionDecl(node: AST.FunctionDeclNode): void {
    const skipJmpAddr = this.emit('JMP', 0);
    const funcAddr = this.instructions.length;
    const savedLocals = new Map(this.locals);
    const savedCount = this.localCount;
    this.locals = new Map();
    this.localCount = 0;

    node.params.forEach((p, i) => {
      this.locals.set(p, i);
      this.localCount = Math.max(this.localCount, i + 1);
    });

    this.funcMaxLocals = this.localCount;
    this.visitBlock(node.body);
    const funcLocals = this.funcMaxLocals;

    this.emit('RET');
    this.patchJump(skipJmpAddr, this.instructions.length);

    const addrConst = this.addConstant({ type: 'number', value: funcAddr });
    const nameConst = this.addConstant({ type: 'string', value: node.name || '' });
    this.emit('MAKE_FUNCTION', addrConst, nameConst, funcLocals);
    if (node.name) {
      if (this.locals.has(node.name)) {
        this.emit('STORE', this.locals.get(node.name)!);
      } else {
        this.emit('STORE_GLOBAL', this.addGlobal(node.name));
      }
    }
  }

  private visitVariableDecl(node: AST.VariableDeclNode): void {
    if (node.names.length > 1 && node.initializer) {
      this.visitExpression(node.initializer);
      for (let i = 0; i < node.names.length; i++) {
        const name = node.names[i];
        if (i < node.names.length - 1) this.emit('DUP');
        this.emit('PUSH', this.addConstant({ type: 'number', value: i + 1 }));
        this.emit('INDEX_GET');
        if (node.isLocal) {
          const idx = this.localCount++;
          this.locals.set(name, idx);
          this.emit('STORE', idx);
        } else {
          this.emit('STORE_GLOBAL', this.addGlobal(name));
        }
      }
      this.emit('POP');
      return;
    }

    if (node.initializer) {
      this.visitExpression(node.initializer);
    } else {
      this.emit('NEW_NIL');
    }

    const name = node.names[0] || '';
    if (node.isLocal) {
      const idx = this.localCount++;
      this.locals.set(name, idx);
      this.emit('STORE', idx);
    } else {
      const idx = this.addGlobal(name);
      this.emit('STORE_GLOBAL', idx);
    }
  }

  private visitAssign(node: AST.AssignNode): void {
    const hasIndex = node.targets.some(t => t.type === 'index' || t.type === 'field');

    if (hasIndex) {
      for (const target of node.targets) {
        if (target.type === 'index') {
          this.visitExpression(target.object);
          this.visitExpression(target.index);
        } else if (target.type === 'field') {
          this.visitExpression(target.object);
          this.emit('PUSH', this.addConstant({ type: 'string', value: target.field }));
        }
      }
      this.visitExpression(node.value);
      for (const target of node.targets) {
        if (target.type === 'index' || target.type === 'field') {
          this.emit('INDEX_SET');
          this.emit('POP');
        }
      }
    } else {
      this.visitExpression(node.value);
    }

    for (const target of node.targets) {
      if (target.type === 'name') {
        if (this.locals.has(target.name)) {
          this.emit('STORE', this.locals.get(target.name)!);
        } else {
          this.emit('STORE_GLOBAL', this.addGlobal(target.name));
        }
      }
    }
  }

  private visitIf(node: AST.IfNode): void {
    this.visitExpression(node.condition);
    const elseJmp = this.emit('JZ', 0);

    this.visitBlock(node.thenBranch);

    const endJmps: number[] = [];

    if (node.elseIfBranches.length > 0 || node.elseBranch) {
      const endJmp = this.emit('JMP', 0);
      endJmps.push(endJmp);

      this.patchJump(elseJmp, this.instructions.length);

      for (const elseif of node.elseIfBranches) {
        this.visitExpression(elseif.condition);
        const elseifJmp = this.emit('JZ', 0);
        this.visitBlock(elseif.block);
        const endElseIf = this.emit('JMP', 0);
        endJmps.push(endElseIf);
        this.patchJump(elseifJmp, this.instructions.length);
      }

      if (node.elseBranch) {
        this.visitBlock(node.elseBranch);
      }

      endJmps.forEach(jmp => this.patchJump(jmp, this.instructions.length));
    } else {
      this.patchJump(elseJmp, this.instructions.length);
    }
  }

  private visitWhile(node: AST.WhileNode): void {
    const startAddr = this.instructions.length;
    this.loops.push({ breakAddr: 0, continueAddr: startAddr, startAddr, continuePatches: [] });

    this.visitExpression(node.condition);
    const exitJmp = this.emit('JZ', 0);

    this.visitBlock(node.body);
    this.emit('JMP', startAddr);
    this.patchJump(exitJmp, this.instructions.length);

    const loop = this.loops.pop()!;
    if (loop.breakAddr > 0) {
      this.patchJump(loop.breakAddr, this.instructions.length);
    }
  }

  // The for-loop compiler. This is the most confusing method in the file.
  // The continue-patches system (lines 347-353) is needed because `continue`
  // in a for loop should jump to the increment section, but the increment
  // section hasn't been compiled yet when the continue is encountered. So
  // we emit a JMP to address 0, collect those addresses, then patch them
  // retroactively once we know where the increment section lives. It works
  // but it's the kind of thing that makes you question your career choices.
  private visitFor(node: AST.ForNode): void {
    const savedLocals = new Map(this.locals);
    const savedCount = this.localCount;

    const varIdx = this.localCount++;
    const endIdx = this.localCount++;
    const stepIdx = node.step ? this.localCount++ : -1;

    this.locals.set(node.variable, varIdx);

    // Store start → loop variable
    this.visitExpression(node.start);
    this.emit('STORE', varIdx);

    // Store end → end slot
    this.visitExpression(node.end);
    this.emit('STORE', endIdx);

    // Store step → step slot (or use 1)
    if (node.step) {
      this.visitExpression(node.step);
      this.emit('STORE', stepIdx);
    }

    const startAddr = this.instructions.length;
    this.loops.push({ breakAddr: 0, continueAddr: 0, startAddr, continuePatches: [] });

    // Ascending check: loop_var > end → exit
    // Descending check: loop_var < end → exit
    // When step is a known negative literal, use LT; otherwise use GT
    let useGt = true;
    if (node.step && node.step.type === 'unary' && node.step.operator === '-') {
      useGt = false;
    } else if (node.step && node.step.type === 'number_literal' && node.step.value < 0) {
      useGt = false;
    }

    this.emit('LOAD', varIdx);
    this.emit('LOAD', endIdx);
    if (useGt) {
      this.emit('GT');
    } else {
      this.emit('LT');
    }
    const exitJmp = this.emit('JNZ', 0);

    this.visitBlock(node.body);

    // Patch continueAddr to jump here (the increment section)
    if (this.loops.length > 0) {
      const loop = this.loops[this.loops.length - 1];
      loop.continueAddr = this.instructions.length;
      for (const jmpAddr of loop.continuePatches) {
        this.instructions[jmpAddr].operands[0] = loop.continueAddr;
      }
    }

    // Increment
    this.emit('LOAD', varIdx);
    if (node.step) {
      this.emit('LOAD', stepIdx);
    } else {
      this.emit('PUSH', this.addConstant({ type: 'number', value: 1 }));
    }
    this.emit('ADD');
    this.emit('STORE', varIdx);
    this.emit('JMP', startAddr);

    this.patchJump(exitJmp, this.instructions.length);

    const loop = this.loops.pop()!;
    if (loop.breakAddr > 0) {
      this.patchJump(loop.breakAddr, this.instructions.length);
    }

    this.locals = savedLocals;
    this.localCount = savedCount;
  }

  private visitRepeat(node: AST.RepeatNode): void {
    const startAddr = this.instructions.length;
    this.loops.push({ breakAddr: 0, continueAddr: startAddr, startAddr, continuePatches: [] });

    this.visitBlock(node.body);
    this.visitExpression(node.condition);
    this.emit('JZ', startAddr);

    const loop = this.loops.pop()!;
    if (loop.breakAddr > 0) {
      this.patchJump(loop.breakAddr, this.instructions.length);
    }
  }

  private visitReturn(node: AST.ReturnNode): void {
    if (node.value) {
      this.visitExpression(node.value);
    } else {
      this.emit('NEW_NIL');
    }
    this.emit('RET');
  }

  private visitBreak(): void {
    const loop = this.loops[this.loops.length - 1];
    if (loop) {
      loop.breakAddr = this.emit('JMP', 0);
    }
  }

  private visitContinue(): void {
    const loop = this.loops[this.loops.length - 1];
    if (loop) {
      const jmpAddr = this.emit('JMP', 0);
      if (loop.continueAddr > 0) {
        this.instructions[jmpAddr].operands[0] = loop.continueAddr;
      } else {
        loop.continuePatches.push(jmpAddr);
      }
    }
  }

  private visitExpression(expr: AST.ExpressionNode): void {
    switch (expr.type) {
      case 'literal':
        this.visitLiteral(expr);
        break;
      case 'variable':
        this.visitVariable(expr);
        break;
      case 'binary':
        this.visitBinary(expr);
        break;
      case 'unary':
        this.visitUnary(expr);
        break;
      case 'call':
        this.visitCall(expr);
        break;
      case 'index':
        this.visitIndex(expr);
        break;
      case 'field':
        this.visitField(expr);
        break;
      case 'table':
        this.visitTable(expr);
        break;
      case 'array':
        this.visitArray(expr);
        break;
      case 'function_expr':
        this.visitFunctionExpr(expr);
        break;
      case 'method_call':
        this.visitMethodCall(expr);
        break;
    }
  }

  private visitLiteral(node: AST.LiteralNode): void {
    const val = node.value;
    if (val === null) {
      this.emit('NEW_NIL');
    } else if (typeof val === 'number') {
      this.emit('PUSH', this.addConstant({ type: 'number', value: val }));
    } else if (typeof val === 'string') {
      this.emit('PUSH', this.addConstant({ type: 'string', value: val }));
    } else if (typeof val === 'boolean') {
      this.emit('NEW_BOOL', val ? 1 : 0);
    }
  }

  private visitVariable(node: AST.VariableNode): void {
    if (this.locals.has(node.name)) {
      this.emit('LOAD', this.locals.get(node.name)!);
    } else {
      this.emit('LOAD_GLOBAL', this.addGlobal(node.name));
    }
  }

  private visitBinary(node: AST.BinaryNode): void {
    if (node.operator === 'AND' || node.operator === 'OR') {
      if (node.left.type === 'literal' && (node.left.value === true || node.left.value === false)) {
        const shortCircuit = node.operator === 'AND' ? !node.left.value : node.left.value;
        if (shortCircuit) {
          this.visitExpression(node.left);
        } else {
          this.visitExpression(node.right);
        }
        return;
      }
      this.visitExpression(node.left);
      this.emit('DUP');
      const branch = node.operator === 'AND' ? 'JZ' : 'JNZ';
      const jmpAddr = this.emit(branch, 0);
      this.emit('POP');
      this.visitExpression(node.right);
      this.patchJump(jmpAddr, this.instructions.length);
      return;
    }

    const folded = this.tryFoldBinary(node);
    if (folded !== null) {
      this.emit('PUSH', this.addConstant(folded));
      return;
    }

    this.visitExpression(node.left);
    this.visitExpression(node.right);

    const opMap: Record<string, string> = {
      '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
      '==': 'EQ', '~=': 'NEQ', '<': 'LT', '>': 'GT', '<=': 'LTE', '>=': 'GTE',
      '..': 'CONCAT',
    };

    const op = opMap[node.operator];
    if (op) {
      this.emit(op);
    }
  }

  private tryFoldBinary(node: AST.BinaryNode): Value | null {
    const l = node.left;
    const r = node.right;
    if (l.type !== 'literal' || r.type !== 'literal') return null;
    const lv = l.value;
    const rv = r.value;
    if (typeof lv !== 'number' || typeof rv !== 'number') {
      if (node.operator === '..' && typeof lv === 'string' && typeof rv === 'string') {
        return { type: 'string', value: lv + rv };
      }
      return null;
    }
    switch (node.operator) {
      case '+': return { type: 'number', value: lv + rv };
      case '-': return { type: 'number', value: lv - rv };
      case '*': return { type: 'number', value: lv * rv };
      case '/': return { type: 'number', value: rv !== 0 ? lv / rv : 0 };
      case '%': return { type: 'number', value: rv !== 0 ? lv % rv : 0 };
      case '==': return { type: 'boolean', value: lv === rv };
      case '~=': return { type: 'boolean', value: lv !== rv };
      case '<': return { type: 'boolean', value: lv < rv };
      case '>': return { type: 'boolean', value: lv > rv };
      case '<=': return { type: 'boolean', value: lv <= rv };
      case '>=': return { type: 'boolean', value: lv >= rv };
      default: return null;
    }
  }

  private visitUnary(node: AST.UnaryNode): void {
    if (node.operator === '-' && node.operand.type === 'literal' && typeof node.operand.value === 'number') {
      this.emit('PUSH', this.addConstant({ type: 'number', value: -node.operand.value }));
      return;
    }
    if ((node.operator === 'not' || node.operator === '!') && node.operand.type === 'literal' && typeof node.operand.value === 'boolean') {
      this.emit('NEW_BOOL', node.operand.value ? 0 : 1);
      return;
    }
    this.visitExpression(node.operand);
    switch (node.operator) {
      case '-': this.emit('NEG'); break;
      case 'not': case '!': this.emit('NOT'); break;
      case '#': this.emit('LEN'); break;
    }
  }

  private visitCall(node: AST.CallNode): void {
    this.visitExpression(node.callee);
    node.args.forEach(arg => this.visitExpression(arg));
    this.emit('CALL', node.args.length);
  }

  private visitMethodCall(node: AST.MethodCallNode): void {
    this.visitExpression(node.object);
    this.emit('DUP');
    this.emit('PUSH', this.addConstant({ type: 'string', value: node.method }));
    this.emit('INDEX_GET');
    this.emit('SWAP');
    node.args.forEach(arg => this.visitExpression(arg));
    this.emit('CALL', node.args.length + 1);
  }

  private visitImport(_node: AST.ImportNode): void {
    // Imports are resolved in Compiler before bytecode generation
  }

  private visitIndex(node: AST.IndexNode): void {
    this.visitExpression(node.object);
    this.visitExpression(node.index);
    this.emit('INDEX_GET');
  }

  private visitField(node: AST.FieldNode): void {
    this.visitExpression(node.object);
    this.emit('PUSH', this.addConstant({ type: 'string', value: node.field }));
    this.emit('INDEX_GET');
  }

  private visitTable(node: AST.TableNode): void {
    this.emit('NEW_TABLE');
    let autoIdx = 1;
    for (const field of node.fields) {
      this.emit('DUP');
      if (field.key.type === 'literal' && field.key.value === null) {
        this.emit('PUSH', this.addConstant({ type: 'number', value: autoIdx }));
        autoIdx = autoIdx + 1;
      } else {
        this.visitExpression(field.key);
      }
      this.visitExpression(field.value);
      this.emit('INDEX_SET');
      this.emit('POP');
    }
  }

  private visitArray(node: AST.ArrayNode): void {
    this.emit('NEW_ARRAY');
    node.elements.forEach((elem, i) => {
      this.emit('DUP');
      this.emit('PUSH', this.addConstant({ type: 'number', value: i + 1 }));
      this.visitExpression(elem);
      this.emit('INDEX_SET');
      this.emit('POP');
    });
  }

  private visitFunctionExpr(node: AST.FunctionExprNode): void {
    const skipJmpAddr = this.emit('JMP', 0);
    const funcAddr = this.instructions.length;
    const savedLocals = new Map(this.locals);
    const savedCount = this.localCount;
    this.locals = new Map();
    this.localCount = 0;

    node.params.forEach((p, i) => {
      this.locals.set(p, i);
      this.localCount = Math.max(this.localCount, i + 1);
    });

    this.funcMaxLocals = this.localCount;
    this.visitBlock(node.body);
    const funcLocals = this.funcMaxLocals;

    this.emit('RET');
    this.patchJump(skipJmpAddr, this.instructions.length);

    this.locals = savedLocals;
    this.localCount = savedCount;

    const addrConst = this.addConstant({ type: 'number', value: funcAddr });
    const nameConst = this.addConstant({ type: 'string', value: '' });
    this.emit('MAKE_FUNCTION', addrConst, nameConst, funcLocals);
  }

  private emit(opcode: string, ...operands: number[]): number {
    const addr = this.instructions.length;
    this.instructions.push({ opcode, operands });
    return addr;
  }

  private patchJump(instrAddr: number, targetAddr: number): void {
    if (instrAddr < this.instructions.length) {
      this.instructions[instrAddr].operands = [targetAddr];
    }
  }

  private addConstant(val: Value): number {
    const idx = this.constants.findIndex(c => {
      if (c.type !== val.type) return false;
      if (c.type === 'number') return (c as any).value === (val as any).value;
      if (c.type === 'string') return (c as any).value === (val as any).value;
      if (c.type === 'boolean') return (c as any).value === (val as any).value;
      return false;
    });
    if (idx !== -1) return idx;
    this.constants.push(val);
    return this.constants.length - 1;
  }

  private addGlobal(name: string): number {
    const idx = this.globals.indexOf(name);
    if (idx !== -1) return idx;
    this.globals.push(name);
    return this.globals.length - 1;
  }
}