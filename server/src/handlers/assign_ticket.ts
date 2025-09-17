import { db } from '../db';
import { ticketsTable, usersTable, ticketHistoryTable } from '../db/schema';
import { type AssignTicketInput, type Ticket } from '../schema';
import { eq } from 'drizzle-orm';

export const assignTicket = async (input: AssignTicketInput): Promise<Ticket> => {
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

    // If assigning to someone, verify the user exists and is active
    if (input.assigned_to !== null) {
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, input.assigned_to))
        .execute();

      if (users.length === 0) {
        throw new Error(`User with ID ${input.assigned_to} not found`);
      }

      if (!users[0].is_active) {
        throw new Error(`User with ID ${input.assigned_to} is not active`);
      }
    }

    // Update the ticket assignment
    const updatedTickets = await db.update(ticketsTable)
      .set({
        assigned_to: input.assigned_to,
        updated_at: new Date()
      })
      .where(eq(ticketsTable.id, input.ticket_id))
      .returning()
      .execute();

    // Create history record for the assignment change
    await db.insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        changed_by: input.assigned_to || 1, // Default to system user if unassigning
        field_name: 'assigned_to',
        old_value: existingTicket.assigned_to?.toString() || null,
        new_value: input.assigned_to?.toString() || null,
        change_reason: input.change_reason || 'Ticket assignment updated',
        created_at: new Date()
      })
      .execute();

    return updatedTickets[0];
  } catch (error) {
    console.error('Ticket assignment failed:', error);
    throw error;
  }
};