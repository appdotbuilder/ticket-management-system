import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { closingReasonsTable } from '../db/schema';
import { type CreateClosingReasonInput } from '../schema';
import { getClosingReasons } from '../handlers/get_closing_reasons';
import { eq } from 'drizzle-orm';

describe('getClosingReasons', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no closing reasons exist', async () => {
    const result = await getClosingReasons();
    expect(result).toEqual([]);
  });

  it('should return all active closing reasons', async () => {
    // Create test data
    await db.insert(closingReasonsTable)
      .values([
        {
          reason: 'Issue Resolved',
          description: 'The customer issue has been resolved successfully',
          is_active: true
        },
        {
          reason: 'Duplicate Ticket',
          description: 'This ticket is a duplicate of another ticket',
          is_active: true
        },
        {
          reason: 'Customer Request',
          description: 'Customer requested to close the ticket',
          is_active: true
        }
      ])
      .execute();

    const result = await getClosingReasons();

    expect(result).toHaveLength(3);
    
    // Verify all returned reasons are active
    result.forEach(reason => {
      expect(reason.is_active).toBe(true);
      expect(reason.id).toBeDefined();
      expect(reason.created_at).toBeInstanceOf(Date);
    });

    // Check specific reasons exist
    const reasons = result.map(r => r.reason);
    expect(reasons).toContain('Issue Resolved');
    expect(reasons).toContain('Duplicate Ticket');
    expect(reasons).toContain('Customer Request');
  });

  it('should not return inactive closing reasons', async () => {
    // Create mix of active and inactive reasons
    await db.insert(closingReasonsTable)
      .values([
        {
          reason: 'Active Reason',
          description: 'This is an active reason',
          is_active: true
        },
        {
          reason: 'Inactive Reason 1',
          description: 'This reason is inactive',
          is_active: false
        },
        {
          reason: 'Inactive Reason 2',
          description: 'Another inactive reason',
          is_active: false
        }
      ])
      .execute();

    const result = await getClosingReasons();

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('Active Reason');
    expect(result[0].is_active).toBe(true);
  });

  it('should return closing reasons with correct data types', async () => {
    await db.insert(closingReasonsTable)
      .values({
        reason: 'Test Reason',
        description: 'Test description',
        is_active: true
      })
      .execute();

    const result = await getClosingReasons();

    expect(result).toHaveLength(1);
    const reason = result[0];

    expect(typeof reason.id).toBe('number');
    expect(typeof reason.reason).toBe('string');
    expect(typeof reason.description).toBe('string');
    expect(typeof reason.is_active).toBe('boolean');
    expect(reason.created_at).toBeInstanceOf(Date);
  });

  it('should handle null description correctly', async () => {
    await db.insert(closingReasonsTable)
      .values({
        reason: 'Reason Without Description',
        description: null,
        is_active: true
      })
      .execute();

    const result = await getClosingReasons();

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('Reason Without Description');
    expect(result[0].description).toBeNull();
  });

  it('should verify data is properly saved in database', async () => {
    // Insert test data
    await db.insert(closingReasonsTable)
      .values({
        reason: 'Database Test Reason',
        description: 'Testing database storage',
        is_active: true
      })
      .execute();

    // Get via handler
    const handlerResult = await getClosingReasons();

    // Verify via direct database query
    const dbResult = await db.select()
      .from(closingReasonsTable)
      .where(eq(closingReasonsTable.is_active, true))
      .execute();

    expect(handlerResult).toHaveLength(1);
    expect(dbResult).toHaveLength(1);
    expect(handlerResult[0].reason).toBe(dbResult[0].reason);
    expect(handlerResult[0].description).toBe(dbResult[0].description);
    expect(handlerResult[0].is_active).toBe(dbResult[0].is_active);
  });
});