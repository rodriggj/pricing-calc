// Contract Module — deterministic Markdown renderers.
//
// `renderEstimateMd` (Task 6) produces the `estimate.md` artifact.
// `renderArchitectureMd` (Task 7) produces the `architecture.md` artifact.
//
// Both are total functions over validated input: they never throw on a payload
// that has passed `parseEstimatePayload`. Both are deterministic: byte-identical
// input produces byte-identical output given pinned version constants.

import type { EstimatePayload, Configuration, ArchitectureRevision } from './schema';
import { projectToPerYearGroups } from './projection';
import { CONTRACT_SCHEMA_VERSION, RENDERER_VERSION } from './versions';
import { ContractInvariantError } from './errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Month names for `formatYearMonth`. Indexed 1–12.
 */
const MONTH_NAMES = [
  '', // placeholder for 0-index
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Convert a `YYYY-MM-01` date string to a human-readable `Month YYYY` form.
 *
 * Example: `'2024-06-01'` → `'June 2024'`
 */
function formatYearMonth(yearMonthStr: string): string {
  const year = yearMonthStr.slice(0, 4);
  const month = parseInt(yearMonthStr.slice(5, 7), 10);
  return `${MONTH_NAMES[month]} ${year}`;
}

/**
 * Escape Markdown table-cell special characters in a string value.
 * - `|` → `\|`
 * - newlines → space
 */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Deterministic configuration formatter for Markdown table cells.
 *
 * - Sorts keys alphabetically for determinism.
 * - Produces a compact `key1: value1, key2: value2` representation.
 * - For primitive values, renders them directly.
 * - For nested objects/arrays, falls back to `JSON.stringify` with sorted keys.
 * - Escapes Markdown table-cell special characters (`|`, newlines).
 */
export function formatConfig(config: Configuration): string {
  const keys = Object.keys(config).sort();
  const parts: string[] = [];

  for (const key of keys) {
    const value = config[key];
    let formatted: string;

    if (value === null) {
      formatted = 'null';
    } else if (typeof value === 'string') {
      formatted = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      formatted = String(value);
    } else {
      // Arrays or nested objects — use JSON.stringify with sorted keys
      formatted = JSON.stringify(value, Object.keys(value as object).sort());
    }

    parts.push(`${key}: ${formatted}`);
  }

  return escapeTableCell(parts.join(', '));
}

// ---------------------------------------------------------------------------
// renderEstimateMd — Algorithm 2
// ---------------------------------------------------------------------------

/**
 * Render a validated `EstimatePayload` into a deterministic Markdown string.
 *
 * Total: never throws on validated input.
 * Deterministic: byte-identical output for byte-identical input given pinned
 * `CONTRACT_SCHEMA_VERSION` and `RENDERER_VERSION`.
 *
 * Implements Algorithm 2 from the design document.
 */
export function renderEstimateMd(payload: EstimatePayload): string {
  const parts: string[] = [];

  // Section 1: Header
  parts.push(`# ${payload.name}\n\n`);
  parts.push(`**Estimate ID:** ${payload.id}\n`);
  parts.push(`**Status:** ${payload.status}\n`);
  parts.push(`**Region:** us-east-1\n`);
  parts.push(`**Year 1 starts:** ${formatYearMonth(payload.yearOneStartMonth)}\n\n`);

  // Section 2: Per-year resources (use the projection)
  const perYear = projectToPerYearGroups(payload);
  for (const group of perYear.groups) {
    parts.push(`## Year ${group.yearIndex} — starting ${formatYearMonth(group.startMonth)}\n\n`);
    if (group.items.length === 0) {
      parts.push(`_No resources in this year._\n\n`);
    } else {
      parts.push(`| Service | Configuration | Quantity |\n`);
      parts.push(`|---------|---------------|----------|\n`);
      for (const item of group.items) {
        parts.push(`| ${item.serviceCode} | ${formatConfig(item.configuration)} | ${item.quantity} |\n`);
      }
      parts.push(`\n`);
    }
  }

  // Section 3: Metadata block
  parts.push(`\n<!-- contract-metadata\n`);
  parts.push(`schemaVersion: ${CONTRACT_SCHEMA_VERSION}\n`);
  parts.push(`rendererVersion: ${RENDERER_VERSION}\n`);
  parts.push(`-->\n`);

  return parts.join('');
}

// ---------------------------------------------------------------------------
// renderArchitectureMd — Algorithm 3
// ---------------------------------------------------------------------------

/**
 * Render a validated `EstimatePayload` and its pinned `ArchitectureRevision`
 * into a deterministic Markdown string.
 *
 * Throws `ContractInvariantError` if `archRev.id` does not match
 * `payload.pinnedArchitectureRevisionId`.
 *
 * Total on valid input pairs. Deterministic: byte-identical output for
 * byte-identical inputs given pinned version constants.
 *
 * Implements Algorithm 3 from the design document.
 */
export function renderArchitectureMd(
  payload: EstimatePayload,
  archRev: ArchitectureRevision,
): string {
  // ASSERT: architecture revision ID must match the payload's pinned ID
  if (archRev.id !== payload.pinnedArchitectureRevisionId) {
    throw new ContractInvariantError(
      `Architecture revision ID mismatch: expected '${payload.pinnedArchitectureRevisionId}' but got '${archRev.id}'`,
    );
  }

  const parts: string[] = [];

  // Header
  parts.push(`# Architecture: ${payload.name}\n\n`);

  // Mermaid block
  parts.push(`\`\`\`mermaid\n${archRev.mermaidSource}\n\`\`\`\n\n`);

  // Commentary section — only if agentCommentary is non-empty (not null, not blank after trim)
  if (archRev.agentCommentary !== null && archRev.agentCommentary.trim() !== '') {
    parts.push(`## Commentary\n\n${archRev.agentCommentary}\n\n`);
  }

  // Metadata block
  parts.push(`<!-- contract-metadata\n`);
  parts.push(`schemaVersion: ${CONTRACT_SCHEMA_VERSION}\n`);
  parts.push(`rendererVersion: ${RENDERER_VERSION}\n`);
  parts.push(`architectureRevisionId: ${archRev.id}\n`);
  parts.push(`-->\n`);

  return parts.join('');
}
