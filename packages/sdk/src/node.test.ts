import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initErrorMom, type ErrorMomNode } from "./node";

const temporaryDirectories: string[] = [];
let activeClient: ErrorMomNode | undefined;

afterEach(async () => {
  await activeClient?.dispose();
  activeClient = undefined;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Node SDK", () => {
  it("spools before upload and sends a valid batch", async () => {
    const received: unknown[] = [];
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        received.push(JSON.parse(body));
        response.writeHead(202, { "content-type": "application/json" });
        response.end('{"accepted":1}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Test server did not bind a TCP port");

    const spoolDirectory = await mkdtemp(join(tmpdir(), "error-mom-sdk-"));
    temporaryDirectories.push(spoolDirectory);
    activeClient = initErrorMom({
      server: `http://127.0.0.1:${address.port}`,
      projectKey: "em_ingest_test-only-key",
      spoolDirectory,
      captureConsoleErrors: false,
    });

    const eventId = activeClient.captureError(new Error("Export failed"), {
      culprit: "video.export",
    });
    await activeClient.flush();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      events: [
        { eventId, error: { name: "Error", message: "Export failed" }, culprit: "video.export" },
      ],
      sdk: { name: "@kenkaiiii/error-mom", version: "0.1.0" },
    });
    const spoolFiles = await import("node:fs/promises").then(({ readdir }) =>
      readdir(spoolDirectory),
    );
    expect(spoolFiles).toHaveLength(1);
    expect(await readFile(join(spoolDirectory, spoolFiles[0]!), "utf8")).toBe("");
  });
});
