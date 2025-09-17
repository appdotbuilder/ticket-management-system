import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ticketsTable, ticketHistoryTable, customersTable, usersTable } from '../db/schema';
import { type ScheduleTicketInput } from '../schema';
import { scheduleTicket } from '../handlers/schedule_ticket';
import { eq } from 'drizzle-orm';

describe('scheduleTicket', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testTicketId: number;
  
  beforeEach(async () => {
    // Create prerequisite data
    const customerResult = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const userResult = await db.insert(usersTable)
      .values({
        email: 'user@test.com',
        name: 'Test User',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create test ticket
    const ticketResult = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-001',
        title: 'Test Ticket',
        description: 'A test ticket',
        status: 'open',
        priority: 'medium',
        customer_id: customerResult[0].id,
        created_by: userResult[0].id,
        sla_due_date: new Date()
      })
      .returning()
      .execute();

    testTicketId = ticketResult[0].id;
  });

  it('should schedule a ticket successfully', async () => {
    const scheduledDate = new Date('2024-12-25T10:00:00Z');
    const input: ScheduleTicketInput = {
      ticket_id: testTicketId,
      scheduled_date: scheduledDate,
      change_reason: 'Customer requested specific date'
    };

    const result = await scheduleTicket(input);

    expect(result.id).toEqual(testTicketId);
    expect(result.scheduled_date).toEqual(scheduledDate);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update the ticket in database', async () => {
    const scheduledDate = new Date('2024-12-25T10:00:00Z');
    const input: ScheduleTicketInput = {
      ticket_id: testTicketId,
      scheduled_date: scheduledDate,
      change_reason: 'Customer requested specific date'
    };

    await scheduleTicket(input);

    const tickets = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, testTicketId))
      .execute();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].scheduled_date).toEqual(scheduledDate);
    expect(tickets[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create audit history entry', async () => {
    const scheduledDate = new Date('2024-12-25T10:00:00Z');
    const input: ScheduleTicketInput = {
      ticket_id: testTicketId,
      scheduled_date: scheduledDate,
      change_reason: 'Customer requested specific date'
    };

    await scheduleTicket(input);

    const history = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, testTicketId))
      .execute();

    expect(history).toHaveLength(1);
    expect(history[0].field_name).toEqual('scheduled_date');
    expect(history[0].old_value).toBeNull();
    expect(history[0].new_value).toEqual(scheduledDate.toISOString());
    expect(history[0].change_reason).toEqual('Customer requested specific date');
    expect(history[0].changed_by).toEqual(1);
  });

  it('should update previously scheduled ticket', async () => {
    const firstDate = new Date('2024-12-20T09:00:00Z');
    const secondDate = new Date('2024-12-25T10:00:00Z');

    // First scheduling
    await scheduleTicket({
      ticket_id: testTicketId,
      scheduled_date: firstDate,
      change_reason: 'Initial schedule'
    });

    // Second scheduling (rescheduling)
    const result = await scheduleTicket({
      ticket_id: testTicketId,
      scheduled_date: secondDate,
      change_reason: 'Customer requested reschedule'
    });

    expect(result.scheduled_date).toEqual(secondDate);

    // Check history has two entries
    const history = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, testTicketId))
      .execute();

    expect(history).toHaveLength(2);
    
    // First entry: null -> firstDate
    expect(history[0].old_value).toBeNull();
    expect(history[0].new_value).toEqual(firstDate.toISOString());
    
    // Second entry: firstDate -> secondDate
    expect(history[1].old_value).toEqual(firstDate.toISOString());
    expect(history[1].new_value).toEqual(secondDate.toISOString());
    expect(history[1].change_reason).toEqual('Customer requested reschedule');
  });

  it('should handle scheduling without change reason', async () => {
    const scheduledDate = new Date('2024-12-25T10:00:00Z');
    const input: ScheduleTicketInput = {
      ticket_id: testTicketId,
      scheduled_date: scheduledDate,
      change_reason: null
    };

    const result = await scheduleTicket(input);

    expect(result.scheduled_date).toEqual(scheduledDate);

    // Check history entry was created with null change_reason
    const history = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, testTicketId))
      .execute();

    expect(history).toHaveLength(1);
    expect(history[0].change_reason).toBeNull();
  });

  it('should throw error for non-existent ticket', async () => {
    const input: ScheduleTicketInput = {
      ticket_id: 99999,
      scheduled_date: new Date('2024-12-25T10:00:00Z'),
      change_reason: 'Test'
    };

    expect(scheduleTicket(input)).rejects.toThrow(/Ticket with ID 99999 not found/);
  });

  it('should preserve other ticket fields', async () => {
    const scheduledDate = new Date('2024-12-25T10:00:00Z');
    const input: ScheduleTicketInput = {
      ticket_id: testTicketId,
      scheduled_date: scheduledDate,
      change_reason: 'Test scheduling'
    };

    // Get original ticket data
    const originalTicket = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, testTicketId))
      .execute();

    const result = await scheduleTicket(input);

    // Verify other fields remain unchanged
    expect(result.ticket_number).toEqual(originalTicket[0].ticket_number);
    expect(result.title).toEqual(originalTicket[0].title);
    expect(result.description).toEqual(originalTicket[0].description);
    expect(result.status).toEqual(originalTicket[0].status);
    expect(result.priority).toEqual(originalTicket[0].priority);
    expect(result.customer_id).toEqual(originalTicket[0].customer_id);
    expect(result.assigned_to).toEqual(originalTicket[0].assigned_to);
    expect(result.created_by).toEqual(originalTicket[0].created_by);
    
    // Only scheduled_date and updated_at should be different
    expect(result.scheduled_date).toEqual(scheduledDate);
    expect(result.updated_at.getTime()).toBeGreaterThan(originalTicket[0].updated_at.getTime());
  });
});