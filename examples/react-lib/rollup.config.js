import ts from "rollup-plugin-ts";
import terser from "@rollup/plugin-terser";
import analyzed from "./_packelyze-analyzed.json" assert { type: "json" };

export default {
  input: "src/index.tsx",
  output: {
    dir: "dist",
    format: "esm",
  },
  external: ["react", "react/jsx-runtime"],
  plugins: [
    ts(),
    terser({
      compress: false,
      mangle: {
        properties: {
          // builtins: true,
          regex: /^.*$/,
          reserved: analyzed.reserved
        }
      }
    }
  )],
}