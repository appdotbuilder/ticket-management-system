import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ticketsTable, ticketHistoryTable, customersTable, usersTable, pendingReasonsTable } from '../db/schema';
import { type UpdateTicketStatusInput } from '../schema';
import { resumeTicket } from '../handlers/resume_ticket';
import { eq } from 'drizzle-orm';

// Test data setup
const testCustomer = {
  name: 'Test Customer',
  email: 'customer@test.com',
  phone: '123-456-7890',
  address: '123 Test St',
  company: 'Test Corp',
  sla_hours: 48,
  is_active: true
};

const testUser = {
  email: 'user@test.com',
  name: 'Test User',
  role: 'technician' as const,
  group_id: null,
  is_active: true
};

const testPendingReason = {
  reason: 'Waiting for customer response',
  description: 'Customer needs to provide additional information',
  is_active: true
};

describe('resumeTicket', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should resume a pending ticket to in_progress status', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable).values(testCustomer).returning().execute();
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [pendingReason] = await db.insert(pendingReasonsTable).values(testPendingReason).returning().execute();

    // Create a pending ticket
    const originalSlaDueDate = new Date('2024-01-01T12:00:00Z');
    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        ticket_number: 'TKT-001',
        title: 'Test Ticket',
        description: 'Test description',
        status: 'pending',
        priority: 'high',
        customer_id: customer.id,
        assigned_to: user.id,
        created_by: user.id,
        pending_reason_id: pendingReason.id,
        sla_due_date: originalSlaDueDate
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: ticket.id,
      status: 'in_progress',
      reason_id: null,
      change_reason: 'Customer provided required information'
    };

    const result = await resumeTicket(input);

    // Verify ticket status changed to in_progress
    expect(result.status).toEqual('in_progress');
    expect(result.pending_reason_id).toBeNull();
    expect(result.id).toEqual(ticket.id);
    
    // Verify SLA due date was recalculated (should be 48 hours from now)
    const now = new Date();
    const expectedSlaDueDate = new Date(now.getTime() + (48 * 60 * 60 * 1000));
    const timeDifference = Math.abs(result.sla_due_date.getTime() - expectedSlaDueDate.getTime());
    expect(timeDifference).toBeLessThan(5000); // Allow 5 seconds difference for execution time
    
    // Verify updated_at was set
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save resumed ticket changes to database', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable).values(testCustomer).returning().execute();
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [pendingReason] = await db.insert(pendingReasonsTable).values(testPendingReason).returning().execute();

    // Create a pending ticket
    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        ticket_number: 'TKT-002',
        title: 'Another Test Ticket',
        description: 'Another test description',
        status: 'pending',
        priority: 'medium',
        customer_id: customer.id,
        created_by: user.id,
        pending_reason_id: pendingReason.id,
        sla_due_date: new Date('2024-01-01T12:00:00Z')
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: ticket.id,
      status: 'in_progress',
      reason_id: null,
      change_reason: 'Issue resolved, resuming work'
    };

    await resumeTicket(input);

    // Verify changes persisted to database
    const updatedTickets = await db
      .select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, ticket.id))
      .execute();

    expect(updatedTickets).toHaveLength(1);
    const updatedTicket = updatedTickets[0];
    expect(updatedTicket.status).toEqual('in_progress');
    expect(updatedTicket.pending_reason_id).toBeNull();
    expect(updatedTicket.sla_due_date).not.toEqual(ticket.sla_due_date);
  });

  it('should record ticket resume in history', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable).values(testCustomer).returning().execute();
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [pendingReason] = await db.insert(pendingReasonsTable).values(testPendingReason).returning().execute();

    // Create a pending ticket
    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        ticket_number: 'TKT-003',
        title: 'History Test Ticket',
        description: 'History test description',
        status: 'pending',
        priority: 'low',
        customer_id: customer.id,
        created_by: user.id,
        pending_reason_id: pendingReason.id,
        sla_due_date: new Date('2024-01-01T12:00:00Z')
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: ticket.id,
      status: 'in_progress',
      reason_id: null,
      change_reason: 'Custom resume reason'
    };

    await resumeTicket(input);

    // Verify history records were created
    const historyRecords = await db
      .select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticket.id))
      .execute();

    // Should have at least 3 history records: status change, SLA change, pending reason removal
    expect(historyRecords.length).toBeGreaterThanOrEqual(3);
    
    // Check status change record
    const statusRecord = historyRecords.find(h => h.field_name === 'status');
    expect(statusRecord).toBeDefined();
    expect(statusRecord!.old_value).toEqual('pending');
    expect(statusRecord!.new_value).toEqual('in_progress');
    expect(statusRecord!.change_reason).toEqual('Custom resume reason');

    // Check SLA due date change record
    const slaRecord = historyRecords.find(h => h.field_name === 'sla_due_date');
    expect(slaRecord).toBeDefined();
    expect(slaRecord!.old_value).toEqual('2024-01-01T12:00:00.000Z');
    expect(slaRecord!.new_value).toBeDefined();

    // Check pending reason removal record
    const reasonRecord = historyRecords.find(h => h.field_name === 'pending_reason_id');
    expect(reasonRecord).toBeDefined();
    expect(reasonRecord!.old_value).toEqual(pendingReason.id.toString());
    expect(reasonRecord!.new_value).toBeNull();
  });

  it('should throw error for non-existent ticket', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: 99999,
      status: 'in_progress',
      reason_id: null,
      change_reason: 'Test'
    };

    expect(resumeTicket(input)).rejects.toThrow(/Ticket with ID 99999 not found/i);
  });

  it('should throw error for ticket not in pending status', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable).values(testCustomer).returning().execute();
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();

    // Create an open ticket (not pending)
    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        ticket_number: 'TKT-004',
        title: 'Open Ticket',
        description: 'Open ticket description',
        status: 'open',
        priority: 'medium',
        customer_id: customer.id,
        created_by: user.id,
        sla_due_date: new Date()
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: ticket.id,
      status: 'in_progress',
      reason_id: null,
      change_reason: 'Test'
    };

    expect(resumeTicket(input)).rejects.toThrow(/not in pending status/i);
  });

  it('should calculate SLA based on customer SLA hours', async () => {
    // Create customer with 72-hour SLA
    const customSlACustomer = {
      ...testCustomer,
      email: 'sla-test@test.com',
      sla_hours: 72
    };
    
    const [customer] = await db.insert(customersTable).values(customSlACustomer).returning().execute();
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();
    const [pendingReason] = await db.insert(pendingReasonsTable).values(testPendingReason).returning().execute();

    // Create a pending ticket
    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        ticket_number: 'TKT-005',
        title: 'SLA Test Ticket',
        description: 'SLA test description',
        status: 'pending',
        priority: 'critical',
        customer_id: customer.id,
        created_by: user.id,
        pending_reason_id: pendingReason.id,
        sla_due_date: new Date('2024-01-01T12:00:00Z')
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: ticket.id,
      status: 'in_progress',
      reason_id: null,
      change_reason: null
    };

    const beforeResume = new Date();
    const result = await resumeTicket(input);
    
    // Verify SLA was calculated based on 72-hour window
    const expectedSlaDueDate = new Date(beforeResume.getTime() + (72 * 60 * 60 * 1000));
    const timeDifference = Math.abs(result.sla_due_date.getTime() - expectedSlaDueDate.getTime());
    expect(timeDifference).toBeLessThan(5000); // Allow 5 seconds difference for execution time
  });

  it('should use default change reason when none provided', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable).values(testCustomer).returning().execute();
    const [user] = await db.insert(usersTable).values(testUser).returning().execute();

    // Create a pending ticket without pending reason
    const [ticket] = await db
      .insert(ticketsTable)
      .values({
        ticket_number: 'TKT-006',
        title: 'Default Reason Test',
        description: 'Default reason test description',
        status: 'pending',
        priority: 'high',
        customer_id: customer.id,
        created_by: user.id,
        pending_reason_id: null,
        sla_due_date: new Date('2024-01-01T12:00:00Z')
      })
      .returning()
      .execute();

    const input: UpdateTicketStatusInput = {
      ticket_id: ticket.id,
      status: 'in_progress',
      reason_id: null,
      change_reason: null
    };

    await resumeTicket(input);

    // Check that default reason was used
    const historyRecords = await db
      .select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticket.id))
      .execute();

    const statusRecord = historyRecords.find(h => h.field_name === 'status');
    expect(statusRecord).toBeDefined();
    expect(statusRecord!.change_reason).toEqual('Ticket resumed from pending status');
  });
});