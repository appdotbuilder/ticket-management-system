import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { customersTable } from '../db/schema';
import { type CreateCustomerInput } from '../schema';
import { createCustomer } from '../handlers/create_customer';
import { eq } from 'drizzle-orm';

// Complete test input with all required fields
const testInput: CreateCustomerInput = {
  name: 'Test Customer',
  email: 'test@example.com',
  phone: '+1-555-0123',
  address: '123 Test Street, Test City, TC 12345',
  company: 'Test Company Inc.',
  sla_hours: 24,
  is_active: true
};

describe('createCustomer', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a customer with all fields', async () => {
    const result = await createCustomer(testInput);

    // Verify all fields are correctly set
    expect(result.name).toEqual('Test Customer');
    expect(result.email).toEqual('test@example.com');
    expect(result.phone).toEqual('+1-555-0123');
    expect(result.address).toEqual('123 Test Street, Test City, TC 12345');
    expect(result.company).toEqual('Test Company Inc.');
    expect(result.sla_hours).toEqual(24);
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a customer with minimal required fields', async () => {
    const minimalInput: CreateCustomerInput = {
      name: 'Minimal Customer',
      email: 'minimal@example.com',
      phone: null,
      address: null,
      company: null,
      sla_hours: 48,
      is_active: true
    };

    const result = await createCustomer(minimalInput);

    expect(result.name).toEqual('Minimal Customer');
    expect(result.email).toEqual('minimal@example.com');
    expect(result.phone).toBeNull();
    expect(result.address).toBeNull();
    expect(result.company).toBeNull();
    expect(result.sla_hours).toEqual(48);
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
  });

  it('should save customer to database correctly', async () => {
    const result = await createCustomer(testInput);

    // Query the database to verify the record was saved
    const customers = await db.select()
      .from(customersTable)
      .where(eq(customersTable.id, result.id))
      .execute();

    expect(customers).toHaveLength(1);
    const savedCustomer = customers[0];
    
    expect(savedCustomer.name).toEqual('Test Customer');
    expect(savedCustomer.email).toEqual('test@example.com');
    expect(savedCustomer.phone).toEqual('+1-555-0123');
    expect(savedCustomer.address).toEqual('123 Test Street, Test City, TC 12345');
    expect(savedCustomer.company).toEqual('Test Company Inc.');
    expect(savedCustomer.sla_hours).toEqual(24);
    expect(savedCustomer.is_active).toEqual(true);
    expect(savedCustomer.created_at).toBeInstanceOf(Date);
    expect(savedCustomer.updated_at).toBeInstanceOf(Date);
  });

  it('should handle different SLA configurations', async () => {
    const testCases = [
      { sla_hours: 4, description: '4 hour SLA' },
      { sla_hours: 8, description: '8 hour SLA' },
      { sla_hours: 24, description: '24 hour SLA' },
      { sla_hours: 72, description: '72 hour SLA' }
    ];

    for (const testCase of testCases) {
      const input: CreateCustomerInput = {
        ...testInput,
        email: `sla${testCase.sla_hours}@example.com`,
        name: `Customer ${testCase.description}`,
        sla_hours: testCase.sla_hours
      };

      const result = await createCustomer(input);
      expect(result.sla_hours).toEqual(testCase.sla_hours);
      expect(result.name).toEqual(`Customer ${testCase.description}`);
    }
  });

  it('should handle inactive customers', async () => {
    const inactiveInput: CreateCustomerInput = {
      ...testInput,
      email: 'inactive@example.com',
      is_active: false
    };

    const result = await createCustomer(inactiveInput);
    
    expect(result.is_active).toEqual(false);
    expect(result.name).toEqual(testInput.name);
    expect(result.email).toEqual('inactive@example.com');
  });

  it('should apply Zod default for is_active when not specified', async () => {
    // Test with input that doesn't explicitly set is_active (should default to true)
    const inputWithoutActive = {
      name: 'Default Active Customer',
      email: 'default@example.com',
      phone: null,
      address: null,  
      company: null,
      sla_hours: 24
      // is_active not specified - should default to true via Zod
    } as CreateCustomerInput;

    const result = await createCustomer(inputWithoutActive);
    expect(result.is_active).toEqual(true);
  });

  it('should reject duplicate email addresses', async () => {
    // Create first customer
    await createCustomer(testInput);

    // Attempt to create another customer with same email
    const duplicateInput: CreateCustomerInput = {
      ...testInput,
      name: 'Different Name'
    };

    await expect(createCustomer(duplicateInput)).rejects.toThrow(/unique/i);
  });

  it('should handle long text fields appropriately', async () => {
    const longTextInput: CreateCustomerInput = {
      name: 'A'.repeat(255), // Max length for varchar(255)
      email: 'longtext@example.com',
      phone: '+1-555-0123-ext-9999',
      address: 'A very long address that spans multiple lines and contains detailed information about the location including building number, street name, apartment or suite number, city, state, postal code, and country information that might be quite extensive',
      company: 'A'.repeat(255), // Max length for varchar(255)
      sla_hours: 168, // 1 week SLA
      is_active: true
    };

    const result = await createCustomer(longTextInput);

    expect(result.name).toEqual('A'.repeat(255));
    expect(result.address?.length).toBeGreaterThan(100);
    expect(result.company).toEqual('A'.repeat(255));
    expect(result.sla_hours).toEqual(168);
  });
});