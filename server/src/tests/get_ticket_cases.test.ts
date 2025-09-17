import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ticketCasesTable } from '../db/schema';
import { type CreateTicketCaseInput } from '../schema';
import { getTicketCases } from '../handlers/get_ticket_cases';

// Test data for ticket cases
const activeCase1: CreateTicketCaseInput = {
  name: 'Hardware Issue',
  description: 'Issues related to hardware components',
  is_active: true
};

const activeCase2: CreateTicketCaseInput = {
  name: 'Software Bug',
  description: 'Software-related bugs and issues',
  is_active: true
};

const inactiveCase: CreateTicketCaseInput = {
  name: 'Legacy System',
  description: 'Deprecated legacy system issues',
  is_active: false
};

describe('getTicketCases', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no ticket cases exist', async () => {
    const result = await getTicketCases();

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return all active ticket cases', async () => {
    // Create test data
    await db.insert(ticketCasesTable)
      .values([activeCase1, activeCase2, inactiveCase])
      .execute();

    const result = await getTicketCases();

    expect(result).toHaveLength(2);
    
    // Verify only active cases are returned
    result.forEach(ticketCase => {
      expect(ticketCase.is_active).toBe(true);
    });

    // Check specific case details
    const hardwareCase = result.find(c => c.name === 'Hardware Issue');
    expect(hardwareCase).toBeDefined();
    expect(hardwareCase?.description).toEqual('Issues related to hardware components');
    expect(hardwareCase?.id).toBeDefined();
    expect(hardwareCase?.created_at).toBeInstanceOf(Date);

    const softwareCase = result.find(c => c.name === 'Software Bug');
    expect(softwareCase).toBeDefined();
    expect(softwareCase?.description).toEqual('Software-related bugs and issues');
  });

  it('should return ticket cases ordered by name', async () => {
    // Create cases with names that will test alphabetical ordering
    const cases: CreateTicketCaseInput[] = [
      { name: 'Zebra System', description: 'Z system', is_active: true },
      { name: 'Alpha Network', description: 'A network', is_active: true },
      { name: 'Beta Security', description: 'B security', is_active: true }
    ];

    await db.insert(ticketCasesTable)
      .values(cases)
      .execute();

    const result = await getTicketCases();

    expect(result).toHaveLength(3);
    expect(result[0].name).toEqual('Alpha Network');
    expect(result[1].name).toEqual('Beta Security');
    expect(result[2].name).toEqual('Zebra System');
  });

  it('should exclude inactive ticket cases', async () => {
    // Create mix of active and inactive cases
    const testCases: CreateTicketCaseInput[] = [
      { name: 'Active Case 1', description: 'Active case', is_active: true },
      { name: 'Inactive Case 1', description: 'Inactive case', is_active: false },
      { name: 'Active Case 2', description: 'Another active case', is_active: true },
      { name: 'Inactive Case 2', description: 'Another inactive case', is_active: false }
    ];

    await db.insert(ticketCasesTable)
      .values(testCases)
      .execute();

    const result = await getTicketCases();

    expect(result).toHaveLength(2);
    result.forEach(ticketCase => {
      expect(ticketCase.is_active).toBe(true);
      expect(ticketCase.name.startsWith('Active')).toBe(true);
    });
  });

  it('should return ticket cases with all required fields', async () => {
    await db.insert(ticketCasesTable)
      .values(activeCase1)
      .execute();

    const result = await getTicketCases();

    expect(result).toHaveLength(1);
    const ticketCase = result[0];

    // Verify all schema fields are present
    expect(typeof ticketCase.id).toBe('number');
    expect(typeof ticketCase.name).toBe('string');
    expect(typeof ticketCase.description).toBe('string');
    expect(typeof ticketCase.is_active).toBe('boolean');
    expect(ticketCase.created_at).toBeInstanceOf(Date);

    expect(ticketCase.name).toEqual('Hardware Issue');
    expect(ticketCase.description).toEqual('Issues related to hardware components');
    expect(ticketCase.is_active).toBe(true);
  });

  it('should handle ticket cases with null descriptions', async () => {
    const caseWithNullDesc: CreateTicketCaseInput = {
      name: 'Minimal Case',
      description: null,
      is_active: true
    };

    await db.insert(ticketCasesTable)
      .values(caseWithNullDesc)
      .execute();

    const result = await getTicketCases();

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Minimal Case');
    expect(result[0].description).toBeNull();
    expect(result[0].is_active).toBe(true);
  });
});