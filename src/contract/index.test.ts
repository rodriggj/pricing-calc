/**
 * Compile-time export check for the contract module barrel.
 *
 * This test imports every promised symbol from `src/contract/index.ts` and
 * asserts they are defined at runtime. Removing any export from the barrel
 * will cause this test (and the TypeScript compiler) to fail — making
 * accidental API surface regressions a build break.
 */
import { describe, it, expect } from 'vitest';

import {
  // Validators and parsers
  EstimatePayloadSchema,
  LineItemSchema,
  PerYearGroupPayloadSchema,
  ShareUrlRevisionSchema,
  parseEstimatePayload,
  safeParseEstimatePayload,
  SERVICE_CODE_ALLOW_LIST,
  ESTIMATE_STATUSES,
  LINE_ITEM_STATUSES,

  // Error types
  ContractInvariantError,

  // Projection
  projectToPerYearGroups,

  // Markdown renderers
  renderEstimateMd,
  renderArchitectureMd,
  formatConfig,

  // State machine
  isLegalEstimateStatusTransition,
  ESTIMATE_STATUS_TRANSITIONS,

  // Audit log
  appendAuditLogEntry,

  // Version constants
  CONTRACT_SCHEMA_VERSION,
  RENDERER_VERSION,
} from './index';

// Type-only imports to verify type exports compile
import type {
  EstimatePayload,
  LineItem,
  Configuration,
  PerYearGroupPayload,
  YearGroup,
  YearGroupItem,
  ShareUrlRevision,
  ArchitectureRevision,
  EstimateStatus,
  LineItemStatus,
  AuditActionType,
  AuditLogEntryInput,
  AuditLogEntryRow,
} from './index';

describe('Contract module barrel exports', () => {
  it('exports all validator schemas', () => {
    expect(EstimatePayloadSchema).toBeDefined();
    expect(LineItemSchema).toBeDefined();
    expect(PerYearGroupPayloadSchema).toBeDefined();
    expect(ShareUrlRevisionSchema).toBeDefined();
  });

  it('exports parser functions', () => {
    expect(typeof parseEstimatePayload).toBe('function');
    expect(typeof safeParseEstimatePayload).toBe('function');
  });

  it('exports constants', () => {
    expect(SERVICE_CODE_ALLOW_LIST).toHaveLength(6);
    expect(ESTIMATE_STATUSES).toHaveLength(8);
    expect(LINE_ITEM_STATUSES).toHaveLength(4);
    expect(CONTRACT_SCHEMA_VERSION).toBe('v1.0.0');
    expect(RENDERER_VERSION).toBe('v1.0.0');
  });

  it('exports ContractInvariantError', () => {
    expect(ContractInvariantError).toBeDefined();
    const err = new ContractInvariantError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('exports projection function', () => {
    expect(typeof projectToPerYearGroups).toBe('function');
  });

  it('exports markdown renderers', () => {
    expect(typeof renderEstimateMd).toBe('function');
    expect(typeof renderArchitectureMd).toBe('function');
    expect(typeof formatConfig).toBe('function');
  });

  it('exports state machine predicate and table', () => {
    expect(typeof isLegalEstimateStatusTransition).toBe('function');
    expect(ESTIMATE_STATUS_TRANSITIONS).toBeDefined();
    expect(Object.keys(ESTIMATE_STATUS_TRANSITIONS)).toHaveLength(8);
  });

  it('exports audit log helper', () => {
    expect(typeof appendAuditLogEntry).toBe('function');
  });

  // Type-level assertions (these just need to compile — no runtime check needed)
  it('type exports compile correctly', () => {
    // These assignments verify the types are importable and usable.
    // They will cause a compile error if any type is removed from the barrel.
    const _status: EstimateStatus = 'DRAFT';
    const _lineItemStatus: LineItemStatus = 'PENDING';
    const _actionType: AuditActionType = 'VIEWED';

    // Suppress unused variable warnings
    expect(_status).toBe('DRAFT');
    expect(_lineItemStatus).toBe('PENDING');
    expect(_actionType).toBe('VIEWED');

    // Verify type compatibility (compile-time only, runtime is trivial)
    const _config: Configuration = { key: 'value' };
    expect(_config).toBeDefined();
  });
});
