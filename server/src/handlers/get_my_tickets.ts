import { db } from '../db';
import { ticketsTable } from '../db/schema';
import { type Ticket } from '../schema';
import { eq, or, desc } from 'drizzle-orm';

export async function getMyTickets(userId: number): Promise<Ticket[]> {
  try {
    // Query tickets where user is either assigned to or created by the user
    const results = await db.select()
      .from(ticketsTable)
      .where(
        or(
          eq(ticketsTable.assigned_to, userId),
          eq(ticketsTable.created_by, userId)
        )
      )
      .orderBy(desc(ticketsTable.created_at))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch user tickets:', error);
    throw error;
  }
}