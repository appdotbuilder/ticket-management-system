import { db } from '../db';
import { ticketsTable, customersTable } from '../db/schema';
import { type CreateTicketInput, type Ticket } from '../schema';
import { eq } from 'drizzle-orm';

export const createTicket = async (input: CreateTicketInput): Promise<Ticket> => {
  try {
    // First, fetch customer to get SLA hours
    const customers = await db.select()
      .from(customersTable)
      .where(eq(customersTable.id, input.customer_id))
      .execute();

    if (customers.length === 0) {
      throw new Error('Customer not found');
    }

    const customer = customers[0];

    // Generate unique ticket number with timestamp
    const ticketNumber = `TKT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // Calculate SLA due date based on customer's SLA hours
    const slaDate = new Date();
    slaDate.setHours(slaDate.getHours() + customer.sla_hours);

    // Create the ticket record
    const result = await db.insert(ticketsTable)
      .values({
        ticket_number: ticketNumber,
        title: input.title,
        description: input.description,
        status: 'open',
        priority: input.priority,
        customer_id: input.customer_id,
        assigned_to: input.assigned_to,
        created_by: 1, // Default user ID - in real app would come from auth context
        case_id: input.case_id,
        pending_reason_id: null,
        closing_reason_id: null,
        scheduled_date: input.scheduled_date,
        sla_due_date: slaDate,
        resolved_at: null,
        closed_at: null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Ticket creation failed:', error);
    throw error;
  }
};