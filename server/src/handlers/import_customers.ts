import { db } from '../db';
import { customersTable } from '../db/schema';
import { type ImportCustomersInput, type Customer } from '../schema';

export const importCustomers = async (input: ImportCustomersInput): Promise<Customer[]> => {
  try {
    // Handle empty customer list
    if (input.customers.length === 0) {
      return [];
    }

    // Bulk insert all customers at once for efficiency
    const result = await db.insert(customersTable)
      .values(input.customers.map(customer => ({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        company: customer.company,
        sla_hours: customer.sla_hours,
        is_active: customer.is_active
      })))
      .returning()
      .execute();

    // Return the inserted customers
    return result;
  } catch (error) {
    console.error('Customer import failed:', error);
    throw error;
  }
};