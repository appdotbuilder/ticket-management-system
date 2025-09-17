import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ticketsTable, usersTable, customersTable, ticketHistoryTable } from '../db/schema';
import { type AssignTicketInput } from '../schema';
import { assignTicket } from '../handlers/assign_ticket';
import { eq } from 'drizzle-orm';

describe('assignTicket', () => {
  let testCustomerId: number;
  let testUserId: number;
  let testTechnicianId: number;
  let testTicketId: number;

  beforeEach(async () => {
    await createDB();

    // Create test customer
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24,
        is_active: true
      })
      .returning()
      .execute();
    testCustomerId = customers[0].id;

    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'manager@test.com',
          name: 'Test Manager',
          role: 'manager',
          is_active: true
        },
        {
          email: 'tech@test.com',
          name: 'Test Technician',
          role: 'technician',
          is_active: true
        }
      ])
      .returning()
      .execute();
    testUserId = users[0].id;
    testTechnicianId = users[1].id;

    // Create test ticket
    const slaDate = new Date();
    slaDate.setHours(slaDate.getHours() + 24);

    const tickets = await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-001',
        title: 'Test Ticket',
        description: 'Test description',
        status: 'open',
        priority: 'medium',
        customer_id: testCustomerId,
        created_by: testUserId,
        sla_due_date: slaDate
      })
      .returning()
      .execute();
    testTicketId = tickets[0].id;
  });

  afterEach(resetDB);

  it('should assign ticket to a user', async () => {
    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: testTechnicianId,
      change_reason: 'Assigning to technician for resolution'
    };

    const result = await assignTicket(input);

    expect(result.id).toEqual(testTicketId);
    expect(result.assigned_to).toEqual(testTechnicianId);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should unassign ticket by setting assigned_to to null', async () => {
    // First assign the ticket
    await db.update(ticketsTable)
      .set({ assigned_to: testTechnicianId })
      .where(eq(ticketsTable.id, testTicketId))
      .execute();

    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: null,
      change_reason: 'Unassigning ticket'
    };

    const result = await assignTicket(input);

    expect(result.id).toEqual(testTicketId);
    expect(result.assigned_to).toBeNull();
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save assignment change to database', async () => {
    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: testTechnicianId,
      change_reason: 'Testing database update'
    };

    await assignTicket(input);

    // Verify ticket was updated in database
    const tickets = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, testTicketId))
      .execute();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].assigned_to).toEqual(testTechnicianId);
  });

  it('should create history record for assignment change', async () => {
    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: testTechnicianId,
      change_reason: 'Assignment for testing'
    };

    await assignTicket(input);

    // Verify history record was created
    const history = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, testTicketId))
      .execute();

    expect(history).toHaveLength(1);
    expect(history[0].field_name).toEqual('assigned_to');
    expect(history[0].old_value).toBeNull(); // Originally unassigned
    expect(history[0].new_value).toEqual(testTechnicianId.toString());
    expect(history[0].change_reason).toEqual('Assignment for testing');
    expect(history[0].changed_by).toEqual(testTechnicianId);
  });

  it('should track history when reassigning ticket', async () => {
    // First assign to technician
    await assignTicket({
      ticket_id: testTicketId,
      assigned_to: testTechnicianId,
      change_reason: 'Initial assignment'
    });

    // Then reassign to manager
    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: testUserId,
      change_reason: 'Escalating to manager'
    };

    await assignTicket(input);

    // Verify both history records exist
    const history = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, testTicketId))
      .execute();

    expect(history).toHaveLength(2);
    
    // Check the reassignment history record
    const reassignmentHistory = history.find(h => h.change_reason === 'Escalating to manager');
    expect(reassignmentHistory).toBeDefined();
    expect(reassignmentHistory!.old_value).toEqual(testTechnicianId.toString());
    expect(reassignmentHistory!.new_value).toEqual(testUserId.toString());
  });

  it('should throw error for non-existent ticket', async () => {
    const input: AssignTicketInput = {
      ticket_id: 99999,
      assigned_to: testTechnicianId,
      change_reason: 'Testing error case'
    };

    expect(assignTicket(input)).rejects.toThrow(/Ticket with ID 99999 not found/i);
  });

  it('should throw error for non-existent user', async () => {
    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: 99999,
      change_reason: 'Testing error case'
    };

    expect(assignTicket(input)).rejects.toThrow(/User with ID 99999 not found/i);
  });

  it('should throw error for inactive user', async () => {
    // Create inactive user
    const inactiveUsers = await db.insert(usersTable)
      .values({
        email: 'inactive@test.com',
        name: 'Inactive User',
        role: 'technician',
        is_active: false
      })
      .returning()
      .execute();

    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: inactiveUsers[0].id,
      change_reason: 'Testing inactive user'
    };

    expect(assignTicket(input)).rejects.toThrow(/is not active/i);
  });

  it('should use default change reason when none provided', async () => {
    const input: AssignTicketInput = {
      ticket_id: testTicketId,
      assigned_to: testTechnicianId,
      change_reason: null
    };

    await assignTicket(input);

    // Verify default change reason was used
    const history = await db.select()
      .from(ticketHistoryTable)
      .where(eq(ticketHistoryTable.ticket_id, testTicketId))
      .execute();

    expect(history).toHaveLength(1);
    expect(history[0].change_reason).toEqual('Ticket assignment updated');
  });
});