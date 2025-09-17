import { db } from '../db';
import { ticketsTable, ticketHistoryTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type UpdateTicketStatusInput, type Ticket } from '../schema';

export const pendingTicket = async (input: UpdateTicketStatusInput): Promise<Ticket> => {
  try {
    // First, get the current ticket to capture old values for history
    const existingTickets = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, input.ticket_id))
      .execute();

    if (existingTickets.length === 0) {
      throw new Error(`Ticket with ID ${input.ticket_id} not found`);
    }

    const existingTicket = existingTickets[0];

    // Validate status transition - only allow pending from open, in_progress, resolved, or already pending
    if (!['open', 'in_progress', 'resolved', 'pending'].includes(existingTicket.status)) {
      throw new Error(`Cannot set ticket to pending from status: ${existingTicket.status}`);
    }

    // Validate that reason_id is provided when setting to pending
    if (input.status === 'pending' && !input.reason_id) {
      throw new Error('Pending reason ID is required when setting ticket to pending status');
    }

    // Update the ticket with new status and reason
    const updatedTickets = await db.update(ticketsTable)
      .set({
        status: input.status,
        pending_reason_id: input.reason_id,
        updated_at: new Date()
      })
      .where(eq(ticketsTable.id, input.ticket_id))
      .returning()
      .execute();

    const updatedTicket = updatedTickets[0];

    // Create history entries for the status change
    const historyEntries = [];

    // Track status change
    if (existingTicket.status !== input.status) {
      historyEntries.push({
        ticket_id: input.ticket_id,
        changed_by: 1, // TODO: This should come from authenticated user context
        field_name: 'status',
        old_value: existingTicket.status,
        new_value: input.status,
        change_reason: input.change_reason
      });
    }

    // Track pending reason change
    if (existingTicket.pending_reason_id !== input.reason_id) {
      historyEntries.push({
        ticket_id: input.ticket_id,
        changed_by: 1, // TODO: This should come from authenticated user context
        field_name: 'pending_reason_id',
        old_value: existingTicket.pending_reason_id?.toString() || null,
        new_value: input.reason_id?.toString() || null,
        change_reason: input.change_reason
      });
    }

    // Insert history entries if there are changes
    if (historyEntries.length > 0) {
      await db.insert(ticketHistoryTable)
        .values(historyEntries)
        .execute();
    }

    return updatedTicket;
  } catch (error) {
    console.error('Pending ticket operation failed:', error);
    throw error;
  }
};