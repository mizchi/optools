import { getRenamedFileChanges } from "./transformer/renamer";
import { Plugin } from "rollup";
import ts from "typescript";
import path from "node:path";
import { expandToSafeBatchRenameLocations, walkProjectForMangle, getMangleActionsForFile } from "./transformer/mangler";
import { createIncrementalLanguageService, createIncrementalLanguageServiceHost } from "./typescript/services";

export function getPlugin({ projectPath }: { projectPath: string }) {
  const tsconfig = ts.readConfigFile(path.join(projectPath, "tsconfig.json"), ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(tsconfig.config, ts.sys, projectPath);
  const registory = ts.createDocumentRegistry();
  const host = createIncrementalLanguageServiceHost(projectPath, options.fileNames, options.options);
  const service = createIncrementalLanguageService(host, registory);
  const normalizePath = (fname: string) => {
    if (fname.startsWith("/")) {
      return fname;
    }
    const root = projectPath;
    return path.join(root, fname); //
  };
  const checker = service.getProgram()!.getTypeChecker();
  const root = service.getProgram()!.getSourceFile("index.ts")!;
  const fileNames = service
    .getProgram()!
    .getRootFileNames()
    .filter((fname) => !fname.endsWith(".d.ts"));

  const targetsFiles = fileNames.map((fname) => service.getCurrentSourceFile(fname)!);

  const visited = walkProjectForMangle(checker, root, targetsFiles);
  const actions = targetsFiles.flatMap((file) => getMangleActionsForFile(checker, visited, file));
  const renames = expandToSafeBatchRenameLocations(service.findRenameLocations, actions);
  const changes = getRenamedFileChanges(renames, service.readSnapshotContent, normalizePath);
  for (const change of changes) {
    service.writeSnapshotContent(change.fileName, change.content);
  }

  const searchingExtensions = ["", ".ts", ".tsx", ".js", ".jsx", ".json"];

  const plugin: Plugin = {
    name: "test",
    options(options) {
      // console.log("on-options", options);
    },
    resolveId(id, importer) {
      let resolvedId = importer ? path.resolve(path.dirname(importer), id) : id;
      for (const ext of searchingExtensions) {
        const exist = host.fileExists(resolvedId + ext);
        if (exist) {
          return resolvedId + ext;
        }
      }
    },
    load(id) {
      // console.log("[load]", id, content);
      const content = service.readSnapshotContent(id);
      if (content) {
        return content;
      }
    },
    transform(code, id) {
      const nid = normalizePath(id);
      if (host.fileExists(nid)) {
        const isTsx = nid.endsWith(".tsx");
        // const result = (nid, code);
        const result = ts.transpileModule(code, {
          fileName: nid,
          compilerOptions: {
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: true,
            jsx: isTsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.None,
            noImplicitAny: true,
          },
        });
        return {
          code: result.outputText,
          map: result.sourceMapText,
        };
      }
    },
  };
  return plugin;
}
