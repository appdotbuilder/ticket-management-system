import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { pendingReasonsTable } from '../db/schema';
import { getPendingReasons } from '../handlers/get_pending_reasons';

describe('getPendingReasons', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no pending reasons exist', async () => {
    const result = await getPendingReasons();
    expect(result).toEqual([]);
  });

  it('should return all active pending reasons', async () => {
    // Create test pending reasons
    await db.insert(pendingReasonsTable)
      .values([
        {
          reason: 'Waiting for customer response',
          description: 'Customer needs to provide additional information',
          is_active: true
        },
        {
          reason: 'Waiting for third-party',
          description: 'Waiting for external vendor response',
          is_active: true
        },
        {
          reason: 'Parts on order',
          description: 'Required parts have been ordered',
          is_active: true
        }
      ])
      .execute();

    const result = await getPendingReasons();

    expect(result).toHaveLength(3);
    expect(result[0].reason).toEqual('Parts on order');
    expect(result[1].reason).toEqual('Waiting for customer response');
    expect(result[2].reason).toEqual('Waiting for third-party');
    
    // Verify all returned reasons are active
    result.forEach(reason => {
      expect(reason.is_active).toBe(true);
      expect(reason.id).toBeDefined();
      expect(reason.created_at).toBeInstanceOf(Date);
    });
  });

  it('should not return inactive pending reasons', async () => {
    // Create both active and inactive pending reasons
    await db.insert(pendingReasonsTable)
      .values([
        {
          reason: 'Active reason',
          description: 'This should be returned',
          is_active: true
        },
        {
          reason: 'Inactive reason',
          description: 'This should not be returned',
          is_active: false
        },
        {
          reason: 'Another active reason',
          description: 'This should also be returned',
          is_active: true
        }
      ])
      .execute();

    const result = await getPendingReasons();

    expect(result).toHaveLength(2);
    expect(result.map(r => r.reason)).toEqual(['Active reason', 'Another active reason']);
    
    // Verify no inactive reasons are returned
    result.forEach(reason => {
      expect(reason.is_active).toBe(true);
    });
  });

  it('should return pending reasons ordered by reason name', async () => {
    // Create pending reasons in random order
    await db.insert(pendingReasonsTable)
      .values([
        {
          reason: 'Zebra reason',
          description: 'Should be last',
          is_active: true
        },
        {
          reason: 'Alpha reason',
          description: 'Should be first',
          is_active: true
        },
        {
          reason: 'Beta reason',
          description: 'Should be middle',
          is_active: true
        }
      ])
      .execute();

    const result = await getPendingReasons();

    expect(result).toHaveLength(3);
    expect(result[0].reason).toEqual('Alpha reason');
    expect(result[1].reason).toEqual('Beta reason');
    expect(result[2].reason).toEqual('Zebra reason');
  });

  it('should handle pending reasons with null descriptions', async () => {
    await db.insert(pendingReasonsTable)
      .values([
        {
          reason: 'Reason without description',
          description: null,
          is_active: true
        },
        {
          reason: 'Reason with description',
          description: 'Has a description',
          is_active: true
        }
      ])
      .execute();

    const result = await getPendingReasons();

    expect(result).toHaveLength(2);
    
    const reasonWithoutDesc = result.find(r => r.reason === 'Reason without description');
    const reasonWithDesc = result.find(r => r.reason === 'Reason with description');

    expect(reasonWithoutDesc?.description).toBeNull();
    expect(reasonWithDesc?.description).toEqual('Has a description');
  });

  it('should return all required fields for each pending reason', async () => {
    await db.insert(pendingReasonsTable)
      .values({
        reason: 'Test reason',
        description: 'Test description',
        is_active: true
      })
      .execute();

    const result = await getPendingReasons();

    expect(result).toHaveLength(1);
    const pendingReason = result[0];

    expect(pendingReason).toHaveProperty('id');
    expect(pendingReason).toHaveProperty('reason');
    expect(pendingReason).toHaveProperty('description');
    expect(pendingReason).toHaveProperty('is_active');
    expect(pendingReason).toHaveProperty('created_at');

    expect(typeof pendingReason.id).toBe('number');
    expect(typeof pendingReason.reason).toBe('string');
    expect(typeof pendingReason.is_active).toBe('boolean');
    expect(pendingReason.created_at).toBeInstanceOf(Date);
  });
});