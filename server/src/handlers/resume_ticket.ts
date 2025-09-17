import { db } from '../db';
import { ticketsTable, ticketHistoryTable, customersTable } from '../db/schema';
import { type UpdateTicketStatusInput, type Ticket } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function resumeTicket(input: UpdateTicketStatusInput): Promise<Ticket> {
  try {
    // First, verify the ticket exists and is in pending status
    const existingTickets = await db
      .select()
      .from(ticketsTable)
      .leftJoin(customersTable, eq(ticketsTable.customer_id, customersTable.id))
      .where(eq(ticketsTable.id, input.ticket_id))
      .execute();

    if (existingTickets.length === 0) {
      throw new Error(`Ticket with ID ${input.ticket_id} not found`);
    }

    const existingTicket = existingTickets[0].tickets;
    const customer = existingTickets[0].customers;

    if (existingTicket.status !== 'pending') {
      throw new Error(`Ticket ${input.ticket_id} is not in pending status. Current status: ${existingTicket.status}`);
    }

    if (!customer) {
      throw new Error(`Customer for ticket ${input.ticket_id} not found`);
    }

    // Calculate new SLA due date based on customer's SLA hours
    const now = new Date();
    const newSlaDueDate = new Date(now.getTime() + (customer.sla_hours * 60 * 60 * 1000));

    // Update the ticket status to in_progress and recalculate SLA
    const updatedTickets = await db
      .update(ticketsTable)
      .set({
        status: 'in_progress',
        pending_reason_id: null,
        sla_due_date: newSlaDueDate,
        updated_at: now
      })
      .where(eq(ticketsTable.id, input.ticket_id))
      .returning()
      .execute();

    const updatedTicket = updatedTickets[0];

    // Record the status change in ticket history
    await db
      .insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        changed_by: 1, // Using default user ID since not provided in input
        field_name: 'status',
        old_value: 'pending',
        new_value: 'in_progress',
        change_reason: input.change_reason || 'Ticket resumed from pending status'
      })
      .execute();

    // Record SLA due date change in history
    await db
      .insert(ticketHistoryTable)
      .values({
        ticket_id: input.ticket_id,
        changed_by: 1,
        field_name: 'sla_due_date',
        old_value: existingTicket.sla_due_date.toISOString(),
        new_value: newSlaDueDate.toISOString(),
        change_reason: input.change_reason || 'SLA recalculated when resuming ticket'
      })
      .execute();

    // Record pending reason removal if it existed
    if (existingTicket.pending_reason_id) {
      await db
        .insert(ticketHistoryTable)
        .values({
          ticket_id: input.ticket_id,
          changed_by: 1,
          field_name: 'pending_reason_id',
          old_value: existingTicket.pending_reason_id.toString(),
          new_value: null,
          change_reason: input.change_reason || 'Pending reason cleared when resuming ticket'
        })
        .execute();
    }

    return updatedTicket;
  } catch (error) {
    console.error('Ticket resume failed:', error);
    throw error;
  }
}