import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { associateMaps } from "./sourcemap-files.js";

let workDir: string;

async function scaffold(files: Record<string, string>): Promise<string> {
  workDir = await mkdtemp(join(tmpdir(), "em-associate-"));
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = join(workDir, relativePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, contents);
  }
  return workDir;
}

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("associateMaps", () => {
  it("pairs aligned names via sourceMappingURL (vite/esbuild/webpack style)", async () => {
    const dir = await scaffold({
      "assets/app-abc.js": "x;\n//# sourceMappingURL=app-abc.js.map",
      "assets/app-abc.js.map": "{}",
    });
    expect(await associateMaps(dir)).toEqual([
      { mapFile: join(dir, "assets/app-abc.js.map"), fileName: "app-abc.js" },
    ]);
  });

  it("follows mismatched-basename references (Next 16/Turbopack style)", async () => {
    const dir = await scaffold({
      "chunks/3afd5e0fkfnru.js": "x;\n//# sourceMappingURL=0mzggd_frezrj.js.map",
      "chunks/0mzggd_frezrj.js.map": "{}",
    });
    expect(await associateMaps(dir)).toEqual([
      { mapFile: join(dir, "chunks/0mzggd_frezrj.js.map"), fileName: "3afd5e0fkfnru.js" },
    ]);
  });

  it("falls back to name-stripping for orphan maps (hidden-map builds)", async () => {
    const dir = await scaffold({
      "dist/hidden-xyz.js": "x; // no sourceMappingURL comment",
      "dist/hidden-xyz.js.map": "{}",
    });
    expect(await associateMaps(dir)).toEqual([
      { mapFile: join(dir, "dist/hidden-xyz.js.map"), fileName: "hidden-xyz.js" },
    ]);
  });

  it("ignores data: URLs and references to maps that do not exist", async () => {
    const dir = await scaffold({
      "a.js": "x;\n//# sourceMappingURL=data:application/json;base64,e30=",
      "b.js": "x;\n//# sourceMappingURL=missing.js.map",
    });
    expect(await associateMaps(dir)).toEqual([]);
  });

  it("uses the last sourceMappingURL comment, like browsers do", async () => {
    const dir = await scaffold({
      "app.js": "//# sourceMappingURL=old.js.map\nx;\n//# sourceMappingURL=new.js.map",
      "old.js.map": "{}",
      "new.js.map": "{}",
    });
    const associations = await associateMaps(dir);
    expect(associations).toContainEqual({ mapFile: join(dir, "new.js.map"), fileName: "app.js" });
    // old.js.map is unreferenced -> orphan fallback keeps it uploadable.
    expect(associations).toContainEqual({ mapFile: join(dir, "old.js.map"), fileName: "old.js" });
  });

  it("skips node_modules and handles one map shared by several chunks", async () => {
    const dir = await scaffold({
      "one.js": "x;\n//# sourceMappingURL=shared.js.map",
      "two.js": "x;\n//# sourceMappingURL=shared.js.map",
      "shared.js.map": "{}",
      "node_modules/dep/ignored.js.map": "{}",
    });
    const associations = await associateMaps(dir);
    expect(associations.map((entry) => entry.fileName).sort()).toEqual(["one.js", "two.js"]);
  });
});
