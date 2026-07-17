import { z } from "zod";

const boundedString = z.string().max(10_000);
const shortString = z.string().max(500);
const scalar = z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]);

export const breadcrumbSchema = z.object({
  timestamp: z.string().datetime(),
  category: shortString,
  level: z.enum(["debug", "info", "warning", "error"]),
  message: z.string().max(2_000),
  data: z.record(z.string(), scalar).optional(),
});

export const errorEventSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.string().datetime(),
  level: z.enum(["warning", "error", "fatal"]).default("error"),
  error: z.object({
    name: shortString,
    message: boundedString,
    stack: z.string().max(100_000).optional(),
  }),
  environment: shortString.default("production"),
  release: shortString.optional(),
  platform: shortString,
  runtime: shortString,
  url: z.string().max(4_000).optional(),
  culprit: z.string().max(2_000).optional(),
  installationId: shortString.optional(),
  sessionId: shortString.optional(),
  breadcrumbs: z.array(breadcrumbSchema).max(100).default([]),
  tags: z.record(z.string().max(100), z.string().max(500)).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const eventBatchSchema = z.object({
  events: z.array(errorEventSchema).min(1).max(100),
  sdk: z.object({
    name: shortString,
    version: shortString,
  }),
});

export type Breadcrumb = z.infer<typeof breadcrumbSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
export type EventBatch = z.infer<typeof eventBatchSchema>;

export type IssueStatus = "open" | "regressed" | "resolved";

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  openIssues: number;
  createdAt: string;
}

export interface IssueSummary {
  id: string;
  projectId: string;
  projectName: string;
  fingerprint: string;
  title: string;
  errorType: string;
  culprit: string | null;
  status: IssueStatus;
  quantity: number;
  firstSeen: string;
  lastSeen: string;
  latestRelease: string | null;
  fixedInRelease: string | null;
}

export interface IssueSample {
  id: string;
  eventId: string;
  occurredAt: string;
  environment: string;
  release: string | null;
  platform: string;
  runtime: string;
  message: string;
  stack: string | null;
  breadcrumbs: Breadcrumb[];
  context: Record<string, unknown>;
  tags: Record<string, string>;
}

export interface IssueDetail extends IssueSummary {
  samples: IssueSample[];
  releases: Array<{ release: string; quantity: number; lastSeen: string }>;
}
