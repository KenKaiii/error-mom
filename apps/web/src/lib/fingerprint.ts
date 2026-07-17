import { createHash } from "node:crypto";

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const HEX = /\b(?:0x)?[0-9a-f]{12,}\b/gi;
const NUMBER = /\b\d+(?:\.\d+)?\b/g;
const LINE_COLUMN = /:\d+(?::\d+)?(?=\)?$)/gm;
const URL_QUERY = /([?&](?:[^=&#]+)=)[^&#\s]*/g;
const ABSOLUTE_PATH = /(?:[A-Za-z]:\\|\/)(?:[^\s():]+[\\/])+([^\s():]+)(?=:\d+|\)?$)/gm;

function normalizeDynamicText(value: string): string {
  return value
    .replace(URL_QUERY, "$1{value}")
    .replace(UUID, "{uuid}")
    .replace(HEX, "{hex}")
    .replace(NUMBER, "{n}")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStack(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .slice(0, 12)
    .map((line) => line.replace(ABSOLUTE_PATH, "$1").replace(LINE_COLUMN, ":{line}:{column}"))
    .map(normalizeDynamicText)
    .join("\n");
}

export function fingerprintError(name: string, message: string, stack?: string): string {
  const normalizedStack = normalizeStack(stack);
  const material = [name.toLowerCase(), normalizeDynamicText(message), normalizedStack].join("\n");
  return createHash("sha256").update(material).digest("hex");
}

export function findCulprit(stack: string | undefined): string | null {
  if (!stack) return null;
  const frame = stack
    .split("\n")
    .slice(1)
    .find((line) => line.trim().length > 0);
  return frame?.trim().slice(0, 2_000) ?? null;
}
