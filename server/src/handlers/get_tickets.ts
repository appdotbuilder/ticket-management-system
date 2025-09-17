import { db } from '../db';
import { ticketsTable } from '../db/schema';
import { type Ticket, type TicketDashboardFilters } from '../schema';
import { and, eq, gte, lte, desc, SQL } from 'drizzle-orm';

export async function getTickets(filters?: TicketDashboardFilters): Promise<Ticket[]> {
  try {
    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    if (filters?.status) {
      conditions.push(eq(ticketsTable.status, filters.status));
    }

    if (filters?.priority) {
      conditions.push(eq(ticketsTable.priority, filters.priority));
    }

    if (filters?.assigned_to !== undefined) {
      conditions.push(eq(ticketsTable.assigned_to, filters.assigned_to));
    }

    if (filters?.customer_id) {
      conditions.push(eq(ticketsTable.customer_id, filters.customer_id));
    }

    if (filters?.date_from) {
      conditions.push(gte(ticketsTable.created_at, filters.date_from));
    }

    if (filters?.date_to) {
      conditions.push(lte(ticketsTable.created_at, filters.date_to));
    }

    // Build final query based on whether we have conditions
    const results = conditions.length > 0
      ? await db.select()
          .from(ticketsTable)
          .where(conditions.length === 1 ? conditions[0] : and(...conditions))
          .orderBy(desc(ticketsTable.created_at))
          .execute()
      : await db.select()
          .from(ticketsTable)
          .orderBy(desc(ticketsTable.created_at))
          .execute();

    return results;
  } catch (error) {
    console.error('Get tickets operation failed:', error);
    throw error;
  }
}