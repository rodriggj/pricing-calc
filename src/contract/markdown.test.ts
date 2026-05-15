import { describe, it, expect } from 'vitest';
import { renderEstimateMd, formatConfig, renderArchitectureMd } from './markdown';
import { ContractInvariantError } from './errors';
import type { EstimatePayload, ArchitectureRevision } from './schema';

// ---------------------------------------------------------------------------
// Inline fixture helpers
// ---------------------------------------------------------------------------

function makePayload(overrides: Partial<EstimatePayload> = {}): EstimatePayload {
  return {
    id: 'est-001',
    ownerId: 'user-1',
    orgId: null,
    name: 'Test Estimate',
    status: 'DRAFT',
    yearOneStartMonth: '2024-06-01',
    pinnedArchitectureRevisionId: null,
    lineItems: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fixture 1: Flat quantity — items in all 5 years
// ---------------------------------------------------------------------------

const flatQuantityPayload = makePayload({
  id: 'est-flat-001',
  name: 'Flat Quantity Estimate',
  yearOneStartMonth: '2024-01-01',
  lineItems: [
    {
      id: 'li-ec2-flat',
      serviceCode: 'ec2',
      configuration: { instanceType: 't3.medium', vCpu: 2, memoryGib: 4 },
      region: 'us-east-1',
      quantityPerYear: [10, 10, 10, 10, 10],
      status: 'PENDING',
      failureReason: null,
    },
    {
      id: 'li-s3-flat',
      serviceCode: 's3',
      configuration: { storageClass: 'STANDARD', storageGib: 100 },
      region: 'us-east-1',
      quantityPerYear: [5, 5, 5, 5, 5],
      status: 'PENDING',
      failureReason: null,
    },
  ],
});

// ---------------------------------------------------------------------------
// Fixture 2: Sparse — some empty years
// ---------------------------------------------------------------------------

const sparsePayload = makePayload({
  id: 'est-sparse-001',
  name: 'Sparse Estimate',
  yearOneStartMonth: '2025-03-01',
  lineItems: [
    {
      id: 'li-rds-sparse',
      serviceCode: 'rds',
      configuration: { engine: 'postgres', instanceClass: 'db.t3.medium' },
      region: 'us-east-1',
      quantityPerYear: [2, 0, 0, 3, 0],
      status: 'PENDING',
      failureReason: null,
    },
    {
      id: 'li-lambda-sparse',
      serviceCode: 'lambda',
      configuration: { memoryMb: 512 },
      region: 'us-east-1',
      quantityPerYear: [0, 0, 1, 0, 0],
      status: 'PENDING',
      failureReason: null,
    },
  ],
});

// ---------------------------------------------------------------------------
// Fixture 3: All-zero quantities — all years show placeholder
// ---------------------------------------------------------------------------

const allZeroPayload = makePayload({
  id: 'est-zero-001',
  name: 'All Zero Estimate',
  yearOneStartMonth: '2023-12-01',
  lineItems: [
    {
      id: 'li-dynamo-zero',
      serviceCode: 'dynamodb',
      configuration: { readCapacity: 10, writeCapacity: 5 },
      region: 'us-east-1',
      quantityPerYear: [0, 0, 0, 0, 0],
      status: 'PENDING',
      failureReason: null,
    },
  ],
});

// ---------------------------------------------------------------------------
// Snapshot tests
// ---------------------------------------------------------------------------

describe('renderEstimateMd', () => {
  describe('snapshot tests', () => {
    it('renders flat-quantity payload correctly', () => {
      const result = renderEstimateMd(flatQuantityPayload);
      expect(result).toMatchSnapshot();
    });

    it('renders sparse payload correctly', () => {
      const result = renderEstimateMd(sparsePayload);
      expect(result).toMatchSnapshot();
    });

    it('renders all-zero payload correctly', () => {
      const result = renderEstimateMd(allZeroPayload);
      expect(result).toMatchSnapshot();
    });
  });

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  describe('determinism', () => {
    it('produces identical output when called twice with the same input', () => {
      const result1 = renderEstimateMd(flatQuantityPayload);
      const result2 = renderEstimateMd(flatQuantityPayload);
      expect(result1).toBe(result2);
    });

    it('produces identical output for sparse payload on repeated calls', () => {
      const result1 = renderEstimateMd(sparsePayload);
      const result2 = renderEstimateMd(sparsePayload);
      expect(result1).toBe(result2);
    });
  });

  // ---------------------------------------------------------------------------
  // Metadata block
  // ---------------------------------------------------------------------------

  describe('metadata block', () => {
    it('emits exactly one metadata block at the end', () => {
      const result = renderEstimateMd(flatQuantityPayload);
      const metadataMatches = result.match(/<!-- contract-metadata/g);
      expect(metadataMatches).toHaveLength(1);
    });

    it('contains schemaVersion and rendererVersion', () => {
      const result = renderEstimateMd(flatQuantityPayload);
      expect(result).toContain('schemaVersion: v1.0.0');
      expect(result).toContain('rendererVersion: v1.0.0');
    });

    it('metadata block is the last content in the output', () => {
      const result = renderEstimateMd(flatQuantityPayload);
      expect(result).toMatch(/<!-- contract-metadata\nschemaVersion: v1\.0\.0\nrendererVersion: v1\.0\.0\n-->\n$/);
    });
  });

  // ---------------------------------------------------------------------------
  // Year sections
  // ---------------------------------------------------------------------------

  describe('year sections', () => {
    it('emits Year 1 through Year 5 headings', () => {
      const result = renderEstimateMd(flatQuantityPayload);
      expect(result).toContain('## Year 1 — starting January 2024');
      expect(result).toContain('## Year 2 — starting January 2025');
      expect(result).toContain('## Year 3 — starting January 2026');
      expect(result).toContain('## Year 4 — starting January 2027');
      expect(result).toContain('## Year 5 — starting January 2028');
    });

    it('emits placeholder for empty year groups', () => {
      const result = renderEstimateMd(allZeroPayload);
      // All 5 years should have the placeholder
      const placeholderMatches = result.match(/_No resources in this year\._/g);
      expect(placeholderMatches).toHaveLength(5);
    });

    it('emits table headers for non-empty year groups', () => {
      const result = renderEstimateMd(flatQuantityPayload);
      const tableHeaderMatches = result.match(/\| Service \| Configuration \| Quantity \|/g);
      expect(tableHeaderMatches).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Totality
  // ---------------------------------------------------------------------------

  describe('totality', () => {
    it('does not throw on a payload with no line items', () => {
      const emptyPayload = makePayload({ lineItems: [] });
      expect(() => renderEstimateMd(emptyPayload)).not.toThrow();
    });

    it('does not throw on all-zero payload', () => {
      expect(() => renderEstimateMd(allZeroPayload)).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// formatConfig tests
// ---------------------------------------------------------------------------

describe('formatConfig', () => {
  describe('key sorting', () => {
    it('sorts keys alphabetically for determinism', () => {
      const config = { zebra: 'z', alpha: 'a', middle: 'm' };
      const result = formatConfig(config);
      expect(result).toBe('alpha: a, middle: m, zebra: z');
    });

    it('produces identical output regardless of insertion order', () => {
      const config1 = { b: 2, a: 1, c: 3 };
      const config2 = { a: 1, c: 3, b: 2 };
      expect(formatConfig(config1)).toBe(formatConfig(config2));
    });
  });

  describe('pipe character escaping', () => {
    it('escapes pipe characters in string values', () => {
      const config = { name: 'foo|bar' };
      const result = formatConfig(config);
      expect(result).toBe('name: foo\\|bar');
      // The raw pipe is escaped — no unescaped pipe followed by 'b'
      expect(result).not.toMatch(/(?<!\\)\|b/);
    });

    it('escapes pipe characters in keys rendered as part of the output', () => {
      const config = { 'key|with|pipes': 'value' };
      const result = formatConfig(config);
      expect(result).toContain('\\|');
    });
  });

  describe('newline escaping', () => {
    it('replaces newlines with spaces', () => {
      const config = { description: 'line1\nline2' };
      const result = formatConfig(config);
      expect(result).toBe('description: line1 line2');
      expect(result).not.toContain('\n');
    });
  });

  describe('value types', () => {
    it('renders numbers directly', () => {
      const config = { count: 42 };
      expect(formatConfig(config)).toBe('count: 42');
    });

    it('renders booleans directly', () => {
      const config = { enabled: true };
      expect(formatConfig(config)).toBe('enabled: true');
    });

    it('renders null as null', () => {
      const config = { value: null };
      expect(formatConfig(config)).toBe('value: null');
    });

    it('renders nested objects with JSON.stringify', () => {
      const config = { nested: { inner: 'val' } };
      const result = formatConfig(config);
      expect(result).toContain('nested:');
      expect(result).toContain('"inner"');
    });

    it('renders arrays with JSON.stringify', () => {
      const config = { items: [1, 2, 3] };
      const result = formatConfig(config);
      expect(result).toBe('items: [1,2,3]');
    });
  });
});

// ---------------------------------------------------------------------------
// renderArchitectureMd tests
// ---------------------------------------------------------------------------

describe('renderArchitectureMd', () => {
  // Helper to create an architecture revision fixture
  function makeArchRev(overrides: Partial<ArchitectureRevision> = {}): ArchitectureRevision {
    return {
      id: 'arch-rev-001',
      estimateId: 'est-001',
      mermaidSource: 'graph TD\n  A[Start] --> B[End]',
      agentCommentary: 'This architecture uses a simple flow.',
      generationReason: 'initial',
      promptMetadata: null,
      createdAt: '2024-01-01T00:00:00Z',
      ...overrides,
    };
  }

  // Payload with a pinned architecture revision ID
  const archPayload = makePayload({
    id: 'est-arch-001',
    name: 'Architecture Test Estimate',
    pinnedArchitectureRevisionId: 'arch-rev-001',
  });

  // ---------------------------------------------------------------------------
  // Snapshot tests
  // ---------------------------------------------------------------------------

  describe('snapshot tests', () => {
    it('renders correctly with commentary present', () => {
      const archRev = makeArchRev({
        agentCommentary: 'This architecture uses a simple flow from start to end.',
      });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toMatchSnapshot();
    });

    it('renders correctly with commentary absent (null)', () => {
      const archRev = makeArchRev({ agentCommentary: null });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toMatchSnapshot();
    });

    it('renders correctly with commentary as empty string (no Commentary section)', () => {
      const archRev = makeArchRev({ agentCommentary: '' });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toMatchSnapshot();
    });
  });

  // ---------------------------------------------------------------------------
  // Mismatch throws ContractInvariantError
  // ---------------------------------------------------------------------------

  describe('mismatch check', () => {
    it('throws ContractInvariantError when archRev.id !== payload.pinnedArchitectureRevisionId', () => {
      const mismatchedRev = makeArchRev({ id: 'wrong-id' });
      expect(() => renderArchitectureMd(archPayload, mismatchedRev)).toThrow(
        ContractInvariantError,
      );
    });

    it('includes both IDs in the error message', () => {
      const mismatchedRev = makeArchRev({ id: 'wrong-id' });
      expect(() => renderArchitectureMd(archPayload, mismatchedRev)).toThrow(
        /expected 'arch-rev-001' but got 'wrong-id'/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------

  describe('determinism', () => {
    it('produces identical output when called twice with the same input', () => {
      const archRev = makeArchRev();
      const result1 = renderArchitectureMd(archPayload, archRev);
      const result2 = renderArchitectureMd(archPayload, archRev);
      expect(result1).toBe(result2);
    });
  });

  // ---------------------------------------------------------------------------
  // Metadata block
  // ---------------------------------------------------------------------------

  describe('metadata block', () => {
    it('contains architectureRevisionId', () => {
      const archRev = makeArchRev();
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toContain('architectureRevisionId: arch-rev-001');
    });

    it('contains schemaVersion and rendererVersion', () => {
      const archRev = makeArchRev();
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toContain('schemaVersion: v1.0.0');
      expect(result).toContain('rendererVersion: v1.0.0');
    });

    it('metadata block is the last content in the output', () => {
      const archRev = makeArchRev();
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toMatch(
        /<!-- contract-metadata\nschemaVersion: v1\.0\.0\nrendererVersion: v1\.0\.0\narchitectureRevisionId: arch-rev-001\n-->\n$/,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Mermaid block
  // ---------------------------------------------------------------------------

  describe('mermaid block', () => {
    it('contains exact mermaidSource content', () => {
      const mermaidSource = 'graph LR\n  X[Input] --> Y[Process] --> Z[Output]';
      const archRev = makeArchRev({ mermaidSource });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toContain('```mermaid\n' + mermaidSource + '\n```');
    });
  });

  // ---------------------------------------------------------------------------
  // Commentary section behavior
  // ---------------------------------------------------------------------------

  describe('commentary section', () => {
    it('emits Commentary section when agentCommentary is non-empty', () => {
      const archRev = makeArchRev({ agentCommentary: 'Some commentary.' });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).toContain('## Commentary\n\nSome commentary.\n');
    });

    it('does NOT emit Commentary section when agentCommentary is null', () => {
      const archRev = makeArchRev({ agentCommentary: null });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).not.toContain('## Commentary');
    });

    it('does NOT emit Commentary section when agentCommentary is empty string', () => {
      const archRev = makeArchRev({ agentCommentary: '' });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).not.toContain('## Commentary');
    });

    it('does NOT emit Commentary section when agentCommentary is whitespace only', () => {
      const archRev = makeArchRev({ agentCommentary: '   \n\t  ' });
      const result = renderArchitectureMd(archPayload, archRev);
      expect(result).not.toContain('## Commentary');
    });
  });
});
