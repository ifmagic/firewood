declare module 'monaco-editor/esm/external/jsonc-parser/lib/esm/main.js' {
  export interface EditOperation {
    offset: number;
    length: number;
    content: string;
  }

  export interface FormattingOptions {
    tabSize: number;
    insertSpaces: boolean;
    eol?: string;
    keepLines?: boolean;
    insertFinalNewline?: boolean;
  }

  export interface FormatRange {
    offset: number;
    length: number;
  }

  export interface ParseError {
    error: number;
    offset: number;
    length: number;
  }

  export interface ParseOptions {
    allowTrailingComma?: boolean;
    disallowComments?: boolean;
    allowEmptyContent?: boolean;
  }

  export function format(text: string, range: FormatRange | undefined, options: FormattingOptions): EditOperation[];
  export function parse(text: string, errors?: ParseError[], options?: ParseOptions): unknown;
}
