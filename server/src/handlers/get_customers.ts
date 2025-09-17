import { db } from '../db';
import { customersTable } from '../db/schema';
import { type Customer } from '../schema';
import { eq } from 'drizzle-orm';

export const getCustomers = async (): Promise<Customer[]> => {
  try {
    const result = await db.select()
      .from(customersTable)
      .where(eq(customersTable.is_active, true))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch customers:', error);
    throw error;
  }
};