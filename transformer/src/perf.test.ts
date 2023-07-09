import "./__tests/globals";
import { rollup } from "rollup";
import { test } from "vitest";
import { getPlugin } from "./withRollup";
import path from "node:path";
import fs from "node:fs";
import terser from "@rollup/plugin-terser";
import ts from "rollup-plugin-ts";

async function compareBuildSize(projectPath: string) {
  const opted = await buildWithOptimizer(projectPath);
  const normal = await buildNormal(projectPath);
  // console.log("opt", opted);
  // console.log("nor", normal);
  console.log({
    target: projectPath,
    optedSize: opted.length,
    normalSize: normal.length,
    delta: opted.length - normal.length,
  });

  async function buildWithOptimizer(projectPath: string) {
    const inputPath = path.join(projectPath, "index.ts");

    const bundle = await rollup({
      input: inputPath,
      external: ["node:path"],
      plugins: [
        // plugins
        getPlugin({ projectPath }),
        terser(),
      ],
    });
    const { output } = await bundle.generate({
      format: "esm",
    });
    // expect(output[0].code).toEqualFormatted(expected);
    return output[0].code;
  }

  async function buildNormal(projectPath: string) {
    const inputPath = path.join(projectPath, "index.ts");

    const bundle = await rollup({
      input: inputPath,
      external: ["node:path"],
      plugins: [
        ts({
          transpileOnly: true,
          // wip
        }),
        terser({}),
      ],
    });

    const { output } = await bundle.generate({
      format: "esm",
    });
    return output[0].code;
  }
}

if (process.env.PERF) {
  // require tslib
  const skipList: string[] = [];
  const cases = fs
    .readdirSync(path.join(__dirname, "./__fixtures"))
    .filter((x) => x.startsWith("case"))
    .filter((caseName) => {
      return !skipList.includes(caseName);
    });
  for (const caseName of cases) {
    test(`rollup plugin #${caseName}`, async () => {
      const __dirname = path.dirname(new URL(import.meta.url).pathname);
      const projectPath = path.join(__dirname, "./__fixtures", caseName);
      await compareBuildSize(projectPath);
    });
  }
} else {
  test.skip("perf requires PERF=1 ", () => {
    // nothing default
  });
}