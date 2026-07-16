import { Token, TokenType, KEYWORDS } from '../types';

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private start: number = 0;
  private current: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  public scanTokens(): Token[] {
    this.tokens = [];
    this.start = 0;
    this.current = 0;
    this.line = 1;
    this.column = 1;

    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push({
      type: TokenType.EOF,
      lexeme: '',
      literal: null,
      line: this.line,
      column: this.column,
    });

    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();

    switch (c) {
      // Single-character tokens
      case '(': this.addToken(TokenType.LPAREN); break;
      case ')': this.addToken(TokenType.RPAREN); break;
      case '[': this.addToken(TokenType.LBRACKET); break;
      case ']': this.addToken(TokenType.RBRACKET); break;
      case '{': this.addToken(TokenType.LBRACE); break;
      case '}': this.addToken(TokenType.RBRACE); break;
      case ',': this.addToken(TokenType.COMMA); break;
      case ';': this.addToken(TokenType.SEMICOLON); break;
      case '+':
        if (this.match('=')) this.addToken(TokenType.PLUS_EQUAL);
        else this.addToken(TokenType.PLUS);
        break;
      case '-':
        if (this.match('-')) {
          while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
        } else if (this.match('=')) {
          this.addToken(TokenType.MINUS_EQUAL);
        } else {
          this.addToken(TokenType.MINUS);
        }
        break;
      case '*':
        if (this.match('=')) this.addToken(TokenType.STAR_EQUAL);
        else this.addToken(TokenType.STAR);
        break;
      case '%':
        if (this.match('=')) this.addToken(TokenType.PERCENT_EQUAL);
        else this.addToken(TokenType.PERCENT);
        break;

      // Dot
      case '.':
        if (this.match('.')) this.addToken(TokenType.DOT_DOT);
        else this.addToken(TokenType.DOT);
        break;

      // Colon
      case '#':
        this.addToken(TokenType.HASH);
        break;
      case ':':
        this.addToken(TokenType.COLON);
        break;

      // Slash and comments
      case '/':
        if (this.match('/')) {
          while (this.peek() !== '\n' && !this.isAtEnd()) this.advance();
        } else if (this.match('*')) {
          this.blockComment();
        } else if (this.match('=')) {
          this.addToken(TokenType.SLASH_EQUAL);
        } else {
          this.addToken(TokenType.SLASH);
        }
        break;

      // Comparison operators
      case '=':
        if (this.match('=')) this.addToken(TokenType.EQUAL_EQUAL);
        else this.addToken(TokenType.ASSIGN);
        break;
      case '!':
        if (this.match('=')) this.addToken(TokenType.BANG_EQUAL);
        else this.addToken(TokenType.BANG);
        break;
      case '~':
        if (this.match('=')) this.addToken(TokenType.BANG_EQUAL);
        else this.addToken(TokenType.TILDE);
        break;
      case '&':
        this.addToken(TokenType.AMPERSAND);
        break;
      case '|':
        this.addToken(TokenType.PIPE);
        break;
      case '<':
        if (this.match('=')) this.addToken(TokenType.LESS_EQUAL);
        else if (this.match('<')) this.addToken(TokenType.BIT_LSHIFT);
        else this.addToken(TokenType.LESS);
        break;
      case '>':
        if (this.match('=')) this.addToken(TokenType.GREATER_EQUAL);
        else if (this.match('>')) this.addToken(TokenType.BIT_RSHIFT);
        else this.addToken(TokenType.GREATER);
        break;

      // Strings
      case '"':
      case "'":
        this.string(c);
        break;

      // Newlines
      case '\n':
        this.line++;
        this.column = 1;
        break;

      // Whitespace
      case ' ':
      case '\r':
      case '\t':
        break;

      default:
        if (this.isDigit(c)) {
          this.number();
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else {
          // Ignore unknown characters
        }
        break;
    }
  }

  private string(quote: string): void {
    while (this.peek() !== quote && !this.isAtEnd()) {
      if (this.peek() === '\n') { this.line++; this.column = 0; }
      if (this.peek() === '\\') {
        this.advance();
      }
      this.advance();
    }

    if (this.isAtEnd()) {
      // Unterminated string
      return;
    }

    this.advance(); // closing quote
    const value = this.source.substring(this.start + 1, this.current - 1);
    const escaped = value
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
    this.addToken(TokenType.STRING, escaped);
  }

  private number(): void {
    while (this.isDigit(this.peek())) this.advance();

    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance();
      while (this.isDigit(this.peek())) this.advance();
    }

    if ((this.peek() === 'e' || this.peek() === 'E') && this.peek() !== '\0') {
      const next = this.peekNext();
      if (this.isDigit(next) || next === '+' || next === '-') {
        this.advance();
        if (this.peek() === '+' || this.peek() === '-') this.advance();
        if (this.isDigit(this.peek())) {
          while (this.isDigit(this.peek())) this.advance();
        }
      }
    }

    this.addToken(TokenType.NUMBER, parseFloat(this.source.substring(this.start, this.current)));
  }

  private identifier(): void {
    while (this.isAlphaNumeric(this.peek())) this.advance();

    const text = this.source.substring(this.start, this.current);
    const type = KEYWORDS[text] || TokenType.IDENTIFIER;

    if (type === TokenType.TRUE) {
      this.addToken(TokenType.BOOLEAN, true);
    } else if (type === TokenType.FALSE) {
      this.addToken(TokenType.BOOLEAN, false);
    } else if (type === TokenType.NIL_KEYWORD) {
      this.addToken(TokenType.NIL, null);
    } else {
      this.addToken(type);
    }
  }

  private blockComment(): void {
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      if (this.peek() === '\n') { this.line++; this.column = 0; }
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance(); this.advance();
        depth--;
      } else if (this.peek() === '/' && this.peekNext() === '*') {
        this.advance(); this.advance();
        depth++;
      } else {
        this.advance();
      }
    }
  }

  private advance(): string {
    this.current++;
    this.column++;
    return this.source[this.current - 1];
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source[this.current] !== expected) return false;
    this.current++;
    this.column++;
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.current];
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return '\0';
    return this.source[this.current + 1];
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private addToken(type: TokenType, literal?: any): void {
    const text = this.source.substring(this.start, this.current);
    this.tokens.push({
      type,
      lexeme: text,
      literal: literal !== undefined ? literal : null,
      line: this.line,
      column: this.column - (this.current - this.start),
    });
  }
}