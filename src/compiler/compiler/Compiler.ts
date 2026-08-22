import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { BytecodeGenerator } from '../bytecode/BytecodeGenerator';
import { BytecodeChunk } from '../../vm/types';
import { serializeBytecode } from '../bytecode/BytecodeFormat';

export class Compiler {
  private logFn: (msg: string, type?: string) => void;
  private moduleLoader: ((name: string) => string | null) | null = null;

  constructor(logFn: (msg: string, type?: string) => void) {
    this.logFn = logFn;
  }

  public setModuleLoader(loader: (name: string) => string | null): void {
    this.moduleLoader = loader;
  }

  public compile(source: string): BytecodeChunk | null {
    try {
      this.logFn('Lexing...', 'info');
      const lexer = new Lexer(source);
      const tokens = lexer.scanTokens();
      this.logFn(`Lexer: ${tokens.length} tokens generated`, 'info');

      const lexerErrors = lexer.getErrors();
      if (lexerErrors.length > 0) {
        lexerErrors.forEach(e => this.logFn(`Lexer error: ${e}`, 'error'));
        return null;
      }

      if (tokens.length === 1) {
        this.logFn('Empty source file', 'warn');
        return {
          instructions: [{ opcode: 'HALT', operands: [] }],
          constants: [],
          globals: [],
        };
      }

      this.logFn('Parsing...', 'info');
      const parser = new Parser(tokens, source);
      const ast = parser.parse();
      const errors = parser.getErrors();

      if (errors.length > 0) {
        errors.forEach(e => this.logFn(`Parse error: ${e}`, 'error'));
        return null;
      }

      this.logFn('Parser: AST generated', 'info');

      // Resolve imports: inline loaded module AST bodies
      const resolvedBody = this.resolveImports(ast.body);
      ast.body = resolvedBody;

      this.logFn('Generating bytecode...', 'info');
      const generator = new BytecodeGenerator();
      const bytecode = generator.generate(ast);

      this.logFn(`Bytecode: ${bytecode.instructions.length} instructions, ${bytecode.constants.length} constants, ${bytecode.globals.length} globals`, 'info');

      return bytecode;

    } catch (err: any) {
      this.logFn(`Compilation error: ${err.message}`, 'error');
      return null;
    }
  }

  private resolveImports(body: any[]): any[] {
    const result: any[] = [];
    const seen = new Set<string>();

    for (const stmt of body) {
      if (stmt.type === 'import') {
        const moduleName = stmt.module;
        if (seen.has(moduleName)) continue;
        seen.add(moduleName);

        if (this.moduleLoader) {
          const code = this.moduleLoader(moduleName);
          if (code) {
            try {
              const moduleLexer = new Lexer(code);
              const moduleTokens = moduleLexer.scanTokens();
              if (moduleTokens.length > 1) {
                const moduleParser = new Parser(moduleTokens, code);
                const moduleAst = moduleParser.parse();
                if (moduleAst && !moduleParser.getErrors().length) {
                  this.logFn(`Imported module: ${moduleName} (${moduleAst.body.length} statements)`, 'info');
                  result.push(...moduleAst.body);
                }
              }
            } catch (e: any) {
              this.logFn(`Failed to import ${moduleName}: ${e.message}`, 'error');
            }
          } else {
            this.logFn(`Module not found: ${moduleName}`, 'warn');
          }
        } else {
          this.logFn(`No module loader for: ${moduleName}`, 'warn');
        }
      } else {
        result.push(stmt);
      }
    }

    return result;
  }

  public compileToBuffer(source: string): ArrayBuffer | null {
    const bytecode = this.compile(source);
    if (!bytecode) return null;
    return serializeBytecode(bytecode);
  }
}