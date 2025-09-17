import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { closingReasonsTable } from '../db/schema';
import { type CreateClosingReasonInput } from '../schema';
import { createClosingReason } from '../handlers/create_closing_reason';
import { eq } from 'drizzle-orm';

// Simple test input with explicit values
const testInput: CreateClosingReasonInput = {
  reason: 'Issue Resolved',
  description: 'The reported issue has been successfully resolved',
  is_active: true
};

describe('createClosingReason', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a closing reason with all fields', async () => {
    const result = await createClosingReason(testInput);

    // Verify all fields are properly set
    expect(result.reason).toEqual('Issue Resolved');
    expect(result.description).toEqual('The reported issue has been successfully resolved');
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save closing reason to database', async () => {
    const result = await createClosingReason(testInput);

    // Query the database to verify record was created
    const closingReasons = await db.select()
      .from(closingReasonsTable)
      .where(eq(closingReasonsTable.id, result.id))
      .execute();

    expect(closingReasons).toHaveLength(1);
    expect(closingReasons[0].reason).toEqual('Issue Resolved');
    expect(closingReasons[0].description).toEqual('The reported issue has been successfully resolved');
    expect(closingReasons[0].is_active).toEqual(true);
    expect(closingReasons[0].created_at).toBeInstanceOf(Date);
  });

  it('should create closing reason with null description', async () => {
    const inputWithNullDescription: CreateClosingReasonInput = {
      reason: 'Duplicate Request',
      description: null,
      is_active: true
    };

    const result = await createClosingReason(inputWithNullDescription);

    expect(result.reason).toEqual('Duplicate Request');
    expect(result.description).toBeNull();
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
  });

  it('should create inactive closing reason', async () => {
    const inactiveInput: CreateClosingReasonInput = {
      reason: 'Deprecated Reason',
      description: 'This closing reason is no longer in use',
      is_active: false
    };

    const result = await createClosingReason(inactiveInput);

    expect(result.reason).toEqual('Deprecated Reason');
    expect(result.description).toEqual('This closing reason is no longer in use');
    expect(result.is_active).toEqual(false);
    expect(result.id).toBeDefined();

    // Verify in database
    const closingReasons = await db.select()
      .from(closingReasonsTable)
      .where(eq(closingReasonsTable.id, result.id))
      .execute();

    expect(closingReasons[0].is_active).toEqual(false);
  });

  it('should use default is_active value when not provided', async () => {
    const inputWithDefaults = {
      reason: 'Customer Satisfied',
      description: 'Customer confirmed the issue is resolved'
      // is_active not provided, should use Zod default
    } as CreateClosingReasonInput;

    const result = await createClosingReason(inputWithDefaults);

    expect(result.reason).toEqual('Customer Satisfied');
    expect(result.description).toEqual('Customer confirmed the issue is resolved');
    expect(result.is_active).toEqual(true); // Should use Zod default
    expect(result.id).toBeDefined();
  });

  it('should create multiple closing reasons independently', async () => {
    const input1: CreateClosingReasonInput = {
      reason: 'Hardware Replaced',
      description: 'Faulty hardware component was replaced',
      is_active: true
    };

    const input2: CreateClosingReasonInput = {
      reason: 'Software Updated',
      description: 'Software was updated to fix the issue',
      is_active: true
    };

    const result1 = await createClosingReason(input1);
    const result2 = await createClosingReason(input2);

    // Verify both records are created with different IDs
    expect(result1.id).not.toEqual(result2.id);
    expect(result1.reason).toEqual('Hardware Replaced');
    expect(result2.reason).toEqual('Software Updated');

    // Verify both exist in database
    const allClosingReasons = await db.select()
      .from(closingReasonsTable)
      .execute();

    expect(allClosingReasons).toHaveLength(2);
  });

  it('should handle empty description correctly', async () => {
    const inputWithEmptyDescription: CreateClosingReasonInput = {
      reason: 'No Further Action Required',
      description: '',
      is_active: true
    };

    const result = await createClosingReason(inputWithEmptyDescription);

    expect(result.reason).toEqual('No Further Action Required');
    expect(result.description).toEqual('');
    expect(result.is_active).toEqual(true);
  });
});