import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  buildTraceMap,
  parseFrame,
  stackFileBaseName,
  symbolicateStack,
  symbolicateWithTraceMaps,
} from "./symbolicate";

// One mapping: generated 1:11 -> src/main.ts:5:3, name "boom".
const TINY_MAP = {
  version: 3,
  file: "app-abc.js",
  sources: ["src/main.ts"],
  names: ["boom"],
  mappings: "UAIEA",
};

function traceMaps(fileName = "app-abc.js", map: unknown = TINY_MAP) {
  const traceMap = buildTraceMap(map);
  if (!traceMap) throw new Error("fixture map failed to parse");
  return new Map([[fileName, traceMap]]);
}

/** Fake postgres tag returning fixed rows — symbolicateStack issues one query. */
function fakeSql(rows: Array<{ file_name: string; map: unknown }>): Sql {
  return (() => Promise.resolve(rows)) as unknown as Sql;
}

describe("parseFrame dialects", () => {
  it("parses V8 named frames", () => {
    expect(parseFrame("    at t.xyz (https://x/app-abc.js:1:11)")).toMatchObject({
      functionName: "t.xyz",
      file: "https://x/app-abc.js",
      line: 1,
      column: 11,
      style: "v8",
    });
  });

  it("parses V8 anonymous frames", () => {
    expect(parseFrame("    at https://x/app-abc.js:1:11")).toMatchObject({
      functionName: null,
      file: "https://x/app-abc.js",
    });
  });

  it("parses V8 async frames keeping the async prefix in the name", () => {
    expect(parseFrame("    at async t.xyz (https://x/app-abc.js:1:11)")).toMatchObject({
      functionName: "async t.xyz",
    });
  });

  it("parses Firefox/Safari frames with and without a function name", () => {
    expect(parseFrame("xyz@https://x/app-abc.js:1:11")).toMatchObject({
      functionName: "xyz",
      style: "gecko",
    });
    expect(parseFrame("@https://x/app-abc.js:1:11")).toMatchObject({
      functionName: null,
      style: "gecko",
    });
  });

  it("returns null for message lines and garbage", () => {
    expect(parseFrame("TypeError: boom failed")).toBeNull();
    expect(parseFrame("")).toBeNull();
    expect(parseFrame("   at nowhere")).toBeNull();
  });
});

describe("stackFileBaseName", () => {
  it("strips URL paths, query strings, fragments, and windows paths", () => {
    expect(stackFileBaseName("https://x/assets/app-abc.js?v=2#frag")).toBe("app-abc.js");
    expect(stackFileBaseName("file:///tmp/build/out.mjs")).toBe("out.mjs");
    expect(stackFileBaseName("C:\\builds\\dist\\app.js")).toBe("app.js");
    expect(stackFileBaseName("app.js")).toBe("app.js");
  });
});

describe("symbolicateWithTraceMaps", () => {
  it("rewrites matched V8 frames to original fn/file/line", () => {
    const result = symbolicateWithTraceMaps(
      traceMaps(),
      "TypeError: boom failed\n    at t.xyz (https://x/app-abc.js:1:11)",
    );
    expect(result.symbolicated).toBe(true);
    expect(result.stack).toBe("TypeError: boom failed\n    at boom (src/main.ts:5:3)");
  });

  it("rewrites gecko frames in gecko style", () => {
    const result = symbolicateWithTraceMaps(traceMaps(), "t.xyz@https://x/app-abc.js:1:11");
    expect(result.stack).toBe("boom@src/main.ts:5:3");
  });

  it("supports sectioned (index) maps", () => {
    const sectioned = {
      version: 3,
      sections: [{ offset: { line: 0, column: 0 }, map: TINY_MAP }],
    };
    const result = symbolicateWithTraceMaps(
      traceMaps("app-abc.js", sectioned),
      "    at t.xyz (https://x/app-abc.js:1:11)",
    );
    expect(result.stack).toContain("at boom (src/main.ts:5:3)");
  });

  it("prefixes sourceRoot on rewritten paths", () => {
    const rooted = { ...TINY_MAP, sourceRoot: "webpack://app/" };
    const result = symbolicateWithTraceMaps(
      traceMaps("app-abc.js", rooted),
      "    at t.xyz (https://x/app-abc.js:1:11)",
    );
    expect(result.stack).toContain("webpack://app/src/main.ts:5:3");
  });

  it("leaves unmatched files, eval frames, and unmapped positions untouched", () => {
    const input = [
      "TypeError: boom failed",
      "    at t.xyz (https://x/other-file.js:1:11)",
      "    at eval (eval at run (https://x/app-abc.js:1:11), <anonymous>:1:1)",
      "    at t.xyz (https://x/app-abc.js:99:9999)",
    ].join("\n");
    const result = symbolicateWithTraceMaps(traceMaps(), input);
    expect(result.stack.split("\n")[1]).toBe("    at t.xyz (https://x/other-file.js:1:11)");
    expect(result.stack.split("\n")[2]).toContain("eval at run");
    // 99:9999 has no mapping in the tiny map — must stay minified.
    expect(result.stack.split("\n")[3]).toBe("    at t.xyz (https://x/app-abc.js:99:9999)");
  });

  it("stops rewriting after 50 frames", () => {
    const frame = "    at t.xyz (https://x/app-abc.js:1:11)";
    const lines = ["TypeError: boom", ...Array.from({ length: 100 }, () => frame)];
    const result = symbolicateWithTraceMaps(traceMaps(), lines.join("\n"));
    const rewritten = result.stack.split("\n");
    expect(rewritten[49]).toContain("src/main.ts");
    expect(rewritten[50]).toBe(frame);
    expect(rewritten).toHaveLength(101);
  });

  it("re-parses its own rewritten frames (round-trip invariant)", () => {
    const result = symbolicateWithTraceMaps(
      traceMaps(),
      "    at t.xyz (https://x/app-abc.js:1:11)",
    );
    expect(parseFrame(result.stack)).toMatchObject({
      functionName: "boom",
      file: "src/main.ts",
      line: 5,
      column: 3,
    });
  });
});

describe("buildTraceMap pathologies", () => {
  it("returns null for corrupt maps instead of throwing", () => {
    expect(buildTraceMap(null)).toBeNull();
    expect(buildTraceMap("not a map")).toBeNull();
    expect(buildTraceMap({ version: 3, mappings: 12345 })).toBeNull();
  });

  it("handles maps without sourcesContent", () => {
    const { sourcesContent: _omitted, ...bare } = { ...TINY_MAP, sourcesContent: ["x"] };
    expect(buildTraceMap(bare)).not.toBeNull();
  });
});

describe("symbolicateStack (DB wrapper)", () => {
  it("returns the input unchanged when the query yields no maps", async () => {
    const stack = "    at t.xyz (https://x/app-abc.js:1:11)";
    const result = await symbolicateStack(fakeSql([]), "p", "1.0.0", stack);
    expect(result).toEqual({ stack, symbolicated: false });
  });

  it("skips the query entirely for stacks without parseable frames", async () => {
    const sql = (() => {
      throw new Error("query must not run");
    }) as unknown as Sql;
    const result = await symbolicateStack(sql, "p", "1.0.0", "TypeError: no frames here");
    expect(result.symbolicated).toBe(false);
  });

  it("survives a throwing database", async () => {
    const sql = (() => Promise.reject(new Error("connection refused"))) as unknown as Sql;
    const stack = "    at t.xyz (https://x/app-abc.js:1:11)";
    const result = await symbolicateStack(sql, "p", "1.0.0", stack);
    expect(result).toEqual({ stack, symbolicated: false });
  });

  it("symbolicates with rows from the database and tolerates corrupt siblings", async () => {
    const sql = fakeSql([
      { file_name: "broken.js", map: { version: 3, mappings: 42 } },
      { file_name: "app-abc.js", map: TINY_MAP },
    ]);
    const result = await symbolicateStack(
      sql,
      "p",
      "1.0.0",
      "    at t.xyz (https://x/app-abc.js:1:11)\n    at q (https://x/broken.js:1:5)",
    );
    expect(result.symbolicated).toBe(true);
    expect(result.stack).toContain("at boom (src/main.ts:5:3)");
    expect(result.stack).toContain("broken.js:1:5");
  });
});

describe("fuzz: hostile input never throws and never loses lines", () => {
  // Deterministic PRNG so failures reproduce.
  function mulberry32(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PIECES = [
    "at ",
    "@",
    "(",
    ")",
    ":",
    "1",
    "99999999999999999999",
    "app-abc.js",
    "https://x/app-abc.js",
    "\t",
    "    ",
    "𝔘𝔫𝔦𝔠𝔬𝔡𝔢",
    "<anonymous>",
    "eval",
    "at t.xyz (https://x/app-abc.js:1:11)",
    "a".repeat(5_000),
    "\\",
    "/",
    "?q=1#f",
  ];

  it("handles 500 random stacks", () => {
    const random = mulberry32(20260719);
    for (let round = 0; round < 500; round += 1) {
      const lineCount = 1 + Math.floor(random() * 80);
      const stack = Array.from({ length: lineCount }, () => {
        const pieceCount = Math.floor(random() * 6);
        return Array.from(
          { length: pieceCount },
          () => PIECES[Math.floor(random() * PIECES.length)],
        ).join("");
      }).join("\n");
      const result = symbolicateWithTraceMaps(traceMaps(), stack);
      expect(result.stack.split("\n")).toHaveLength(stack.split("\n").length);
    }
  });

  it("parseFrame never throws on random single lines", () => {
    const random = mulberry32(42);
    for (let round = 0; round < 2_000; round += 1) {
      const line = Array.from(
        { length: Math.floor(random() * 8) },
        () => PIECES[Math.floor(random() * PIECES.length)],
      ).join("");
      expect(() => parseFrame(line)).not.toThrow();
    }
  });
});
