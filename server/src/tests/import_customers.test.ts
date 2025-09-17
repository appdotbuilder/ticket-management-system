import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { customersTable } from '../db/schema';
import { type ImportCustomersInput, type CreateCustomerInput } from '../schema';
import { importCustomers } from '../handlers/import_customers';
import { eq } from 'drizzle-orm';

// Test data for multiple customers
const testCustomersInput: CreateCustomerInput[] = [
  {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    phone: '+1-555-0001',
    address: '123 Main St, New York, NY 10001',
    company: 'Tech Corp',
    sla_hours: 24,
    is_active: true
  },
  {
    name: 'Bob Smith',
    email: 'bob@example.com',
    phone: '+1-555-0002',
    address: '456 Oak Ave, Los Angeles, CA 90210',
    company: 'Design Studio',
    sla_hours: 48,
    is_active: true
  },
  {
    name: 'Carol Davis',
    email: 'carol@example.com',
    phone: null,
    address: null,
    company: null,
    sla_hours: 12,
    is_active: false
  }
];

const singleCustomerInput: ImportCustomersInput = {
  customers: [testCustomersInput[0]]
};

const multipleCustomersInput: ImportCustomersInput = {
  customers: testCustomersInput
};

describe('importCustomers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should import a single customer', async () => {
    const result = await importCustomers(singleCustomerInput);

    expect(result).toHaveLength(1);
    const customer = result[0];
    
    // Verify all fields are correctly set
    expect(customer.name).toEqual('Alice Johnson');
    expect(customer.email).toEqual('alice@example.com');
    expect(customer.phone).toEqual('+1-555-0001');
    expect(customer.address).toEqual('123 Main St, New York, NY 10001');
    expect(customer.company).toEqual('Tech Corp');
    expect(customer.sla_hours).toEqual(24);
    expect(customer.is_active).toEqual(true);
    expect(customer.id).toBeDefined();
    expect(customer.created_at).toBeInstanceOf(Date);
    expect(customer.updated_at).toBeInstanceOf(Date);
  });

  it('should import multiple customers in bulk', async () => {
    const result = await importCustomers(multipleCustomersInput);

    expect(result).toHaveLength(3);
    
    // Verify each customer was imported correctly
    const alice = result.find(c => c.email === 'alice@example.com');
    const bob = result.find(c => c.email === 'bob@example.com');
    const carol = result.find(c => c.email === 'carol@example.com');

    expect(alice).toBeDefined();
    expect(alice!.name).toEqual('Alice Johnson');
    expect(alice!.company).toEqual('Tech Corp');
    expect(alice!.sla_hours).toEqual(24);
    expect(alice!.is_active).toEqual(true);

    expect(bob).toBeDefined();
    expect(bob!.name).toEqual('Bob Smith');
    expect(bob!.company).toEqual('Design Studio');
    expect(bob!.sla_hours).toEqual(48);
    expect(bob!.is_active).toEqual(true);

    expect(carol).toBeDefined();
    expect(carol!.name).toEqual('Carol Davis');
    expect(carol!.phone).toBeNull();
    expect(carol!.address).toBeNull();
    expect(carol!.company).toBeNull();
    expect(carol!.sla_hours).toEqual(12);
    expect(carol!.is_active).toEqual(false);
  });

  it('should save all customers to database', async () => {
    const result = await importCustomers(multipleCustomersInput);

    // Query database to verify all customers were saved
    const savedCustomers = await db.select()
      .from(customersTable)
      .execute();

    expect(savedCustomers).toHaveLength(3);

    // Verify each customer exists in the database
    for (const customer of result) {
      const dbCustomer = await db.select()
        .from(customersTable)
        .where(eq(customersTable.id, customer.id))
        .execute();

      expect(dbCustomer).toHaveLength(1);
      expect(dbCustomer[0].email).toEqual(customer.email);
      expect(dbCustomer[0].name).toEqual(customer.name);
      expect(dbCustomer[0].sla_hours).toEqual(customer.sla_hours);
    }
  });

  it('should handle customers with null optional fields', async () => {
    const customersWithNulls: ImportCustomersInput = {
      customers: [
        {
          name: 'Minimal Customer',
          email: 'minimal@example.com',
          phone: null,
          address: null,
          company: null,
          sla_hours: 24,
          is_active: true
        }
      ]
    };

    const result = await importCustomers(customersWithNulls);

    expect(result).toHaveLength(1);
    const customer = result[0];
    
    expect(customer.name).toEqual('Minimal Customer');
    expect(customer.email).toEqual('minimal@example.com');
    expect(customer.phone).toBeNull();
    expect(customer.address).toBeNull();
    expect(customer.company).toBeNull();
    expect(customer.sla_hours).toEqual(24);
    expect(customer.is_active).toEqual(true);
  });

  it('should handle empty customer list', async () => {
    const emptyInput: ImportCustomersInput = {
      customers: []
    };

    const result = await importCustomers(emptyInput);

    expect(result).toHaveLength(0);

    // Verify no customers were added to database
    const dbCustomers = await db.select()
      .from(customersTable)
      .execute();

    expect(dbCustomers).toHaveLength(0);
  });

  it('should fail when importing duplicate emails', async () => {
    // First import should succeed
    await importCustomers(singleCustomerInput);

    // Second import with same email should fail
    const duplicateInput: ImportCustomersInput = {
      customers: [{
        name: 'Duplicate Alice',
        email: 'alice@example.com', // Same email as first import
        phone: '+1-555-9999',
        address: 'Different Address',
        company: 'Different Company',
        sla_hours: 12,
        is_active: true
      }]
    };

    await expect(importCustomers(duplicateInput)).rejects.toThrow(/duplicate|unique/i);
  });

  it('should preserve customer order in returned array', async () => {
    const orderedCustomers: ImportCustomersInput = {
      customers: [
        { name: 'First', email: 'first@example.com', phone: null, address: null, company: null, sla_hours: 24, is_active: true },
        { name: 'Second', email: 'second@example.com', phone: null, address: null, company: null, sla_hours: 24, is_active: true },
        { name: 'Third', email: 'third@example.com', phone: null, address: null, company: null, sla_hours: 24, is_active: true }
      ]
    };

    const result = await importCustomers(orderedCustomers);

    expect(result).toHaveLength(3);
    // The order should be preserved as PostgreSQL maintains insertion order for bulk inserts
    expect(result[0].name).toEqual('First');
    expect(result[1].name).toEqual('Second');
    expect(result[2].name).toEqual('Third');
  });
});