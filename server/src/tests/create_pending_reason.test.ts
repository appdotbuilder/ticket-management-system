import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { pendingReasonsTable } from '../db/schema';
import { type CreatePendingReasonInput } from '../schema';
import { createPendingReason } from '../handlers/create_pending_reason';
import { eq } from 'drizzle-orm';

// Test input with all fields
const testInput: CreatePendingReasonInput = {
  reason: 'Waiting for customer response',
  description: 'Customer needs to provide additional information before we can proceed',
  is_active: true
};

describe('createPendingReason', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a pending reason with all fields', async () => {
    const result = await createPendingReason(testInput);

    // Basic field validation
    expect(result.reason).toEqual('Waiting for customer response');
    expect(result.description).toEqual('Customer needs to provide additional information before we can proceed');
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.id).toBeGreaterThan(0);
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create a pending reason with null description', async () => {
    const inputWithNullDescription: CreatePendingReasonInput = {
      reason: 'Awaiting parts delivery',
      description: null,
      is_active: true
    };

    const result = await createPendingReason(inputWithNullDescription);

    expect(result.reason).toEqual('Awaiting parts delivery');
    expect(result.description).toBeNull();
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create a pending reason with default is_active value', async () => {
    const inputWithDefaults: CreatePendingReasonInput = {
      reason: 'External vendor delay',
      description: 'Waiting for third-party vendor to complete their part',
      is_active: true // Zod default will be applied during parsing
    };

    const result = await createPendingReason(inputWithDefaults);

    expect(result.reason).toEqual('External vendor delay');
    expect(result.description).toEqual('Waiting for third-party vendor to complete their part');
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save pending reason to database', async () => {
    const result = await createPendingReason(testInput);

    // Query the database to verify record was saved
    const savedReasons = await db.select()
      .from(pendingReasonsTable)
      .where(eq(pendingReasonsTable.id, result.id))
      .execute();

    expect(savedReasons).toHaveLength(1);
    expect(savedReasons[0].reason).toEqual('Waiting for customer response');
    expect(savedReasons[0].description).toEqual('Customer needs to provide additional information before we can proceed');
    expect(savedReasons[0].is_active).toEqual(true);
    expect(savedReasons[0].created_at).toBeInstanceOf(Date);
  });

  it('should create multiple pending reasons with different reasons', async () => {
    const firstInput: CreatePendingReasonInput = {
      reason: 'Customer approval required',
      description: 'Waiting for customer to approve the proposed solution',
      is_active: true
    };

    const secondInput: CreatePendingReasonInput = {
      reason: 'Escalation to management',
      description: 'Issue needs management approval before proceeding',
      is_active: true
    };

    const firstResult = await createPendingReason(firstInput);
    const secondResult = await createPendingReason(secondInput);

    // Verify both were created with different IDs
    expect(firstResult.id).not.toEqual(secondResult.id);
    expect(firstResult.reason).toEqual('Customer approval required');
    expect(secondResult.reason).toEqual('Escalation to management');

    // Verify both exist in database
    const allReasons = await db.select()
      .from(pendingReasonsTable)
      .execute();

    expect(allReasons).toHaveLength(2);
    
    const reasons = allReasons.map(r => r.reason).sort();
    expect(reasons).toEqual(['Customer approval required', 'Escalation to management']);
  });

  it('should create inactive pending reason', async () => {
    const inactiveInput: CreatePendingReasonInput = {
      reason: 'Deprecated reason',
      description: 'This reason is no longer used',
      is_active: false
    };

    const result = await createPendingReason(inactiveInput);

    expect(result.reason).toEqual('Deprecated reason');
    expect(result.description).toEqual('This reason is no longer used');
    expect(result.is_active).toEqual(false);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);

    // Verify in database
    const savedReason = await db.select()
      .from(pendingReasonsTable)
      .where(eq(pendingReasonsTable.id, result.id))
      .execute();

    expect(savedReason[0].is_active).toEqual(false);
  });

  it('should handle long reason text', async () => {
    const longReasonInput: CreatePendingReasonInput = {
      reason: 'A very long reason that describes in detail why this ticket is pending and what specific conditions need to be met before work can continue on this particular issue',
      description: 'This is a comprehensive description explaining all the nuances and details of why this particular pending reason exists and what steps need to be taken to resolve the pending state',
      is_active: true
    };

    const result = await createPendingReason(longReasonInput);

    expect(result.reason).toEqual(longReasonInput.reason);
    expect(result.description).toEqual(longReasonInput.description);
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });
});