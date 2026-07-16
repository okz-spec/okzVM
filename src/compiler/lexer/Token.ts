import { Token, TokenType } from '../types';

export class TokenUtil {
  static create(type: TokenType, lexeme: string, literal: any, line: number, column: number): Token {
    return { type, lexeme, literal, line, column };
  }

  static isKeyword(lexeme: string): boolean {
    return ['function', 'end', 'if', 'then', 'else', 'elseif', 'while', 'do',
            'for', 'in', 'repeat', 'until', 'return', 'local', 'true', 'false',
             'nil', 'and', 'or', 'not', 'break', 'continue', 'class', 'new', 'import',
             'method', 'this', 'self'].includes(lexeme);
  }
}