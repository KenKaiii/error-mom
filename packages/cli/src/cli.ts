#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "0.1.0";
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
  .command("doctor")
  .description("Verify collector health, credentials, and optional project ingestion")
  .option("--project-key <key>", "Send and verify a synthetic event with this write-only key")
  .action(async (options: { projectKey?: string }) => {
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
    print({ healthy: true, health, projects, ingestion });
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
    const setupPath = await writeSetup(framework);
    await writeFile(
      join(process.cwd(), ".error-mom.json"),
      `${JSON.stringify({ server: config.server, projectId: project.id, projectName: project.name, framework }, null, 2)}\n`,
    );
    await appendEnvironment(framework, config.server, project.ingestKey);
    print({
      installed: !options.skipInstall,
      project: { id: project.id, name: project.name, slug: project.slug },
      framework,
      setupFile: setupPath,
      verified: false,
      nextAction: `Import ${setupPath} from the earliest ${framework} entry point, then run error-mom doctor --project-key <key>.`,
    });
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

function detectFramework(packageJson: Record<string, unknown>): "next" | "vite" | "node" {
  const dependencies = {
    ...((packageJson.dependencies as Record<string, string> | undefined) ?? {}),
    ...((packageJson.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  if (dependencies.next) return "next";
  if (dependencies.vite) return "vite";
  return "node";
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

async function writeSetup(framework: "next" | "vite" | "node"): Promise<string> {
  const sourceDirectory = existsSync(join(process.cwd(), "src")) ? "src" : ".";
  const relativePath = join(sourceDirectory, "error-mom.ts");
  const environment =
    framework === "next"
      ? "process.env.NEXT_PUBLIC_"
      : framework === "vite"
        ? "import.meta.env.VITE_"
        : "process.env.";
  const moduleName = framework === "node" ? "@kenkaiiii/error-mom/node" : "@kenkaiiii/error-mom";
  const contents = `${framework === "next" ? '"use client";\n\n' : ""}import { initErrorMom } from "${moduleName}";\n\nconst server = ${environment}ERROR_MOM_SERVER;\nconst projectKey = ${environment}ERROR_MOM_PROJECT_KEY;\nconst release = ${environment}ERROR_MOM_RELEASE;\n\nif (!server || !projectKey) {\n  throw new Error("ERROR_MOM_SERVER and ERROR_MOM_PROJECT_KEY are required");\n}\n\ninitErrorMom({\n  server,\n  projectKey,\n  environment: ${environment}ERROR_MOM_ENVIRONMENT ?? "production",\n  ...(release ? { release } : {}),\n});\n`;
  await writeFile(join(process.cwd(), relativePath), contents);
  return relativePath;
}

async function appendEnvironment(
  framework: "next" | "vite" | "node",
  server: string,
  key: string,
): Promise<void> {
  const prefix = framework === "next" ? "NEXT_PUBLIC_" : framework === "vite" ? "VITE_" : "";
  const file = join(process.cwd(), ".env.local");
  const existing = existsSync(file) ? await readFile(file, "utf8") : "";
  const lines = [
    [`${prefix}ERROR_MOM_SERVER`, server],
    [`${prefix}ERROR_MOM_PROJECT_KEY`, key],
    [`${prefix}ERROR_MOM_ENVIRONMENT`, "production"],
  ].filter(([name]) => !existing.includes(`${name}=`));
  if (lines.length) {
    await appendFile(
      file,
      `${existing && !existing.endsWith("\n") ? "\n" : ""}${lines.map(([name, value]) => `${name}=${value}`).join("\n")}\n`,
      {
        mode: 0o600,
      },
    );
  }
}

function syntheticEvent() {
  return {
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    level: "error",
    error: {
      name: "ErrorMomDoctor",
      message: "Synthetic setup verification",
      stack: "ErrorMomDoctor: Synthetic setup verification\\n    at error-mom doctor:1:1",
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

function normalizeServer(server: string): string {
  return server.replace(/\/$/, "");
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
