import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface MapAssociation {
  mapFile: string;
  /** Basename of the JS chunk whose frames this map symbolicates. */
  fileName: string;
}

/**
 * Pair every source map under dir with the JS chunk it belongs to by reading
 * each chunk's `//# sourceMappingURL=` comment. Chunks and maps whose names
 * align (vite, esbuild, webpack) resolve trivially; Turbopack (Next 16)
 * chunks reference maps with unrelated basenames, and hidden-map builds have
 * maps with no referencing chunk at all (fallback: strip ".map").
 */
export async function associateMaps(dir: string): Promise<MapAssociation[]> {
  const { jsFiles, mapFiles } = await findBuildFiles(dir);
  const associations = new Map<string, MapAssociation>(); // key: mapFile + fileName
  const referencedMaps = new Set<string>();
  for (const jsFile of jsFiles) {
    const contents = await readFile(jsFile, "utf8");
    // Last occurrence wins, matching browser behavior for repeated comments.
    const matches = [...contents.matchAll(/\/\/[#@] sourceMappingURL=([^\s'"]+)/g)];
    const reference = matches[matches.length - 1]?.[1];
    if (!reference || reference.startsWith("data:")) continue;
    const mapFile = join(dirname(jsFile), decodeURIComponent(reference));
    if (!mapFiles.includes(mapFile)) continue;
    const fileName = basename(jsFile);
    referencedMaps.add(mapFile);
    associations.set(`${mapFile}\u0000${fileName}`, { mapFile, fileName });
  }
  for (const mapFile of mapFiles) {
    if (referencedMaps.has(mapFile)) continue;
    associations.set(`${mapFile}\u0000`, {
      mapFile,
      fileName: basename(mapFile).replace(/\.map$/, ""),
    });
  }
  return [...associations.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

async function findBuildFiles(dir: string): Promise<{ jsFiles: string[]; mapFiles: string[] }> {
  const jsFiles: string[] = [];
  const mapFiles: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`Cannot read directory ${dir}.`);
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      const nested = await findBuildFiles(fullPath);
      jsFiles.push(...nested.jsFiles);
      mapFiles.push(...nested.mapFiles);
    } else if (entry.isFile() && entry.name.endsWith(".map")) {
      mapFiles.push(fullPath);
    } else if (entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name)) {
      jsFiles.push(fullPath);
    }
  }
  return { jsFiles: jsFiles.sort(), mapFiles: mapFiles.sort() };
}
