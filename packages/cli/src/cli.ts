#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "0.6.0";
const CONFIG_DIR = join(homedir(), ".error-mom");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  server: string;
  adminToken: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  ingestKey?: string;
}

const program = new Command()
  .name("error-mom")
  .description("Query and operate a self-hosted Error Mom incident desk")
  .version(VERSION);

program
  .command("login")
  .description("Save the URL and private admin token for one Error Mom deployment")
  .argument("<server>", "Error Mom server URL")
  .requiredOption("--token <token>", "ERROR_MOM_ADMIN_TOKEN value")
  .action(async (server: string, options: { token: string }) => {
    const normalized = normalizeServer(server);
    await request(normalized, options.token, "/api/v1/projects");
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    await writeFile(
      CONFIG_FILE,
      `${JSON.stringify({ server: normalized, adminToken: options.token }, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
    await chmod(CONFIG_FILE, 0o600);
    print({ connected: true, server: normalized, configFile: CONFIG_FILE });
  });

program
  .command("projects")
  .description("List every project and unresolved issue count")
  .action(async () => {
    const config = await loadConfig();
    print(await request(config.server, config.adminToken, "/api/v1/projects"));
  });

program
  .command("issues")
  .description("List compact issue summaries; unresolved issues are returned by default")
  .option("--project <id>", "Filter by project ID")
  .option("--status <status>", "unresolved, open, regressed, resolved, or all", "unresolved")
  .action(async (options: { project?: string; status: string }) => {
    const config = await loadConfig();
    const query = new URLSearchParams({ status: options.status });
    if (options.project) query.set("projectId", options.project);
    print(await request(config.server, config.adminToken, `/api/v1/issues?${query}`));
  });

program
  .command("inspect")
  .description("Fetch one issue with sampled stack traces, breadcrumbs, tags, and release spread")
  .argument("<issue-id>")
  .option("--samples <count>", "Representative samples to fetch (1-20)", "1")
  .action(async (issueId: string, options: { samples: string }) => {
    const config = await loadConfig();
    const samples = Math.min(Math.max(Number(options.samples) || 1, 1), 20);
    print(
      await request(
        config.server,
        config.adminToken,
        `/api/v1/issues/${encodeURIComponent(issueId)}?samples=${samples}`,
      ),
    );
  });

program
  .command("resolve")
  .description("Resolve one issue and record the release containing the fix")
  .argument("<issue-id>")
  .requiredOption("--release <release>", "Release containing the fix")
  .action(async (issueId: string, options: { release: string }) => {
    const config = await loadConfig();
    print(
      await request(
        config.server,
        config.adminToken,
        `/api/v1/issues/${encodeURIComponent(issueId)}`,
        {
          method: "PATCH",
          body: { status: "resolved", fixedInRelease: options.release },
        },
      ),
    );
  });

program
  .command("delete-project")
  .description("Permanently delete one project and all of its issues and history")
  .argument("<project-id>")
  .action(async (projectId: string) => {
    const config = await loadConfig();
    print(
      await request(
        config.server,
        config.adminToken,
        `/api/v1/projects/${encodeURIComponent(projectId)}`,
        { method: "DELETE" },
      ),
    );
  });

program
  .command("doctor")
  .description("Verify collector health, credentials, and optional project ingestion")
  .option("--project-key <key>", "Send and verify a synthetic event with this write-only key")
  .option(
    "--symbolication",
    "Round-trip a synthetic minified stack through the server's symbolication engine",
  )
  .action(async (options: { projectKey?: string; symbolication?: boolean }) => {
    const config = await loadConfig();
    const health = await request(config.server, undefined, "/api/health");
    const projects = await request(config.server, config.adminToken, "/api/v1/projects");
    let ingestion: unknown = "not tested";
    if (options.projectKey) {
      ingestion = await request(config.server, undefined, "/api/v1/events", {
        headers: { "x-error-mom-key": options.projectKey },
        body: {
          events: [syntheticEvent()],
          sdk: { name: "error-mom-cli-doctor", version: VERSION },
        },
      });
    }
    let symbolication: unknown = "not tested";
    if (options.symbolication) {
      // Inline dry-run: the map travels in the request, nothing is stored,
      // so this cannot pollute real releases or evict uploaded maps.
      const result = (await request(config.server, config.adminToken, "/api/v1/sourcemaps/check", {
        body: {
          stack:
            "ErrorMomDoctor: synthetic minified stack\n    at t.xyz (https://app.example/assets/doctor-abc.js:1:11)",
          fileName: "doctor-abc.js",
          map: {
            version: 3,
            file: "doctor-abc.js",
            sources: ["src/doctor-fixture.ts"],
            names: ["doctorBoom"],
            mappings: "UAIEA",
          },
        },
      })) as { symbolicated?: boolean; stack?: string };
      const roundTripped =
        result.symbolicated === true &&
        typeof result.stack === "string" &&
        result.stack.includes("doctorBoom (src/doctor-fixture.ts:5:3)");
      if (!roundTripped) {
        throw new Error(
          `Symbolication round-trip failed: expected the synthetic frame to rewrite to src/doctor-fixture.ts:5:3, got ${JSON.stringify(result)}`,
        );
      }
      symbolication = { verified: true, rewrittenFrame: "doctorBoom (src/doctor-fixture.ts:5:3)" };
    }
    print({ healthy: true, health, projects, ingestion, symbolication });
  });

program
  .command("init")
  .description("Create/select a project, install the SDK, and generate framework-aware setup")
  .option("--name <name>", "Project name")
  .option("--project <slug>", "Use an existing project slug")
  .option("--skip-install", "Generate setup without invoking the package manager")
  .action(async (options: { name?: string; project?: string; skipInstall?: boolean }) => {
    const config = await loadConfig();
    const packageJson = await readPackageJson(process.cwd());
    const name =
      options.name ??
      (typeof packageJson.name === "string" ? packageJson.name : basename(process.cwd()));
    const projectResponse = (await request(
      config.server,
      config.adminToken,
      "/api/v1/projects",
    )) as {
      projects: Project[];
    };
    let project = options.project
      ? projectResponse.projects.find((candidate) => candidate.slug === options.project)
      : projectResponse.projects.find(
          (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
        );
    if (!project) {
      const created = (await request(config.server, config.adminToken, "/api/v1/projects", {
        body: { name },
      })) as { project: Project };
      project = created.project;
    }
    if (!project.ingestKey) {
      const createdKey = (await request(
        config.server,
        config.adminToken,
        `/api/v1/projects/${encodeURIComponent(project.id)}/ingest-keys`,
        { body: {} },
      )) as { ingestKey: string };
      project.ingestKey = createdKey.ingestKey;
    }

    const framework = detectFramework(packageJson);
    if (!options.skipInstall) installSdk(detectPackageManager(process.cwd()));
    const setupPath = await writeSetup(framework, config.server, project.ingestKey);
    print({
      installed: !options.skipInstall,
      project: { id: project.id, name: project.name, slug: project.slug },
      framework: framework.id,
      setupFile: setupPath,
      projectKey: project.ingestKey,
      verified: false,
      wiring: framework.wiring,
      nextAction: `Wire it up: ${framework.wiring} If the app routes caught errors through a central handler or error-broadcast function, call errorMom.captureError(err) inside it — that is where framework-caught and LLM errors surface. For handlers where a framework catches errors itself (queue/cron jobs, webhooks, MCP tools), wrap each with errorMom.wrap(fn, { culprit: "<name>" }). The setup file has the write-only project key baked in (safe to commit; ERROR_MOM_* env vars override when set), so production builds report without any configuration. Then run error-mom doctor --project-key ${project.ingestKey}.`,
    });
  });

program
  .command("sourcemaps")
  .description("Upload production source maps so minified stacks symbolicate on ingest")
  .argument("<dir>", "Build output directory containing *.map files (e.g. dist)")
  .requiredOption("--release <release>", "Release the maps belong to (must match the SDK release)")
  .requiredOption("--project <id-or-slug>", "Project id or slug")
  .action(async (dir: string, options: { release: string; project: string }) => {
    const config = await loadConfig();
    const mapFiles = await findMapFiles(dir);
    if (mapFiles.length === 0) {
      throw new Error(`No .map files found under ${dir}. Build with source maps enabled first.`);
    }
    const uploaded: string[] = [];
    const skipped: Array<{ file: string; reason: string }> = [];
    const warnings: string[] = [];
    for (const mapFile of mapFiles) {
      const info = await stat(mapFile);
      if (info.size > 20 * 1024 * 1024) {
        skipped.push({ file: mapFile, reason: "larger than 20 MB" });
        continue;
      }
      let map: unknown;
      try {
        map = JSON.parse(await readFile(mapFile, "utf8"));
      } catch {
        skipped.push({ file: mapFile, reason: "not valid JSON" });
        continue;
      }
      // "app-abc123.js.map" symbolicates frames from "app-abc123.js".
      const fileName = basename(mapFile).replace(/\.map$/, "");
      const sourcesContent = (map as { sourcesContent?: unknown[] }).sourcesContent;
      if (!Array.isArray(sourcesContent) || sourcesContent.every((entry) => entry == null)) {
        warnings.push(
          `${fileName}: no sourcesContent — frames still symbolicate to file:line, but agents cannot read the original code from the map. Enable it in the bundler if you want richer context.`,
        );
      }
      try {
        await request(config.server, config.adminToken, "/api/v1/sourcemaps", {
          body: { projectId: options.project, release: options.release, fileName, map },
        });
        uploaded.push(fileName);
      } catch (error) {
        skipped.push({
          file: mapFile,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    warnings.push(...(await releaseMismatchWarning(config, options.project, options.release)));
    print({ release: options.release, project: options.project, uploaded, skipped, warnings });
  });

program
  .command("mcp")
  .description("Run Error Mom tools over MCP stdio for coding agents")
  .action(async () => {
    await runMcpServer();
  });

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }, null, 2)}\n`,
  );
  process.exitCode = 1;
});

async function runMcpServer(): Promise<void> {
  const config = await loadConfig();
  const server = new McpServer({ name: "error-mom", version: VERSION });
  server.registerTool(
    "list_projects",
    { description: "List Error Mom projects and unresolved issue counts", inputSchema: {} },
    async () => toolResult(await request(config.server, config.adminToken, "/api/v1/projects")),
  );
  server.registerTool(
    "list_issues",
    {
      description:
        "List compact issues. Defaults to unresolved so fixed work does not consume context.",
      inputSchema: {
        projectId: z.string().optional(),
        status: z
          .enum(["unresolved", "open", "regressed", "resolved", "all"])
          .default("unresolved"),
      },
    },
    async ({ projectId, status }) => {
      const query = new URLSearchParams({ status });
      if (projectId) query.set("projectId", projectId);
      return toolResult(await request(config.server, config.adminToken, `/api/v1/issues?${query}`));
    },
  );
  server.registerTool(
    "get_issue",
    {
      description:
        "Inspect one issue with representative evidence. Fetch one sample by default to protect context.",
      inputSchema: {
        issueId: z.string().min(1),
        samples: z.number().int().min(1).max(20).default(1),
      },
    },
    async ({ issueId, samples }) =>
      toolResult(
        await request(
          config.server,
          config.adminToken,
          `/api/v1/issues/${encodeURIComponent(issueId)}?samples=${samples}`,
        ),
      ),
  );
  server.registerTool(
    "resolve_issue",
    {
      description:
        "Mark an issue fixed in a release. A recurrence in that release reopens it as a regression.",
      inputSchema: { issueId: z.string().min(1), fixedInRelease: z.string().min(1) },
    },
    async ({ issueId, fixedInRelease }) =>
      toolResult(
        await request(
          config.server,
          config.adminToken,
          `/api/v1/issues/${encodeURIComponent(issueId)}`,
          {
            method: "PATCH",
            body: { status: "resolved", fixedInRelease },
          },
        ),
      ),
  );
  server.registerTool(
    "check_symbolication",
    {
      description:
        "Dry-run a minified stack against a project's uploaded source maps to verify frames rewrite to original file:line. Nothing is stored.",
      inputSchema: {
        projectId: z.string().min(1).describe("Project id or slug"),
        release: z.string().min(1),
        stack: z.string().min(1).max(50_000),
      },
    },
    async ({ projectId, release, stack }) =>
      toolResult(
        await request(config.server, config.adminToken, "/api/v1/sourcemaps/check", {
          body: { projectId, release, stack },
        }),
      ),
  );
  server.registerTool(
    "delete_project",
    {
      description:
        "Permanently delete a project and all of its issues, samples, and history. Irreversible.",
      inputSchema: { projectId: z.string().min(1) },
    },
    async ({ projectId }) =>
      toolResult(
        await request(
          config.server,
          config.adminToken,
          `/api/v1/projects/${encodeURIComponent(projectId)}`,
          { method: "DELETE" },
        ),
      ),
  );
  await server.connect(new StdioServerTransport());
}

function toolResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function loadConfig(): Promise<Config> {
  const fromEnvironment = {
    server: process.env.ERROR_MOM_SERVER,
    adminToken: process.env.ERROR_MOM_ADMIN_TOKEN,
  };
  if (fromEnvironment.server && fromEnvironment.adminToken) {
    return {
      server: normalizeServer(fromEnvironment.server),
      adminToken: fromEnvironment.adminToken,
    };
  }
  try {
    const config = JSON.parse(await readFile(CONFIG_FILE, "utf8")) as Partial<Config>;
    if (!config.server || !config.adminToken) throw new Error("Incomplete config");
    return { server: normalizeServer(config.server), adminToken: config.adminToken };
  } catch {
    throw new Error(
      `Run error-mom login <server> --token <token>, or set ERROR_MOM_SERVER and ERROR_MOM_ADMIN_TOKEN.`,
    );
  }
}

async function request(
  server: string,
  token: string | undefined,
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<unknown> {
  const response = await fetch(`${normalizeServer(server)}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const result = (await response
    .json()
    .catch(() => ({ error: { message: response.statusText } }))) as {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(result.error?.message ?? `Error Mom returned HTTP ${response.status}`);
  return result;
}

async function readPackageJson(cwd: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Run error-mom init from a JavaScript or TypeScript project containing package.json.",
    );
  }
}

// Env style decides variable prefix and which SDK entry the setup file uses.
// "vite" covers everything Vite-bundled (import.meta.env.VITE_*), "node"
// covers plain process.env servers, "next" is NEXT_PUBLIC_ plus codegen.
interface FrameworkInfo {
  id: string;
  envStyle: "next" | "vite" | "node";
  // Framework-specific wiring instructions for the coding agent running init,
  // each pointing at the framework's official error hook instead of guessing.
  wiring: string;
}

const FRAMEWORKS: Array<[dependency: string, info: FrameworkInfo]> = [
  [
    "next",
    {
      id: "next",
      envStyle: "next",
      wiring:
        "Import the setup file from the root layout for client errors; the generated instrumentation.ts already reports server errors (API routes, SSR, server actions).",
    },
  ],
  [
    "@tauri-apps/api",
    {
      id: "tauri",
      envStyle: "vite",
      wiring:
        "Import the setup file first in the webview entry (main.tsx or equivalent). If the app spawns Node sidecar processes, also call initErrorMom from @kenkaiiii/error-mom/node at each sidecar entry so backend/LLM errors are reported too. Rust-side panics are not captured.",
    },
  ],
  [
    "electron",
    {
      id: "electron",
      envStyle: "node",
      wiring:
        "Call initErrorMom from @kenkaiiii/error-mom/node at the TOP of the main process entry, and import @kenkaiiii/error-mom (browser build) first in each renderer entry. Both report to the same project.",
    },
  ],
  [
    "astro",
    {
      id: "astro",
      envStyle: "vite",
      wiring:
        "Load the setup file as a client script in the base layout so it runs on every page. For SSR/API routes, add src/middleware.ts that wraps next() with errorMom.wrap using @kenkaiiii/error-mom/node.",
    },
  ],
  [
    "@sveltejs/kit",
    {
      id: "sveltekit",
      envStyle: "vite",
      wiring:
        "Import the setup file in hooks.client.ts and export handleError from BOTH hooks.client.ts and hooks.server.ts calling errorMom.captureError(error); the server hook uses @kenkaiiii/error-mom/node. SvelteKit catches load/endpoint errors, so handleError is its official reporting hook.",
    },
  ],
  [
    "nuxt",
    {
      id: "nuxt",
      envStyle: "vite",
      wiring:
        "Create a client plugin (plugins/error-mom.client.ts) importing the setup file, and a nitro plugin hooking 'error' with @kenkaiiii/error-mom/node for server-side errors.",
    },
  ],
  [
    "@remix-run/react",
    {
      id: "remix",
      envStyle: "node",
      wiring:
        "Import the setup file in entry.client.tsx, and export handleError from entry.server.tsx calling errorMom.captureError(error). Remix catches loader/action errors and handleError is its official reporting hook.",
    },
  ],
  [
    "@angular/core",
    {
      id: "angular",
      envStyle: "node",
      wiring:
        "Import the setup file in main.ts and provide a custom ErrorHandler that calls errorMom.captureError(error). Angular catches component errors in its own handler.",
    },
  ],
  [
    "express",
    {
      id: "express",
      envStyle: "node",
      wiring:
        "Import the setup file at the TOP of the server entry, and add a final error middleware: (err, req, res, next) => { errorMom.captureError(err, { culprit: `${req.method} ${req.path}` }); next(err); }. Express catches route errors, so the middleware is where they surface.",
    },
  ],
  [
    "fastify",
    {
      id: "fastify",
      envStyle: "node",
      wiring:
        "Import the setup file at the TOP of the server entry, and call errorMom.captureError(error) inside setErrorHandler before replying. Fastify catches handler errors there.",
    },
  ],
  [
    "hono",
    {
      id: "hono",
      envStyle: "node",
      wiring:
        "Import the setup file at the TOP of the server entry, and call errorMom.captureError(err) inside app.onError. Hono catches handler errors there.",
    },
  ],
  [
    "@nestjs/core",
    {
      id: "nestjs",
      envStyle: "node",
      wiring:
        "Import the setup file at the TOP of main.ts, and add a global exception filter that calls errorMom.captureError(exception) before delegating to the base filter.",
    },
  ],
  [
    "vite",
    {
      id: "vite",
      envStyle: "vite",
      wiring: "Import the setup file first in the app entry (main.tsx or equivalent).",
    },
  ],
];

function detectFramework(packageJson: Record<string, unknown>): FrameworkInfo {
  const dependencies = {
    ...((packageJson.dependencies as Record<string, string> | undefined) ?? {}),
    ...((packageJson.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  for (const [dependency, info] of FRAMEWORKS) {
    if (dependencies[dependency]) return info;
  }
  return {
    id: "node",
    envStyle: "node",
    wiring: "Import the setup file at the TOP of the main entry point, before anything else.",
  };
}

function detectPackageManager(cwd: string): "pnpm" | "yarn" | "npm" {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

function installSdk(packageManager: "pnpm" | "yarn" | "npm"): void {
  const argumentsByManager = {
    pnpm: ["add", "@kenkaiiii/error-mom"],
    yarn: ["add", "@kenkaiiii/error-mom"],
    npm: ["install", "@kenkaiiii/error-mom"],
  };
  execFileSync(packageManager, argumentsByManager[packageManager], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

async function writeSetup(
  framework: FrameworkInfo,
  server: string,
  ingestKey: string,
): Promise<string> {
  const sourceDirectory = existsSync(join(process.cwd(), "src")) ? "src" : ".";
  const relativePath = join(sourceDirectory, "error-mom.ts");
  if (framework.id === "next") await writeNextInstrumentation(sourceDirectory, server, ingestKey);
  const environment =
    framework.envStyle === "next"
      ? "process.env.NEXT_PUBLIC_"
      : framework.envStyle === "vite"
        ? "import.meta.env.VITE_"
        : "process.env.";
  const moduleName =
    framework.envStyle === "node" ? "@kenkaiiii/error-mom/node" : "@kenkaiiii/error-mom";
  // The ingest key is baked into the committed setup file on purpose — the
  // Sentry DSN model. It is WRITE-ONLY: it can submit error events and
  // nothing else, so shipping it in a build or committing it is safe by the
  // collector's security model. Without this, production/CI builds (which
  // never see the gitignored .env.local) silently ship with tracking off.
  const contents = `${framework.id === "next" ? '"use client";\n\n' : ""}import { initErrorMom } from "${moduleName}";\n\n// The project key is write-only (submit errors, read nothing), so committing\n// it is safe — same model as a Sentry DSN. Env vars override when present.\nconst server = ${environment}ERROR_MOM_SERVER ?? ${JSON.stringify(server)};\nconst projectKey = ${environment}ERROR_MOM_PROJECT_KEY ?? ${JSON.stringify(ingestKey)};\nconst release = ${environment}ERROR_MOM_RELEASE;\n\nexport const errorMom = initErrorMom({\n  server,\n  projectKey,\n  environment: ${environment}ERROR_MOM_ENVIRONMENT ?? "production",\n  ...(release ? { release } : {}),\n});\n`;
  await writeFile(join(process.cwd(), relativePath), contents);
  return relativePath;
}

// Next.js catches server-side errors (API routes, SSR, server actions) to
// render a 500, so they never reach process-level handlers. onRequestError in
// instrumentation.ts is Next's official reporting hook for exactly this.
async function writeNextInstrumentation(
  sourceDirectory: string,
  configuredServer: string,
  ingestKey: string,
): Promise<void> {
  const file = join(process.cwd(), sourceDirectory, "instrumentation.ts");
  if (existsSync(file)) return; // Never clobber an app's existing instrumentation.
  const contents = `import type { Instrumentation } from "next";

// Reports server-side errors (API routes, SSR, server actions, middleware)
// that Next.js catches before they can become uncaught exceptions.
// The baked-in project key is write-only, so committing it is safe.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const server = process.env.NEXT_PUBLIC_ERROR_MOM_SERVER ?? ${JSON.stringify(configuredServer)};
  const projectKey = process.env.NEXT_PUBLIC_ERROR_MOM_PROJECT_KEY ?? ${JSON.stringify(ingestKey)};
  const { initErrorMom } = await import("@kenkaiiii/error-mom/node");
  initErrorMom({
    server,
    projectKey,
    environment: process.env.NEXT_PUBLIC_ERROR_MOM_ENVIRONMENT ?? "production",
  }).captureError(error, {
    culprit: \`\${request.method} \${request.path}\`,
    tags: { routerKind: context.routerKind, routeType: context.routeType, runtime: "server" },
  });
};
`;
  await writeFile(file, contents);
}

function syntheticEvent() {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: "error",
    error: {
      name: "ErrorMomDoctor",
      message: "Synthetic setup verification",
      stack: "ErrorMomDoctor: Synthetic setup verification\n    at error-mom doctor:1:1",
    },
    environment: "setup",
    release: VERSION,
    platform: process.platform,
    runtime: `node ${process.version}`,
    culprit: "error-mom doctor",
    breadcrumbs: [],
    tags: { synthetic: "true" },
    context: {},
  };
}

// The silent misconfiguration users actually hit: uploading maps under a
// release string the SDK never reports. Cross-check against recent issues.
async function releaseMismatchWarning(
  config: Config,
  projectIdOrSlug: string,
  release: string,
): Promise<string[]> {
  try {
    const { projects } = (await request(config.server, config.adminToken, "/api/v1/projects")) as {
      projects: Project[];
    };
    const project = projects.find(
      (candidate) => candidate.id === projectIdOrSlug || candidate.slug === projectIdOrSlug,
    );
    if (!project) return [];
    const { issues } = (await request(
      config.server,
      config.adminToken,
      `/api/v1/issues?${new URLSearchParams({ projectId: project.id, status: "all" })}`,
    )) as { issues: Array<{ latestRelease: string | null }> };
    const seenReleases = [
      ...new Set(issues.map((issue) => issue.latestRelease).filter((value) => value !== null)),
    ];
    if (seenReleases.length > 0 && !seenReleases.includes(release)) {
      return [
        `release "${release}" has not been reported by any event yet (recent releases: ${seenReleases
          .slice(0, 5)
          .join(", ")}). Maps only apply when the SDK's release matches --release exactly.`,
      ];
    }
    return [];
  } catch {
    return []; // A warning helper must never fail the upload.
  }
}

async function findMapFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`Cannot read directory ${dir}.`);
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      found.push(...(await findMapFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".map")) {
      found.push(fullPath);
    }
  }
  return found.sort();
}

function normalizeServer(server: string): string {
  return server.replace(/\/$/, "");
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
