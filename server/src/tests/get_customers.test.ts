import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { customersTable } from '../db/schema';
import { type CreateCustomerInput } from '../schema';
import { getCustomers } from '../handlers/get_customers';

const testCustomer1: CreateCustomerInput = {
  name: 'Test Customer 1',
  email: 'customer1@example.com',
  phone: '+1-555-0101',
  address: '123 Main St, City, State',
  company: 'Test Company 1',
  sla_hours: 24,
  is_active: true
};

const testCustomer2: CreateCustomerInput = {
  name: 'Test Customer 2',
  email: 'customer2@example.com',
  phone: '+1-555-0102',
  address: '456 Oak Ave, City, State',
  company: 'Test Company 2',
  sla_hours: 48,
  is_active: true
};

const inactiveCustomer: CreateCustomerInput = {
  name: 'Inactive Customer',
  email: 'inactive@example.com',
  phone: null,
  address: null,
  company: null,
  sla_hours: 72,
  is_active: false
};

describe('getCustomers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no customers exist', async () => {
    const result = await getCustomers();
    expect(result).toEqual([]);
  });

  it('should return all active customers', async () => {
    // Insert test customers
    await db.insert(customersTable)
      .values([
        testCustomer1,
        testCustomer2,
        inactiveCustomer
      ])
      .execute();

    const result = await getCustomers();

    expect(result).toHaveLength(2);
    
    // Verify first customer
    const customer1 = result.find(c => c.email === 'customer1@example.com');
    expect(customer1).toBeDefined();
    expect(customer1!.name).toEqual('Test Customer 1');
    expect(customer1!.phone).toEqual('+1-555-0101');
    expect(customer1!.address).toEqual('123 Main St, City, State');
    expect(customer1!.company).toEqual('Test Company 1');
    expect(customer1!.sla_hours).toEqual(24);
    expect(customer1!.is_active).toBe(true);
    expect(customer1!.id).toBeDefined();
    expect(customer1!.created_at).toBeInstanceOf(Date);
    expect(customer1!.updated_at).toBeInstanceOf(Date);

    // Verify second customer
    const customer2 = result.find(c => c.email === 'customer2@example.com');
    expect(customer2).toBeDefined();
    expect(customer2!.name).toEqual('Test Customer 2');
    expect(customer2!.phone).toEqual('+1-555-0102');
    expect(customer2!.address).toEqual('456 Oak Ave, City, State');
    expect(customer2!.company).toEqual('Test Company 2');
    expect(customer2!.sla_hours).toEqual(48);
    expect(customer2!.is_active).toBe(true);

    // Verify inactive customer is not included
    const inactiveResult = result.find(c => c.email === 'inactive@example.com');
    expect(inactiveResult).toBeUndefined();
  });

  it('should only return active customers when mixed active/inactive exist', async () => {
    // Insert multiple customers with mixed active status
    await db.insert(customersTable)
      .values([
        { ...testCustomer1, is_active: true },
        { ...testCustomer2, is_active: false },
        { 
          name: 'Active Customer',
          email: 'active@example.com',
          phone: null,
          address: null,
          company: null,
          sla_hours: 12,
          is_active: true 
        }
      ])
      .execute();

    const result = await getCustomers();

    expect(result).toHaveLength(2);
    
    // All returned customers should be active
    result.forEach(customer => {
      expect(customer.is_active).toBe(true);
    });

    // Verify specific customers
    const emails = result.map(c => c.email);
    expect(emails).toContain('customer1@example.com');
    expect(emails).toContain('active@example.com');
    expect(emails).not.toContain('customer2@example.com'); // This one is inactive
  });

  it('should handle customers with null optional fields', async () => {
    const customerWithNulls: CreateCustomerInput = {
      name: 'Minimal Customer',
      email: 'minimal@example.com',
      phone: null,
      address: null,
      company: null,
      sla_hours: 36,
      is_active: true
    };

    await db.insert(customersTable)
      .values(customerWithNulls)
      .execute();

    const result = await getCustomers();

    expect(result).toHaveLength(1);
    const customer = result[0];
    expect(customer.name).toEqual('Minimal Customer');
    expect(customer.email).toEqual('minimal@example.com');
    expect(customer.phone).toBeNull();
    expect(customer.address).toBeNull();
    expect(customer.company).toBeNull();
    expect(customer.sla_hours).toEqual(36);
    expect(customer.is_active).toBe(true);
  });

  it('should return customers in creation order', async () => {
    // Insert customers with slight delay to ensure different timestamps
    await db.insert(customersTable)
      .values(testCustomer1)
      .execute();

    // Small delay to ensure different created_at times
    await new Promise(resolve => setTimeout(resolve, 10));

    await db.insert(customersTable)
      .values(testCustomer2)
      .execute();

    const result = await getCustomers();

    expect(result).toHaveLength(2);
    
    // Verify both customers are returned (order may vary depending on database)
    const emails = result.map(c => c.email);
    expect(emails).toContain('customer1@example.com');
    expect(emails).toContain('customer2@example.com');
  });

  it('should handle large number of customers', async () => {
    // Create multiple customers
    const customers: CreateCustomerInput[] = [];
    for (let i = 1; i <= 10; i++) {
      customers.push({
        name: `Customer ${i}`,
        email: `customer${i}@example.com`,
        phone: `+1-555-01${i.toString().padStart(2, '0')}`,
        address: `${i} Test St, City, State`,
        company: `Company ${i}`,
        sla_hours: 24,
        is_active: i % 2 === 1 // Make odd numbered customers active
      });
    }

    await db.insert(customersTable)
      .values(customers)
      .execute();

    const result = await getCustomers();

    // Should return only the 5 active customers (odd numbered)
    expect(result).toHaveLength(5);
    
    result.forEach(customer => {
      expect(customer.is_active).toBe(true);
      expect(customer.name).toMatch(/Customer [13579]/);
    });
  });
});