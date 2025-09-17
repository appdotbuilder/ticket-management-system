import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  customersTable, 
  usersTable, 
  ticketsTable, 
  ticketHistoryTable,
  pendingReasonsTable 
} from '../db/schema';
import { type UpdateTicketStatusInput } from '../schema';
import { pendingTicket } from '../handlers/pending_ticket';
import { eq } from 'drizzle-orm';

describe('pendingTicket', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should set ticket to pending status with reason', async () => {
    // Create prerequisite data
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        name: 'Test User',
        role: 'technician'
      })
      .returning()
      .execute();

    const reasons = await db.insert(pendingReasonsTable)
      .values({
        reason: 'Waiting for customer response',
        description: 'Ticket pending customer feedback'
      })
      .returning()
      .execute();

    const tickets = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-001',
        title: 'Test Ticket',
        description: 'Test Description',
        status: 'open',
        priority: 'medium',
        customer_id: customers[0].id,
        created_by: users[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: tickets[0].id,
      status: 'pending',
      reason_id: reasons[0].id,
      change_reason: 'Customer needs to provide more information'
    };

    const result = await pendingTicket(input);

    expect(result.id).toEqual(tickets[0].id);
    expect(result.status).toEqual('pending');
    expect(result.pending_reason_id).toEqual(reasons[0].id);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save pending status to database', async () => {
    // Create prerequisite data
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        name: 'Test User',
        role: 'technician'
      })
      .returning()
      .execute();

    const reasons = await db.insert(pendingReasonsTable)
      .values({
        reason: 'Waiting for parts',
        description: 'Need hardware components'
      })
      .returning()
      .execute();

    const tickets = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-002',
        title: 'Hardware Issue',
        description: 'Server needs repair',
        status: 'in_progress',
        priority: 'high',
        customer_id: customers[0].id,
        created_by: users[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: tickets[0].id,
      status: 'pending',
      reason_id: reasons[0].id,
      change_reason: 'Ordered replacement parts'
    };

    const result = await pendingTicket(input);

    // Verify database update
    const updatedTickets = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, result.id))
      .execute();

    expect(updatedTickets).toHaveLength(1);
    expect(updatedTickets[0].status).toEqual('pending');
    expect(updatedTickets[0].pending_reason_id).toEqual(reasons[0].id);
    expect(updatedTickets[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create ticket history entries for status and reason changes', async () => {
    // Create prerequisite data
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        name: 'Test User',
        role: 'technician'
      })
      .returning()
      .execute();

    const reasons = await db.insert(pendingReasonsTable)
      .values({
        reason: 'Escalated to vendor',
        description: 'Vendor support required'
      })
      .returning()
      .execute();

    const tickets = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-003',
        title: 'Complex Issue',
        description: 'Requires vendor expertise',
        status: 'open',
        priority: 'critical',
        customer_id: customers[0].id,
        created_by: users[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: tickets[0].id,
      status: 'pending',
      reason_id: reasons[0].id,
      change_reason: 'Vendor consultation needed'
    };

    await pendingTicket(input);

    // Check history entries
    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, tickets[0].id))
      .execute();

    expect(historyEntries.length).toBeGreaterThanOrEqual(2);
    
    const statusChange = historyEntries.find(entry => entry.field_name === 'status');
    expect(statusChange).toBeDefined();
    expect(statusChange!.old_value).toEqual('open');
    expect(statusChange!.new_value).toEqual('pending');
    expect(statusChange!.change_reason).toEqual('Vendor consultation needed');

    const reasonChange = historyEntries.find(entry => entry.field_name === 'pending_reason_id');
    expect(reasonChange).toBeDefined();
    expect(reasonChange!.old_value).toBeNull();
    expect(reasonChange!.new_value).toEqual(reasons[0].id.toString());
    expect(reasonChange!.change_reason).toEqual('Vendor consultation needed');
  });

  it('should throw error if ticket not found', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: 999999,
      status: 'pending',
      reason_id: 1,
      change_reason: 'Test reason'
    };

    expect(pendingTicket(input)).rejects.toThrow(/ticket.*not found/i);
  });

  it('should throw error if reason_id not provided for pending status', async () => {
    // Create prerequisite data
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        name: 'Test User',
        role: 'technician'
      })
      .returning()
      .execute();

    const tickets = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-004',
        title: 'Test Ticket',
        description: 'Test Description',
        status: 'open',
        priority: 'medium',
        customer_id: customers[0].id,
        created_by: users[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: tickets[0].id,
      status: 'pending',
      reason_id: null,
      change_reason: 'Test reason'
    };

    expect(pendingTicket(input)).rejects.toThrow(/pending reason.*required/i);
  });

  it('should throw error for invalid status transitions', async () => {
    // Create prerequisite data
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        name: 'Test User',
        role: 'technician'
      })
      .returning()
      .execute();

    const reasons = await db.insert(pendingReasonsTable)
      .values({
        reason: 'Test reason',
        description: 'Test description'
      })
      .returning()
      .execute();

    const tickets = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-005',
        title: 'Closed Ticket',
        description: 'Already closed ticket',
        status: 'closed',
        priority: 'medium',
        customer_id: customers[0].id,
        created_by: users[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
        closed_at: new Date()
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: tickets[0].id,
      status: 'pending',
      reason_id: reasons[0].id,
      change_reason: 'Trying to pending closed ticket'
    };

    expect(pendingTicket(input)).rejects.toThrow(/cannot set ticket to pending from status/i);
  });

  it('should handle ticket already in pending status', async () => {
    // Create prerequisite data
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        name: 'Test User',
        role: 'technician'
      })
      .returning()
      .execute();

    const reasons = await db.insert(pendingReasonsTable)
      .values([
        {
          reason: 'Original reason',
          description: 'First reason'
        },
        {
          reason: 'Updated reason',
          description: 'New reason'
        }
      ])
      .returning()
      .execute();

    const tickets = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-006',
        title: 'Already Pending Ticket',
        description: 'This ticket is already pending',
        status: 'pending',
        priority: 'medium',
        customer_id: customers[0].id,
        created_by: users[0].id,
        pending_reason_id: reasons[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: tickets[0].id,
      status: 'pending',
      reason_id: reasons[1].id,
      change_reason: 'Updating pending reason'
    };

    const result = await pendingTicket(input);

    expect(result.status).toEqual('pending');
    expect(result.pending_reason_id).toEqual(reasons[1].id);

    // Should only create history entry for reason change, not status
    const historyEntries = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, tickets[0].id))
      .execute();

    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].field_name).toEqual('pending_reason_id');
    expect(historyEntries[0].old_value).toEqual(reasons[0].id.toString());
    expect(historyEntries[0].new_value).toEqual(reasons[1].id.toString());
  });
});