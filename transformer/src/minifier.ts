import { getRenamedFileChanges } from "./transformer/renamer";
import ts from "typescript";
import path from "node:path";
import { expandToSafeBatchRenameLocations, walkProjectForMangle, getMangleActionsForFile } from "./transformer/mangler";
import { createIncrementalLanguageService, createIncrementalLanguageServiceHost } from "./typescript/services";

// subset of rollup plugin but not only for rollup
export interface Minifier {
  process(): void;
  readFile(id: string): string | undefined;
  exists(id: string): boolean;
  getCompilerOptions(): ts.CompilerOptions;
}

export function createMinifier(
  projectPath: string,
  rootFileNames: string[],
  targetFileNames: string[],
  compilerOptions: ts.CompilerOptions = {},
  overrideCompilerOptions: Partial<ts.CompilerOptions> = {},
): Minifier {
  const registory = ts.createDocumentRegistry();

  const mergedCompilerOptions: ts.CompilerOptions = {
    ...compilerOptions,
    ...overrideCompilerOptions,
  };

  const host = createIncrementalLanguageServiceHost(projectPath, targetFileNames, mergedCompilerOptions);
  const service = createIncrementalLanguageService(host, registory);
  const normalizePath = (fname: string) => {
    if (fname.startsWith("/")) {
      return fname;
    }
    return path.join(projectPath, fname); //
  };

  return {
    process,
    exists: host.fileExists,
    getCompilerOptions() {
      return mergedCompilerOptions;
    },
    readFile(id: string) {
      const content = service.readSnapshotContent(id);
      if (content) {
        return content;
      }
    },
  };

  function process() {
    const rootFileName = rootFileNames[0];
    // TODO: handle all
    const root = service.getCurrentSourceFile(rootFileName)!;
    // const fileNames = options.fileNames.filter((fname) => !fname.endsWith(".d.ts"));
    const checker = service.getProgram()!.getTypeChecker();
    const targetsFiles = targetFileNames.map((fname) => service.getCurrentSourceFile(fname)!);
    const visited = walkProjectForMangle(checker, root, targetsFiles);
    const actions = targetsFiles.flatMap((file) => getMangleActionsForFile(checker, visited, file));
    const renames = expandToSafeBatchRenameLocations(service.findRenameLocations, actions);
    const changes = getRenamedFileChanges(renames, service.readSnapshotContent, normalizePath);
    for (const change of changes) {
      service.writeSnapshotContent(change.fileName, change.content);
    }
  }
}