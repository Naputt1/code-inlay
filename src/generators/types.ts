export type ScaffoldPart = {
  kind: "struct" | "function" | "method" | "interface" | "type" | "imports";
  symbolName: string;
  signature?: string;
  receiver?: string;
  content: string;
  expectsUserCode: boolean;
  isStub: boolean;
  imports?: string[];
};
