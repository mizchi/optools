import "./globals";
import path from "node:path";
import { test } from "vitest";
import { assertRollupWithFixture } from "./testUtils";

test("rollup #case20-objectRest", async () => {
  await assertRollupWithFixture(path.join(__dirname, "../fixtures/case20-objectRest"));
});
test("rollup #case21-xxx", async () => {
  await assertRollupWithFixture(path.join(__dirname, "../fixtures/case21-xxx"));
});