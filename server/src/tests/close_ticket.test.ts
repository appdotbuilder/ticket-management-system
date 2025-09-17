import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ticketsTable, customersTable, usersTable, closingReasonsTable, ticketHistoryTable } from '../db/schema';
import { type UpdateTicketStatusInput, type CreateCustomerInput, type CreateUserInput, type CreateClosingReasonInput } from '../schema';
import { closeTicket } from '../handlers/close_ticket';
import { eq } from 'drizzle-orm';

// Test data
const testCustomer: CreateCustomerInput = {
  name: 'Test Customer',
  email: 'customer@test.com',
  phone: '123-456-7890',
  address: '123 Test St',
  company: 'Test Corp',
  sla_hours: 24,
  is_active: true
};

const testUser: CreateUserInput = {
  email: 'user@test.com',
  name: 'Test User',
  role: 'technician',
  group_id: null,
  is_active: true
};

const testClosingReason: CreateClosingReasonInput = {
  reason: 'Issue Resolved',
  description: 'The issue has been successfully resolved',
  is_active: true
};

describe('closeTicket', () => {
  let customerId: number;
  let userId: number;
  let closingReasonId: number;
  let ticketId: number;

  beforeEach(async () => {
    await createDB();

    // Create customer
    const customerResult = await db.insert(customersTable)
      .values(testCustomer)
      .returning()
      .execute();
    customerId = customerResult[0].id;

    // Create user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create closing reason
    const closingReasonResult = await db.insert(closingReasonsTable)
      .values(testClosingReason)
      .returning()
      .execute();
    closingReasonId = closingReasonResult[0].id;

    // Create a test ticket
    const slaDate = new Date();
    slaDate.setDate(slaDate.getDate() + 1);

    const ticketResult = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-001',
        title: 'Test Ticket',
        description: 'Test ticket for closing',
        status: 'open',
        priority: 'medium',
        customer_id: customerId,
        assigned_to: userId,
        created_by: userId,
        sla_due_date: slaDate
      })
      .returning()
      .execute();
    ticketId = ticketResult[0].id;
  });

  afterEach(resetDB);

  it('should close a ticket successfully', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'Customer confirmed issue is resolved'
    };

    const result = await closeTicket(input);

    expect(result.id).toEqual(ticketId);
    expect(result.status).toEqual('closed');
    expect(result.closing_reason_id).toEqual(closingReasonId);
    expect(result.closed_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save ticket closure to database', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'Issue resolved'
    };

    await closeTicket(input);

    const tickets = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, ticketId))
      .execute();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toEqual('closed');
    expect(tickets[0].closing_reason_id).toEqual(closingReasonId);
    expect(tickets[0].closed_at).toBeInstanceOf(Date);
    expect(tickets[0].updated_at).toBeInstanceOf(Date);
  });

  it('should record status change in ticket history', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'Customer confirmed resolution'
    };

    await closeTicket(input);

    const historyRecords = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    // Should have 3 history records: status, closing_reason_id, and closed_at
    expect(historyRecords.length).toBeGreaterThanOrEqual(2);

    // Find the status change record
    const statusChange = historyRecords.find(record => record.field_name === 'status');
    expect(statusChange).toBeDefined();
    expect(statusChange?.old_value).toEqual('open');
    expect(statusChange?.new_value).toEqual('closed');
    expect(statusChange?.change_reason).toEqual('Customer confirmed resolution');
    expect(statusChange?.changed_by).toEqual(userId);
    expect(statusChange?.created_at).toBeInstanceOf(Date);
  });

  it('should record closing reason change in ticket history', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'Issue resolved'
    };

    await closeTicket(input);

    const historyRecords = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    const closingReasonChange = historyRecords.find(record => record.field_name === 'closing_reason_id');
    expect(closingReasonChange).toBeDefined();
    expect(closingReasonChange?.old_value).toBeNull();
    expect(closingReasonChange?.new_value).toEqual(closingReasonId.toString());
    expect(closingReasonChange?.change_reason).toEqual('Issue resolved');
  });

  it('should record closed_at timestamp in ticket history', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'Resolved by customer'
    };

    await closeTicket(input);

    const historyRecords = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    const closedAtChange = historyRecords.find(record => record.field_name === 'closed_at');
    expect(closedAtChange).toBeDefined();
    expect(closedAtChange?.old_value).toBeNull();
    expect(closedAtChange?.new_value).toBeDefined();
    expect(closedAtChange?.change_reason).toEqual('Resolved by customer');
  });

  it('should work without a closing reason', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: null,
      change_reason: 'Closed without specific reason'
    };

    const result = await closeTicket(input);

    expect(result.status).toEqual('closed');
    expect(result.closing_reason_id).toBeNull();
    expect(result.closed_at).toBeInstanceOf(Date);

    // Verify no closing_reason_id history record is created when reason_id is null
    const historyRecords = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    const closingReasonChange = historyRecords.find(record => record.field_name === 'closing_reason_id');
    expect(closingReasonChange).toBeUndefined();
  });

  it('should work without a change reason', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: null
    };

    const result = await closeTicket(input);

    expect(result.status).toEqual('closed');
    expect(result.closing_reason_id).toEqual(closingReasonId);

    const historyRecords = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    const statusChange = historyRecords.find(record => record.field_name === 'status');
    expect(statusChange).toBeDefined();
    expect(statusChange?.change_reason).toBeNull();
  });

  it('should throw error for non-existent ticket', async () => {
    const input: UpdateTicketStatusInput = {
      ticket_id: 99999,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'Test closure'
    };

    expect(closeTicket(input)).rejects.toThrow(/not found/i);
  });

  it('should handle closing an already closed ticket', async () => {
    // First close the ticket
    const firstInput: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'First closure'
    };

    await closeTicket(firstInput);

    // Try to close it again
    const secondInput: UpdateTicketStatusInput = {
      ticket_id: ticketId,
      status: 'closed',
      reason_id: closingReasonId,
      change_reason: 'Second closure attempt'
    };

    const result = await closeTicket(secondInput);
    expect(result.status).toEqual('closed');

    // Should still record history for the second closure attempt
    const historyRecords = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, ticketId))
      .execute();

    // Should have records from both closure attempts
    const statusChanges = historyRecords.filter(record => record.field_name === 'status');
    expect(statusChanges.length).toEqual(2);
    expect(statusChanges[1].change_reason).toEqual('Second closure attempt');
  });
});