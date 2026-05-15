/**
 * Contract Harness — runnable demonstration of the Estimate Format & Contract.
 *
 * Invocation (wired by `package.json` scripts):
 *   pnpm contract:harness              — full run (fixtures + PBT + structural check)
 *   pnpm contract:harness --pbt-only   — PBT properties + structural check only
 *   pnpm contract:harness --fixture <path>  — single fixture only
 *   pnpm contract:harness --seed <hex> — reproducible PBT seed
 *
 * Exits 0 on success, 1 on any failure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import fc from 'fast-check';

import * as contractModule from '../src/contract/index';
import {
  parseEstimatePayload,
  safeParseEstimatePayload,
  ESTIMATE_STATUSES,
} from '../src/contract/schema';
import type { EstimatePayload, EstimateStatus, ArchitectureRevision } from '../src/contract/schema';
import { projectToPerYearGroups } from '../src/contract/projection';
import { renderEstimateMd, renderArchitectureMd } from '../src/contract/markdown';
import { isLegalEstimateStatusTransition, ESTIMATE_STATUS_TRANSITIONS } from '../src/contract/state-machine';
import {
  arbShareUrlRevisionHistory,
  arbEstimatePayload,
  arbStatusTransition,
  type ShareUrlOp,
} from '../src/contract/__pbt__/arbitraries';

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  pbtOnly: boolean;
  fixturePath: string | null;
  seed: number | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // skip node and script path
  const result: CliArgs = { pbtOnly: false, fixturePath: null, seed: null };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--pbt-only') {
      result.pbtOnly = true;
      i++;
    } else if (arg === '--fixture') {
      i++;
      if (i >= args.length) {
        console.error('Error: --fixture requires a <path> argument');
        process.exit(1);
      }
      result.fixturePath = args[i];
      i++;
    } else if (arg === '--seed') {
      i++;
      if (i >= args.length) {
        console.error('Error: --seed requires a <hex> argument');
        process.exit(1);
      }
      const seedStr = args[i].startsWith('0x') ? args[i].slice(2) : args[i];
      const parsed = parseInt(seedStr, 16);
      if (isNaN(parsed)) {
        console.error(`Error: --seed value "${args[i]}" is not a valid hex number`);
        process.exit(1);
      }
      result.seed = parsed;
      i++;
    } else {
      console.error(`Error: unknown flag "${arg}"`);
      process.exit(1);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Canonical JSON (sorted keys)
// ---------------------------------------------------------------------------

function canonicalJsonReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Fixture Processing
// ---------------------------------------------------------------------------

interface FixtureFile {
  name: string; // filename without extension
  filePath: string;
}

function discoverFixtures(fixturesDir: string): FixtureFile[] {
  const files = fs.readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => ({
    name: f.replace(/\.json$/, ''),
    filePath: path.join(fixturesDir, f),
  }));
}

function processFixture(fixture: FixtureFile, outDir: string): TimingEntry {
  const rawJson = fs.readFileSync(fixture.filePath, 'utf-8');
  const rawData = JSON.parse(rawJson);

  // Validate through parseEstimatePayload (throws ZodError on failure)
  const parseStart = performance.now();
  const payload = parseEstimatePayload(rawData);
  const parseMs = performance.now() - parseStart;

  // Extract architectureRevisions from raw JSON (stripped by Zod)
  const architectureRevisions: ArchitectureRevision[] = rawData.architectureRevisions ?? [];

  // Project to per-year groups
  const projectStart = performance.now();
  const projected = projectToPerYearGroups(payload);
  const projectMs = performance.now() - projectStart;

  fs.writeFileSync(
    path.join(outDir, `${fixture.name}.projected.json`),
    JSON.stringify(projected, canonicalJsonReplacer, 2) + '\n',
    'utf-8',
  );

  // Render estimate markdown
  const renderEstStart = performance.now();
  const estimateMd = renderEstimateMd(payload);
  const renderEstimateMs = performance.now() - renderEstStart;

  fs.writeFileSync(
    path.join(outDir, `${fixture.name}.estimate.md`),
    estimateMd,
    'utf-8',
  );

  // Render architecture markdown
  let renderArchitectureMs = 0;
  const archRev = architectureRevisions.find(
    (rev) => rev.id === payload.pinnedArchitectureRevisionId,
  );
  if (archRev) {
    const renderArchStart = performance.now();
    const archMd = renderArchitectureMd(payload, archRev);
    renderArchitectureMs = performance.now() - renderArchStart;

    fs.writeFileSync(
      path.join(outDir, `${fixture.name}.architecture.md`),
      archMd,
      'utf-8',
    );
  }

  return {
    fixture: fixture.name,
    parseMs: Math.round(parseMs * 100) / 100,
    projectMs: Math.round(projectMs * 100) / 100,
    renderEstimateMs: Math.round(renderEstimateMs * 100) / 100,
    renderArchitectureMs: Math.round(renderArchitectureMs * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// PBT Properties (inline, using fc.property for fc.check)
// ---------------------------------------------------------------------------

const NUM_RUNS = 1024;

/** Statuses that require a non-null pinnedArchitectureRevisionId. */
const POST_DRAFT_STATUSES: ReadonlySet<string> = new Set([
  'AWAITING_APPROVAL',
  'APPROVED',
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETE',
  'PARTIALLY_COMPLETE',
  'FAILED',
]);

function makeArchRevForPayload(payload: EstimatePayload): ArchitectureRevision {
  return {
    id: payload.pinnedArchitectureRevisionId!,
    estimateId: payload.id,
    mermaidSource: 'graph TD\n  A --> B',
    agentCommentary: 'Generated for PBT',
    generationReason: 'pbt',
    promptMetadata: null,
    createdAt: payload.createdAt,
  };
}

function addYears(yearMonthStr: string, k: number): string {
  const year = parseInt(yearMonthStr.slice(0, 4), 10);
  const month = parseInt(yearMonthStr.slice(5, 7), 10);
  const totalMonths = (year * 12 + (month - 1)) + k * 12;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}-01`;
}

interface PropertyDef {
  name: string;
  property: fc.IProperty<unknown[]>;
}

function buildProperties(): PropertyDef[] {
  const properties: PropertyDef[] = [];

  // Property 1 (INV-1): at most one active first-pass row per estimate
  properties.push({
    name: 'Property 1 (INV-1)',
    property: fc.property(arbShareUrlRevisionHistory(), (ops: ShareUrlOp[]) => {
      const activeRows = new Map<string, { id: string; isFirstPass: boolean }>();
      for (const op of ops) {
        if (op.type === 'insert') {
          if (op.isFirstPass) {
            for (const [existingId, row] of activeRows) {
              if (row.isFirstPass) {
                activeRows.delete(existingId);
              }
            }
          }
          activeRows.set(op.id, { id: op.id, isFirstPass: op.isFirstPass });
        } else {
          activeRows.delete(op.targetId);
        }
        let firstPassCount = 0;
        for (const [, row] of activeRows) {
          if (row.isFirstPass) firstPassCount++;
        }
        if (firstPassCount > 1) return false;
      }
      return true;
    }),
  });

  // Property 2 (INV-2): valid payloads parse; mutated quantity arrays fail
  // Sub-property A: valid payloads always parse
  properties.push({
    name: 'Property 2 (INV-2)',
    property: fc.property(arbEstimatePayload(), (payload) => {
      const result = safeParseEstimatePayload(payload);
      if (!result.success) return false;

      // Sub-property B inline: mutate and check failure
      const mutated = JSON.parse(JSON.stringify(payload));
      if (mutated.lineItems.length > 0) {
        mutated.lineItems[0].quantityPerYear = [1, 2, 3]; // wrong length
        const mutResult = safeParseEstimatePayload(mutated);
        if (mutResult.success) return false;
      }
      return true;
    }),
  });

  // Property 3 (INV-3): configuration constant across year groups
  properties.push({
    name: 'Property 3 (INV-3)',
    property: fc.property(arbEstimatePayload(), (payload) => {
      const projected = projectToPerYearGroups(payload);
      const configsByLineItem = new Map<string, unknown[]>();
      for (const group of projected.groups) {
        for (const item of group.items) {
          if (!configsByLineItem.has(item.lineItemId)) {
            configsByLineItem.set(item.lineItemId, []);
          }
          configsByLineItem.get(item.lineItemId)!.push(item.configuration);
        }
      }
      for (const [, configs] of configsByLineItem) {
        if (configs.length > 1) {
          const first = JSON.stringify(configs[0]);
          for (let i = 1; i < configs.length; i++) {
            if (JSON.stringify(configs[i]) !== first) return false;
          }
        }
      }
      return true;
    }),
  });

  // Property 4 (INV-4): us-east-1 payloads parse; other regions fail
  const OTHER_REGIONS = ['us-west-2', 'eu-west-1', 'ap-southeast-1', 'eu-central-1'];
  const arbRegionInjected = arbEstimatePayload().chain((payload) => {
    return fc.boolean().map((injectBadRegion) => {
      if (!injectBadRegion || payload.lineItems.length === 0) {
        return { payload, expectSuccess: true };
      }
      const mutated = JSON.parse(JSON.stringify(payload));
      const badRegion = OTHER_REGIONS[Math.floor(Math.random() * OTHER_REGIONS.length)];
      mutated.lineItems[0].region = badRegion;
      return { payload: mutated, expectSuccess: false };
    });
  });
  properties.push({
    name: 'Property 4 (INV-4)',
    property: fc.property(arbRegionInjected, ({ payload, expectSuccess }) => {
      const result = safeParseEstimatePayload(payload);
      return result.success === expectSuccess;
    }),
  });

  // Property 5 (INV-5): rendering twice yields byte-identical strings
  properties.push({
    name: 'Property 5 (INV-5)',
    property: fc.property(arbEstimatePayload(), (payload) => {
      const md1 = renderEstimateMd(payload);
      const md2 = renderEstimateMd(payload);
      if (md1 !== md2) return false;
      if (payload.pinnedArchitectureRevisionId !== null) {
        const archRev = makeArchRevForPayload(payload);
        const arch1 = renderArchitectureMd(payload, archRev);
        const arch2 = renderArchitectureMd(payload, archRev);
        if (arch1 !== arch2) return false;
      }
      return true;
    }),
  });

  // Property 6 (INV-6): neither renderer throws on any valid payload
  properties.push({
    name: 'Property 6 (INV-6)',
    property: fc.property(arbEstimatePayload(), (payload) => {
      try {
        renderEstimateMd(payload);
      } catch {
        return false;
      }
      if (payload.pinnedArchitectureRevisionId !== null) {
        try {
          const archRev = makeArchRevForPayload(payload);
          renderArchitectureMd(payload, archRev);
        } catch {
          return false;
        }
      }
      return true;
    }),
  });

  // Property 7 (INV-7): JSON round-trip identity
  properties.push({
    name: 'Property 7 (INV-7)',
    property: fc.property(arbEstimatePayload(), (payload) => {
      const roundTripped = parseEstimatePayload(JSON.parse(JSON.stringify(payload)));
      return JSON.stringify(roundTripped) === JSON.stringify(payload);
    }),
  });

  // Property 8 (INV-8): status transitions match the transition table
  const legalEdges = new Set<string>();
  for (const [from, tos] of Object.entries(ESTIMATE_STATUS_TRANSITIONS)) {
    for (const to of tos) {
      legalEdges.add(`${from}->${to}`);
    }
  }
  properties.push({
    name: 'Property 8 (INV-8)',
    property: fc.property(arbStatusTransition(), ({ from, to }) => {
      const result = isLegalEstimateStatusTransition(from, to);
      const expected = legalEdges.has(`${from}->${to}`);
      return result === expected;
    }),
  });

  // Property 9 (INV-9): projection sum conservation
  properties.push({
    name: 'Property 9 (INV-9)',
    property: fc.property(arbEstimatePayload(), (payload) => {
      const projected = projectToPerYearGroups(payload);
      let projectionSum = 0;
      for (const group of projected.groups) {
        for (const item of group.items) {
          projectionSum += item.quantity;
        }
      }
      let inputSum = 0;
      for (const lineItem of payload.lineItems) {
        for (const qty of lineItem.quantityPerYear) {
          if (qty > 0) inputSum += qty;
        }
      }
      return projectionSum === inputSum;
    }),
  });

  // Property 10 (INV-10): year-start months spaced twelve months apart
  properties.push({
    name: 'Property 10 (INV-10)',
    property: fc.property(arbEstimatePayload(), (payload) => {
      const projected = projectToPerYearGroups(payload);
      for (let k = 0; k < 5; k++) {
        const expected = addYears(payload.yearOneStartMonth, k);
        if (projected.groups[k].startMonth !== expected) return false;
      }
      return true;
    }),
  });

  // Property 11 (INV-12): pinnedArchitectureRevisionId required for post-DRAFT
  const arbStatusPinnedPair = fc.record({
    status: fc.constantFrom(...ESTIMATE_STATUSES) as fc.Arbitrary<EstimateStatus>,
    pinnedArchitectureRevisionId: fc.option(fc.uuid(), { nil: null }),
  });
  properties.push({
    name: 'Property 11 (INV-12)',
    property: fc.property(arbStatusPinnedPair, arbEstimatePayload(), (pair, basePayload) => {
      const testPayload = {
        ...basePayload,
        status: pair.status,
        pinnedArchitectureRevisionId: pair.pinnedArchitectureRevisionId,
      };
      const result = safeParseEstimatePayload(testPayload);
      const isPostDraft = POST_DRAFT_STATUSES.has(pair.status);
      const hasRevId = pair.pinnedArchitectureRevisionId !== null;
      if (isPostDraft && !hasRevId) {
        return result.success === false;
      }
      return result.success === true;
    }),
  });

  return properties;
}

// ---------------------------------------------------------------------------
// Structural Check for I-11
// ---------------------------------------------------------------------------

function runStructuralCheck(): { passed: boolean; failedExport?: string } {
  const forbiddenPatterns = [/^update.*AuditLog/i, /^delete.*AuditLog/i];
  for (const exportName of Object.keys(contractModule)) {
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(exportName)) {
        return { passed: false, failedExport: exportName };
      }
    }
  }
  return { passed: true };
}

// ---------------------------------------------------------------------------
// PBT Report Types
// ---------------------------------------------------------------------------

interface PbtPropertyResult {
  name: string;
  passed: boolean;
  durationMs: number;
  counterexample?: string;
}

interface TimingEntry {
  fixture: string;
  parseMs: number;
  projectMs: number;
  renderEstimateMs: number;
  renderArchitectureMs: number;
}

interface PbtReport {
  seed: string;
  numRuns: number;
  properties: PbtPropertyResult[];
  totalDurationMs: number;
  allPassed: boolean;
  timings: TimingEntry[];
  machine: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpus: number;
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const cliArgs = parseArgs(process.argv);

  const outDir = path.resolve('out');
  fs.mkdirSync(outDir, { recursive: true });

  // Generate seed
  const seed = cliArgs.seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
  const seedHex = '0x' + seed.toString(16);

  let fixtureCount = 0;
  let fixtureTotal = 0;
  const timings: TimingEntry[] = [];

  // --- Fixture Processing ---
  if (!cliArgs.pbtOnly) {
    const fixturesDir = path.resolve('fixtures/sample-estimates');
    let fixtures: FixtureFile[];

    if (cliArgs.fixturePath) {
      const absPath = path.resolve(cliArgs.fixturePath);
      if (!fs.existsSync(absPath)) {
        console.error(`Error: fixture file not found: ${cliArgs.fixturePath}`);
        process.exit(1);
      }
      fixtures = [{
        name: path.basename(absPath, '.json'),
        filePath: absPath,
      }];
    } else {
      fixtures = discoverFixtures(fixturesDir);
    }

    fixtureTotal = fixtures.length;

    for (const fixture of fixtures) {
      try {
        const timing = processFixture(fixture, outDir);
        timings.push(timing);
        fixtureCount++;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'issues' in err) {
          // ZodError
          const zodErr = err as { issues: Array<{ path: (string | number)[]; message: string }> };
          console.error(`\nFixture validation failed: ${fixture.filePath}`);
          console.error('ZodError issues:');
          for (const issue of zodErr.issues) {
            console.error(`  - path: ${issue.path.join('.')} — ${issue.message}`);
          }
          process.exit(1);
        }
        throw err;
      }
    }

    console.log(`Fixtures: ${fixtureCount} / ${fixtureTotal} validated, projected, and rendered`);
  }

  // --- Structural Check for I-11 ---
  const structuralResult = runStructuralCheck();
  if (!structuralResult.passed) {
    console.error(`\nStructural check FAILED: forbidden export "${structuralResult.failedExport}" found in contract module`);
    process.exit(1);
  }

  // --- PBT Execution ---
  const properties = buildProperties();
  const pbtResults: PbtPropertyResult[] = [];
  const pbtStart = Date.now();
  let allPassed = true;

  for (const propDef of properties) {
    const propStart = Date.now();
    const result = fc.check(propDef.property, { numRuns: NUM_RUNS, seed });
    const durationMs = Date.now() - propStart;

    const passed = !result.failed;
    const propResult: PbtPropertyResult = {
      name: propDef.name,
      passed,
      durationMs,
    };

    if (result.failed && result.counterexample) {
      propResult.counterexample = JSON.stringify(result.counterexample);
    }

    pbtResults.push(propResult);

    if (!passed) {
      allPassed = false;
    }
  }

  const totalDurationMs = Date.now() - pbtStart;

  // --- Performance Assertions (NFR-4) ---
  // Assert no individual fixture call exceeds 100ms
  for (const t of timings) {
    const maxCall = Math.max(t.parseMs, t.projectMs, t.renderEstimateMs, t.renderArchitectureMs);
    if (maxCall > 100) {
      console.error(`\nPerformance assertion FAILED: ${t.fixture} has a call exceeding 100ms (${maxCall.toFixed(2)}ms)`);
      process.exit(1);
    }
  }
  // Assert full PBT suite completes in under 60 seconds
  if (totalDurationMs > 60000) {
    console.error(`\nPerformance assertion FAILED: PBT suite took ${totalDurationMs}ms (limit: 60000ms)`);
    process.exit(1);
  }

  // Write PBT report
  const pbtReport: PbtReport = {
    seed: seedHex,
    numRuns: NUM_RUNS,
    properties: pbtResults,
    totalDurationMs,
    allPassed,
    timings,
    machine: {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpus: os.cpus().length,
    },
  };
  fs.writeFileSync(
    path.join(outDir, 'pbt-report.json'),
    JSON.stringify(pbtReport, null, 2) + '\n',
    'utf-8',
  );

  // Print PBT summary
  const passedCount = pbtResults.filter((r) => r.passed).length;
  console.log(`PBT properties: ${passedCount} / ${pbtResults.length} passed (${NUM_RUNS} cases each, seed=${seedHex})`);

  // Report failures
  if (!allPassed) {
    console.error('\nPBT failures:');
    for (const r of pbtResults) {
      if (!r.passed) {
        console.error(`  - ${r.name} (seed=${seedHex})`);
        if (r.counterexample) {
          console.error(`    counterexample: ${r.counterexample}`);
        }
      }
    }
    process.exit(1);
  }
}

main();
