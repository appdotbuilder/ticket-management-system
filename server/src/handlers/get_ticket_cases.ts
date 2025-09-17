import { db } from '../db';
import { ticketCasesTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type TicketCase } from '../schema';

export const getTicketCases = async (): Promise<TicketCase[]> => {
  try {
    // Fetch all active ticket cases, ordered by name
    const result = await db.select()
      .from(ticketCasesTable)
      .where(eq(ticketCasesTable.is_active, true))
      .orderBy(ticketCasesTable.name)
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch ticket cases:', error);
    throw error;
  }
};