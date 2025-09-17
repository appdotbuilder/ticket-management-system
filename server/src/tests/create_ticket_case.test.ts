import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ticketCasesTable } from '../db/schema';
import { type CreateTicketCaseInput } from '../schema';
import { createTicketCase } from '../handlers/create_ticket_case';
import { eq } from 'drizzle-orm';

// Test input with all fields
const testInput: CreateTicketCaseInput = {
  name: 'Hardware Issue',
  description: 'Cases related to hardware problems and failures',
  is_active: true
};

describe('createTicketCase', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a ticket case with all fields', async () => {
    const result = await createTicketCase(testInput);

    // Basic field validation
    expect(result.name).toEqual('Hardware Issue');
    expect(result.description).toEqual('Cases related to hardware problems and failures');
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should create a ticket case with minimal fields', async () => {
    const minimalInput: CreateTicketCaseInput = {
      name: 'Software Issue',
      description: null,
      is_active: true
    };

    const result = await createTicketCase(minimalInput);

    expect(result.name).toEqual('Software Issue');
    expect(result.description).toBeNull();
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should apply default values correctly', async () => {
    const inputWithDefaults: CreateTicketCaseInput = {
      name: 'Network Issue',
      description: 'Network connectivity problems',
      // is_active will default to true via Zod
      is_active: true
    };

    const result = await createTicketCase(inputWithDefaults);

    expect(result.name).toEqual('Network Issue');
    expect(result.description).toEqual('Network connectivity problems');
    expect(result.is_active).toEqual(true);
  });

  it('should save ticket case to database', async () => {
    const result = await createTicketCase(testInput);

    // Query using proper drizzle syntax
    const ticketCases = await db.select()
      .from(ticketCasesTable)
      .where(eq(ticketCasesTable.id, result.id))
      .execute();

    expect(ticketCases).toHaveLength(1);
    expect(ticketCases[0].name).toEqual('Hardware Issue');
    expect(ticketCases[0].description).toEqual('Cases related to hardware problems and failures');
    expect(ticketCases[0].is_active).toEqual(true);
    expect(ticketCases[0].created_at).toBeInstanceOf(Date);
  });

  it('should create multiple distinct ticket cases', async () => {
    const input1: CreateTicketCaseInput = {
      name: 'Security Issue',
      description: 'Security related incidents',
      is_active: true
    };

    const input2: CreateTicketCaseInput = {
      name: 'Performance Issue',
      description: 'System performance problems',
      is_active: false
    };

    const result1 = await createTicketCase(input1);
    const result2 = await createTicketCase(input2);

    // Verify both were created with different IDs
    expect(result1.id).not.toEqual(result2.id);
    expect(result1.name).toEqual('Security Issue');
    expect(result1.is_active).toEqual(true);
    expect(result2.name).toEqual('Performance Issue');
    expect(result2.is_active).toEqual(false);

    // Verify both exist in database
    const allTicketCases = await db.select()
      .from(ticketCasesTable)
      .execute();

    expect(allTicketCases).toHaveLength(2);
  });

  it('should handle inactive ticket cases', async () => {
    const inactiveInput: CreateTicketCaseInput = {
      name: 'Deprecated Case',
      description: 'Old case type no longer used',
      is_active: false
    };

    const result = await createTicketCase(inactiveInput);

    expect(result.name).toEqual('Deprecated Case');
    expect(result.is_active).toEqual(false);
    expect(result.id).toBeDefined();
  });

  it('should handle long descriptions', async () => {
    const longDescription = 'This is a very long description that contains detailed information about the ticket case category and explains various scenarios where this case type would be applicable. It should be stored properly in the database without any truncation issues.';

    const longDescInput: CreateTicketCaseInput = {
      name: 'Complex Case',
      description: longDescription,
      is_active: true
    };

    const result = await createTicketCase(longDescInput);

    expect(result.description).toEqual(longDescription);
    expect(result.name).toEqual('Complex Case');

    // Verify in database
    const savedCase = await db.select()
      .from(ticketCasesTable)
      .where(eq(ticketCasesTable.id, result.id))
      .execute();

    expect(savedCase[0].description).toEqual(longDescription);
  });
});