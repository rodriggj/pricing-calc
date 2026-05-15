/**
 * Fixture-loader test — validates that all canonical sample-estimate fixtures
 * pass through `parseEstimatePayload` without throwing a ZodError.
 *
 * Validates: Requirements FR-Harness (AC-8)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseEstimatePayload } from './schema';

const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/sample-estimates');

/** Load all .json fixture files from the sample-estimates directory. */
function loadFixtureFiles(): { name: string; content: Record<string, unknown> }[] {
  const files = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  return files.map((name) => ({
    name,
    content: JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8')),
  }));
}

describe('Canonical fixture validation', () => {
  const fixtures = loadFixtureFiles();

  it('should find at least 3 fixture files', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(3);
  });

  it.each(fixtures.map((f) => [f.name, f.content] as const))(
    '%s — passes parseEstimatePayload without ZodError',
    (_name, content) => {
      // Fixture files are flat: payload fields + architectureRevisions at top level.
      // Zod strips unknown keys, so architectureRevisions is ignored by the parser.
      expect(() => parseEstimatePayload(content)).not.toThrow();
    },
  );

  it.each(fixtures.map((f) => [f.name, f.content] as const))(
    '%s — architectureRevisions array is present and pinnedArchitectureRevisionId matches',
    (_name, content) => {
      const fixture = content as {
        pinnedArchitectureRevisionId: string | null;
        architectureRevisions: { id: string }[];
      };
      expect(Array.isArray(fixture.architectureRevisions)).toBe(true);
      expect(fixture.architectureRevisions.length).toBeGreaterThan(0);
      if (fixture.pinnedArchitectureRevisionId !== null) {
        const revisionIds = fixture.architectureRevisions.map((r) => r.id);
        expect(revisionIds).toContain(fixture.pinnedArchitectureRevisionId);
      }
    },
  );
});
