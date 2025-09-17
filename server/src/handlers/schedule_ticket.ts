import { db } from '../db';
import { ticketsTable, ticketHistoryTable } from '../db/schema';
import { type ScheduleTicketInput, type Ticket } from '../schema';
import { eq } from 'drizzle-orm';

export const scheduleTicket = async (input: ScheduleTicketInput): Promise<Ticket> => {
  try {
    // First, verify the ticket exists
    const existingTickets = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, input.ticket_id))
      .execute();

    if (existingTickets.length === 0) {
      throw new Error(`Ticket with ID ${input.ticket_id} not found`);
    }

    const existingTicket = existingTickets[0];

    // Update the ticket with the scheduled date
    const result = await db.update(ticketsTable)
      .set({
        scheduled_date: input.scheduled_date,
        updated_at: new Date()
      })
      .where(eq(ticketsTable.id, input.ticket_id))
      .returning()
      .execute();

    const updatedTicket = result[0];

    // Create audit history entry
    await db.insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        changed_by: 1, // Default user ID - in real app this would come from auth context
        field_name: 'scheduled_date',
        old_value: existingTicket.scheduled_date ? existingTicket.scheduled_date.toISOString() : null,
        new_value: input.scheduled_date.toISOString(),
        change_reason: input.change_reason
      })
      .execute();

    return updatedTicket;
  } catch (error) {
    console.error('Ticket scheduling failed:', error);
    throw error;
  }
};