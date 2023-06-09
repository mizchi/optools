// import { SymbolFlags, isBlock, forEachChild, Node, SourceFile, SyntaxKind, Symbol, TypeChecker, Type, TypeFlags, Program, Block, isSourceFile, isPropertyDeclaration, isClassDeclaration, ClassDeclaration, isMethodDeclaration, VariableStatement, TypeAliasDeclaration, InterfaceDeclaration, FunctionDeclaration, EnumDeclaration, ModuleDeclaration, isVariableStatement, isInterfaceDeclaration, isTypeAliasDeclaration, isFunctionDeclaration, isEnumDeclaration, isModuleDeclaration, NamedDeclaration, VariableDeclaration } from "typescript";
import ts from "typescript";

// from typescript: https://github.com/microsoft/TypeScript/blob/d79ec186d6a4e39f57af6143761d453466a32e0c/src/compiler/program.ts#L3384-L3399
export function getNodeAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node {
  let current: ts.Node = sourceFile;
  const getContainingChild = (child: ts.Node) => {
    if (
      child.pos <= position &&
      (position < child.end || (position === child.end && child.kind === ts.SyntaxKind.EndOfFileToken))
    ) {
      return child;
    }
  };
  while (true) {
    const child = ts.forEachChild(current, getContainingChild);
    if (!child) {
      return current;
    }
    current = child;
  }
}

export function getNodeAtRange(sourceFile: ts.SourceFile, start: number, end: number): ts.Node | undefined {
  let result: ts.Node | undefined = undefined;

  const checkNode = (node: ts.Node): void => {
    // Check if this node's range matches first
    if (node.pos <= start && node.end >= end) {
      result = node; // Set this node as the result
    }

    // Then, check this node's children
    ts.forEachChild(node, checkNode);
  };

  ts.forEachChild(sourceFile, checkNode);

  return result;
}

export function getFirstNodeFromMatcher(source: ts.SourceFile, matcher: RegExp | string): ts.Node | undefined {
  const text = source.getFullText();
  const pos = text.search(matcher);
  if (pos < 0) {
    return;
  }
  return getNodeAtPosition(source, pos);
}

/**
 * find first string matched node in file
 * for testing purpose
 */
export const findFirstNode = (program: ts.Program, fileName: string, matcher: string | RegExp) => {
  const source = program.getSourceFile(fileName);
  if (source) {
    const code = source.getFullText();
    const pos = code.search(matcher);
    if (pos < 0) {
      return;
    }
    const node = getNodeAtPosition(source, pos);
    return node;
  }
};

export type Visitor = (node: ts.Node, depth?: number) => boolean | void;
export function composeVisitors(...visitors: Visitor[]): Visitor {
  const visit = (node: ts.Node, depth = 0) => {
    for (const visitor of visitors) {
      const ret = visitor(node, depth);
      if (ret === false) {
        break;
      }
    }
    ts.forEachChild(node, (node) => visit(node, depth + 1));
  };
  return visit;
}

export function findClosestBlock(node: ts.Node) {
  while (node && !ts.isSourceFile(node) && !ts.isBlock(node)) {
    node = node.parent;
  }
  return node;
}

const circularSymbol = Symbol("circular");
export type ReadbleNode = {
  kind: ts.SyntaxKind[keyof ts.SyntaxKind][];
  text: string;
  flags?: ts.NodeFlags[keyof ts.NodeFlags][];
} & {
  [key: string]: ReadbleNodeOrSymbol;
};

type ReadbleNodeOrSymbol = ReadbleNode | typeof circularSymbol;

export function toReadableNode(node: ts.Node, includeParentDepth: number = 0): ReadbleNode {
  const visitedNodes = new Set<ts.Node>();
  const ret = toReadableNode(node, includeParentDepth);
  visitedNodes.clear();
  return ret as ReadbleNode;

  function isNode(node: any): node is ts.Node {
    return node && node.kind && ts.SyntaxKind[node.kind] != null;
  }
  function toReadableNode(node: ts.Node, includeParentDepth: number): ReadbleNodeOrSymbol {
    if (visitedNodes.has(node)) {
      return circularSymbol;
    }
    visitedNodes.add(node);
    const obj: any = {
      // ...node,
      kind: ts.SyntaxKind[node.kind],
      text: formatText(node.getText()),
    };

    // const childNodes:
    for (const [key, val] of Object.entries(node)) {
      if (key === "parent" && includeParentDepth <= 0) continue;
      if (key === "flags") {
        const flags = toReadableFlags(node.flags);
        if (flags.length > 0) {
          obj.flags = flags;
        }
      }
      if (Array.isArray(val)) {
        obj[key] = val.map((v) => (isNode(v) ? toReadableNode(v, includeParentDepth - 1) : v));
      } else {
        if (isNode(val)) {
          obj[key] = toReadableNode(val, includeParentDepth - 1);
        }
      }
    }
    return obj;
  }

  function toReadableFlags(flags: ts.NodeFlags) {
    const readableFlags: string[] = [];
    for (const [key, val] of Object.entries(ts.NodeFlags)) {
      if (typeof val === "number" && flags & val) {
        readableFlags.push(key);
      }
    }
    return readableFlags;
  }
  function formatText(s: string) {
    return (
      s
        // .replace(/[\;\{\:,]/g, (s) => `${s} `)
        // .replace(/\{/g, " { ")
        .replace(/\=\>/g, " => ")
        .replace(/[\n\s]+/g, " ")
        .replace(/;\s?$/g, "")
    );
  }
}

export type ReadableSymbol = {
  name: string;
  valueDeclaration?: ReadbleNode;
  declarations?: ReadbleNode[];
  isSingleSource: boolean;
  typeOnly: boolean;
  flags?: Array<ts.SymbolFlags[keyof ts.SymbolFlags]>;
};

export function toReadableSymbol(
  symbol: ts.Symbol,
  useFlags: boolean = false,
  includeParent: number = 0,
): ReadableSymbol {
  const isSingleSource =
    symbol.declarations && symbol.declarations.length === 1 && symbol.declarations[0] === symbol.valueDeclaration;
  const typeOnly =
    !symbol.valueDeclaration && symbol.declarations && symbol.declarations.every((decl) => ts.isTypeNode(decl));
  const ret: ReadableSymbol = {
    name: symbol.name,
    isSingleSource: !!isSingleSource,
    typeOnly: !!typeOnly,
    valueDeclaration: symbol.valueDeclaration && toReadableNode(symbol.valueDeclaration, includeParent),
    declarations: symbol.declarations && symbol.declarations.map((decl) => toReadableNode(decl, includeParent)),
    flags: useFlags ? toReadabelSymbolFlags(symbol.flags) : undefined,
  };

  if (useFlags) {
    ret.flags = toReadabelSymbolFlags(symbol.flags);
  }

  return ret;

  function toReadabelSymbolFlags(flags: ts.SymbolFlags) {
    const ret: string[] = [];
    for (const [key, val] of Object.entries(ts.SymbolFlags)) {
      if (typeof val === "number" && flags & val) {
        ret.push(key);
      }
    }
    return ret as any;
  }
}

export function toReadableType(type: ts.Type) {
  const checker = (type as any).checker as ts.TypeChecker;
  return {
    typeName: checker.typeToString(type),
    symbol: type.symbol && toReadableSymbol(type.symbol),
    aliasSymbol: type.aliasSymbol && toReadableSymbol(type.aliasSymbol),
  };
}

export function isSymbolInferredFromValueDeclaration(checker: ts.TypeChecker, symbol: ts.Symbol) {
  const type = checker.getTypeOfSymbol(symbol);
  return isTypeInferredFromValueDeclaration(type);
}

export function isTypeInferredFromValueDeclaration(type: ts.Type) {
  if (type.symbol?.declarations && type.symbol?.declarations.length > 1) {
    return false;
  }
  return type.symbol?.valueDeclaration === type.symbol?.declarations?.[0];
}

export function formatCode(code: string) {
  return code.replace(/[\s\n]+/g, " ").trim().trimEnd();
}
