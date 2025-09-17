import { db } from '../db';
import { ticketsTable, ticketHistoryTable } from '../db/schema';
import { type UpdateTicketStatusInput, type Ticket } from '../schema';
import { eq } from 'drizzle-orm';

export async function closeTicket(input: UpdateTicketStatusInput): Promise<Ticket> {
  try {
    // First, get the current ticket data to track what's changing
    const currentTicket = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, input.ticket_id))
      .execute();

    if (currentTicket.length === 0) {
      throw new Error(`Ticket with id ${input.ticket_id} not found`);
    }

    const ticket = currentTicket[0];
    const now = new Date();

    // Update the ticket status to closed and set closed_at timestamp
    const updatedTickets = await db.update(ticketsTable)
      .set({
        status: 'closed',
        closing_reason_id: input.reason_id,
        closed_at: now,
        updated_at: now
      })
      .where(eq(ticketsTable.id, input.ticket_id))
      .returning()
      .execute();

    if (updatedTickets.length === 0) {
      throw new Error('Failed to update ticket');
    }

    const updatedTicket = updatedTickets[0];

    // Record the status change in ticket history
    await db.insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        changed_by: ticket.created_by, // Using created_by as a fallback since we don't have current user context
        field_name: 'status',
        old_value: ticket.status,
        new_value: 'closed',
        change_reason: input.change_reason
      })
      .execute();

    // Record the closing reason change if provided
    if (input.reason_id && input.reason_id !== ticket.closing_reason_id) {
      await db.insert(ticketHistoryTable)
        .values({
          ticket_id: input.ticket_id,
          changed_by: ticket.created_by,
          field_name: 'closing_reason_id',
          old_value: ticket.closing_reason_id?.toString() || null,
          new_value: input.reason_id.toString(),
          change_reason: input.change_reason
        })
        .execute();
    }

    // Record the closed_at timestamp change
    await db.insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        changed_by: ticket.created_by,
        field_name: 'closed_at',
        old_value: ticket.closed_at?.toISOString() || null,
        new_value: now.toISOString(),
        change_reason: input.change_reason
      })
      .execute();

    return updatedTicket;
  } catch (error) {
    console.error('Ticket closure failed:', error);
    throw error;
  }
}