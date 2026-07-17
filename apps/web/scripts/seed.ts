import { fileURLToPath } from "node:url";
import type { ErrorEvent, IssueStatus } from "@kenkaiiii/error-mom-protocol";

process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));

const [{ database }, { ingestEvents, listIssues, listProjects }, { createProject }] =
  await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/issues"),
    import("../src/lib/projects"),
  ]);

interface SeedIssue {
  errorType: string;
  message: string;
  stack: string;
  culprit: string;
  platform: string;
  runtime: string;
  environment: string;
  status: IssueStatus;
  fixedInRelease?: string;
  firstSeenHoursAgo: number;
  lastSeenMinutesAgo: number;
  releases: Array<{ name: string; quantity: number }>;
  tags: Record<string, string>;
  context: Record<string, unknown>;
  breadcrumbs: ErrorEvent["breadcrumbs"];
}

interface SeedProject {
  name: string;
  slug: string;
  issues: SeedIssue[];
}

const projects: SeedProject[] = [
  {
    name: "FrameForge",
    slug: "frameforge",
    issues: [
      {
        errorType: "VideoDecoderError",
        message: "Hardware decoder timed out after 15000ms",
        stack:
          "VideoDecoderError: Hardware decoder timed out after 15000ms\n    at decodeFrame (src/native/video/decoder.ts:284:18)\n    at renderPreview (src/timeline/preview.ts:119:27)\n    at async seekToFrame (src/timeline/player.ts:76:9)",
        culprit: "decodeFrame (src/native/video/decoder.ts:284:18)",
        platform: "Windows 11 x64",
        runtime: "Tauri 2 / WebView2 138",
        environment: "production",
        status: "open",
        firstSeenHoursAgo: 121,
        lastSeenMinutesAgo: 4,
        releases: [
          { name: "2.8.1", quantity: 261 },
          { name: "2.8.0", quantity: 23 },
        ],
        tags: { gpu: "NVIDIA RTX 4070", codec: "H.265", operation: "preview" },
        context: { clipDurationMs: 183420, frame: 4821, resolution: "3840x2160" },
        breadcrumbs: breadcrumbs(
          "Opened project Summer Campaign",
          "Scrubbed timeline to 00:03:12",
          "Decoder queue reached 32 frames",
        ),
      },
      {
        errorType: "ExportError",
        message: "FFmpeg exited with code 1 while writing output",
        stack:
          "ExportError: FFmpeg exited with code 1 while writing output\n    at ExportWorker.finish (src/export/worker.ts:203:13)\n    at async exportTimeline (src/export/index.ts:91:5)",
        culprit: "ExportWorker.finish (src/export/worker.ts:203:13)",
        platform: "macOS 15.5 arm64",
        runtime: "Tauri 2 / WKWebView",
        environment: "production",
        status: "regressed",
        fixedInRelease: "2.8.1",
        firstSeenHoursAgo: 340,
        lastSeenMinutesAgo: 18,
        releases: [
          { name: "2.8.1", quantity: 42 },
          { name: "2.7.9", quantity: 31 },
        ],
        tags: { format: "ProRes 422", destination: "external-volume", operation: "export" },
        context: { freeDiskBytes: 18253611008, outputBytes: 4274913280, timelineMinutes: 47 },
        breadcrumbs: breadcrumbs(
          "Started export Master v12",
          "Rendered 97% of timeline",
          "Output volume became unavailable for 812ms",
        ),
      },
      {
        errorType: "AudioGraphError",
        message: "Output device disappeared during playback",
        stack:
          "AudioGraphError: Output device disappeared during playback\n    at AudioGraph.handleDeviceChange (src/audio/graph.ts:144:11)\n    at CoreAudioBridge.onChange (src/native/audio.ts:52:7)",
        culprit: "AudioGraph.handleDeviceChange (src/audio/graph.ts:144:11)",
        platform: "macOS 15.4 arm64",
        runtime: "Tauri 2 / WKWebView",
        environment: "production",
        status: "resolved",
        fixedInRelease: "2.8.0",
        firstSeenHoursAgo: 720,
        lastSeenMinutesAgo: 2880,
        releases: [{ name: "2.7.8", quantity: 19 }],
        tags: { device: "AirPods Pro", operation: "playback" },
        context: { sampleRate: 48000, bufferSize: 512 },
        breadcrumbs: breadcrumbs(
          "Playback started",
          "Bluetooth route changed",
          "Audio device list refreshed",
        ),
      },
    ],
  },
  {
    name: "PixelPress",
    slug: "pixelpress",
    issues: [
      {
        errorType: "ChunkLoadError",
        message: "Loading chunk 8472 failed after deployment",
        stack:
          "ChunkLoadError: Loading chunk 8472 failed\n    at __webpack_require__.f.j (/_next/static/chunks/webpack.js:782:29)\n    at loadEditor (src/app/editor/page.tsx:44:21)",
        culprit: "loadEditor (src/app/editor/page.tsx:44:21)",
        platform: "Windows 11 / Chrome 138",
        runtime: "Next.js 16 / browser",
        environment: "production",
        status: "open",
        firstSeenHoursAgo: 7,
        lastSeenMinutesAgo: 2,
        releases: [
          { name: "4.12.0", quantity: 790 },
          { name: "4.11.9", quantity: 122 },
        ],
        tags: { route: "/editor", region: "eu-west", browser: "Chrome 138" },
        context: { deploymentId: "dpl_7f91", cacheStatus: "stale", connection: "4g" },
        breadcrumbs: breadcrumbs(
          "Navigated to /editor",
          "Service worker returned cached shell",
          "Dynamic import requested chunk 8472",
        ),
      },
      {
        errorType: "TypeError",
        message: "Cannot read properties of null (reading 'selection')",
        stack:
          "TypeError: Cannot read properties of null (reading 'selection')\n    at restoreSelection (src/editor/selection.ts:87:24)\n    at applyRemoteStep (src/editor/collaboration.ts:211:9)",
        culprit: "restoreSelection (src/editor/selection.ts:87:24)",
        platform: "macOS 15.5 / Safari 18.5",
        runtime: "Next.js 16 / browser",
        environment: "production",
        status: "open",
        firstSeenHoursAgo: 52,
        lastSeenMinutesAgo: 36,
        releases: [{ name: "4.12.0", quantity: 146 }],
        tags: { feature: "collaboration", documentType: "article" },
        context: { collaborators: 4, pendingSteps: 7, documentNodes: 1842 },
        breadcrumbs: breadcrumbs(
          "Opened collaborative article",
          "Received 7 remote steps",
          "Editor focus moved to comment sidebar",
        ),
      },
      {
        errorType: "UploadError",
        message: "Image upload rejected with HTTP 413",
        stack:
          "UploadError: Image upload rejected with HTTP 413\n    at uploadAsset (src/assets/upload.ts:102:15)\n    at async insertImage (src/editor/images.ts:68:5)",
        culprit: "uploadAsset (src/assets/upload.ts:102:15)",
        platform: "Linux / Firefox 140",
        runtime: "Next.js 16 / browser",
        environment: "production",
        status: "resolved",
        fixedInRelease: "4.11.8",
        firstSeenHoursAgo: 480,
        lastSeenMinutesAgo: 8640,
        releases: [{ name: "4.11.7", quantity: 64 }],
        tags: { endpoint: "/api/assets", contentType: "image/tiff" },
        context: { fileBytes: 28491032, proxyLimitBytes: 10485760 },
        breadcrumbs: breadcrumbs(
          "Opened asset picker",
          "Selected campaign-hero.tiff",
          "Upload started",
        ),
      },
    ],
  },
  {
    name: "LedgerLoop API",
    slug: "ledgerloop-api",
    issues: [
      {
        errorType: "DatabaseError",
        message: "Remaining connection slots are reserved for superuser connections",
        stack:
          "DatabaseError: remaining connection slots are reserved for superuser connections\n    at PostgresPool.connect (src/db/pool.ts:73:17)\n    at async createInvoice (src/billing/invoices.ts:188:20)\n    at async POST (src/routes/invoices.ts:54:12)",
        culprit: "PostgresPool.connect (src/db/pool.ts:73:17)",
        platform: "Linux x64",
        runtime: "Node.js 24.4",
        environment: "production",
        status: "open",
        firstSeenHoursAgo: 18,
        lastSeenMinutesAgo: 1,
        releases: [
          { name: "1.19.4", quantity: 1617 },
          { name: "1.19.3", quantity: 225 },
        ],
        tags: { service: "billing-api", region: "us-east-1", database: "primary" },
        context: { poolSize: 40, waitingClients: 126, activeWorkers: 18 },
        breadcrumbs: breadcrumbs(
          "POST /v1/invoices",
          "Pool wait exceeded 2000ms",
          "Connection attempt 3 failed",
        ),
      },
      {
        errorType: "WebhookSignatureError",
        message: "Stripe signature verification failed for a valid webhook",
        stack:
          "WebhookSignatureError: Stripe signature verification failed\n    at verifyStripeEvent (src/webhooks/stripe.ts:96:11)\n    at handleWebhook (src/webhooks/index.ts:41:18)",
        culprit: "verifyStripeEvent (src/webhooks/stripe.ts:96:11)",
        platform: "Linux x64",
        runtime: "Node.js 24.4",
        environment: "production",
        status: "regressed",
        fixedInRelease: "1.19.4",
        firstSeenHoursAgo: 240,
        lastSeenMinutesAgo: 11,
        releases: [
          { name: "1.19.4", quantity: 87 },
          { name: "1.19.2", quantity: 231 },
        ],
        tags: { provider: "stripe", eventType: "invoice.payment_succeeded" },
        context: { clockSkewSeconds: 314, endpointVersion: "2025-06-30" },
        breadcrumbs: breadcrumbs(
          "POST /webhooks/stripe",
          "Read 2841-byte request body",
          "Signature timestamp outside tolerance",
        ),
      },
      {
        errorType: "EmailDeliveryError",
        message: "SES request timed out after 10000ms",
        stack:
          "EmailDeliveryError: SES request timed out after 10000ms\n    at sendInvoiceEmail (src/email/invoices.ts:122:13)\n    at async processDeliveryJob (src/jobs/email.ts:58:7)",
        culprit: "sendInvoiceEmail (src/email/invoices.ts:122:13)",
        platform: "Linux arm64",
        runtime: "Node.js 24.4",
        environment: "production",
        status: "open",
        firstSeenHoursAgo: 30,
        lastSeenMinutesAgo: 67,
        releases: [{ name: "1.19.4", quantity: 27 }],
        tags: { provider: "ses", queue: "invoice-email", region: "eu-central-1" },
        context: { attempt: 4, queueDepth: 382, recipientDomain: "example-customer.com" },
        breadcrumbs: breadcrumbs(
          "Invoice finalized",
          "Delivery job dequeued",
          "SES request retry 4 started",
        ),
      },
    ],
  },
];

for (const fixture of projects) {
  const knownProjects = await listProjects();
  const existing = knownProjects.find((project) => project.slug === fixture.slug);
  const projectId = existing?.id ?? (await createProject(fixture.name, fixture.slug)).id;

  for (const issue of fixture.issues) {
    for (const [releaseIndex, release] of issue.releases.entries()) {
      await ingestEvents(projectId, [eventFor(issue, release.name, releaseIndex)]);
    }

    const storedIssues = await listIssues({ projectId, status: "all" });
    const stored = storedIssues.find(
      (candidate) => candidate.errorType === issue.errorType && candidate.title === issue.message,
    );
    if (!stored) throw new Error(`Seeded issue was not found: ${issue.errorType}`);

    const quantity = issue.releases.reduce((total, release) => total + release.quantity, 0);
    const firstSeen = new Date(Date.now() - issue.firstSeenHoursAgo * 60 * 60 * 1000).toISOString();
    const lastSeen = new Date(Date.now() - issue.lastSeenMinutesAgo * 60 * 1000).toISOString();
    const sql = database();
    await sql`
      UPDATE issues
      SET quantity = ${quantity}, first_seen = ${firstSeen}, last_seen = ${lastSeen},
          status = ${issue.status}, fixed_in_release = ${issue.fixedInRelease ?? null},
          resolved_at = ${issue.status === "resolved" ? lastSeen : null}, updated_at = now()
      WHERE id = ${stored.id}
    `;
    for (const release of issue.releases) {
      await sql`
        UPDATE issue_releases
        SET quantity = ${release.quantity}, first_seen = ${firstSeen}, last_seen = ${lastSeen}
        WHERE issue_id = ${stored.id} AND release = ${release.name}
      `;
    }
  }
}

await database().end();
process.stdout.write("Seeded 3 projects and 9 realistic issues.\n");

function eventFor(issue: SeedIssue, release: string, index: number): ErrorEvent {
  const timestamp = new Date(
    Date.now() - (issue.lastSeenMinutesAgo + index) * 60 * 1000,
  ).toISOString();
  return {
    eventId: crypto.randomUUID(),
    timestamp,
    level: issue.status === "regressed" ? "fatal" : "error",
    error: { name: issue.errorType, message: issue.message, stack: issue.stack },
    environment: issue.environment,
    release,
    platform: issue.platform,
    runtime: issue.runtime,
    culprit: issue.culprit,
    installationId: `seed-${issue.platform}-${index}`,
    breadcrumbs: issue.breadcrumbs,
    tags: issue.tags,
    context: issue.context,
  };
}

function breadcrumbs(first: string, second: string, third: string): ErrorEvent["breadcrumbs"] {
  const now = Date.now();
  return [
    {
      timestamp: new Date(now - 45_000).toISOString(),
      category: "user",
      level: "info",
      message: first,
    },
    {
      timestamp: new Date(now - 12_000).toISOString(),
      category: "app",
      level: "info",
      message: second,
    },
    {
      timestamp: new Date(now - 1_000).toISOString(),
      category: "diagnostic",
      level: "warning",
      message: third,
    },
  ];
}
