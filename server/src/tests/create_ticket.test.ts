import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { ticketsTable, customersTable, usersTable, ticketCasesTable } from '../db/schema';
import { type CreateTicketInput } from '../schema';
import { createTicket } from '../handlers/create_ticket';
import { eq } from 'drizzle-orm';

// Test input with all required fields
const testInput: CreateTicketInput = {
  title: 'System Down',
  description: 'The main application server is not responding',
  priority: 'high',
  customer_id: 1,
  assigned_to: null,
  case_id: null,
  scheduled_date: null
};

describe('createTicket', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a ticket with proper SLA calculation', async () => {
    // Create prerequisite user for created_by field
    await db.insert(usersTable).values({
      email: 'creator@test.com',
      name: 'Test Creator',
      role: 'technician',
      group_id: null,
      is_active: true
    }).execute();

    // Create prerequisite customer
    await db.insert(customersTable).values({
      name: 'Test Customer',
      email: 'test@customer.com',
      phone: null,
      address: null,
      company: 'Test Corp',
      sla_hours: 48,
      is_active: true
    }).execute();

    const result = await createTicket(testInput);

    // Verify basic fields
    expect(result.title).toEqual('System Down');
    expect(result.description).toEqual(testInput.description);
    expect(result.priority).toEqual('high');
    expect(result.status).toEqual('open');
    expect(result.customer_id).toEqual(1);
    expect(result.assigned_to).toBeNull();
    expect(result.case_id).toBeNull();
    expect(result.scheduled_date).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify ticket number format
    expect(result.ticket_number).toMatch(/^TKT-\d{8}-[A-Z0-9]{3}$/);

    // Verify SLA calculation (48 hours from customer)
    const expectedSlaDate = new Date();
    expectedSlaDate.setHours(expectedSlaDate.getHours() + 48);
    const timeDiff = Math.abs(result.sla_due_date.getTime() - expectedSlaDate.getTime());
    expect(timeDiff).toBeLessThan(60000); // Within 1 minute tolerance
  });

  it('should save ticket to database', async () => {
    // Create prerequisite user
    await db.insert(usersTable).values({
      email: 'dbcreator@test.com',
      name: 'DB Test Creator',
      role: 'technician',
      group_id: null,
      is_active: true
    }).execute();

    // Create prerequisite customer
    await db.insert(customersTable).values({
      name: 'DB Test Customer',
      email: 'dbtest@customer.com',
      phone: '+1234567890',
      address: '123 Test St',
      company: 'DB Test Corp',
      sla_hours: 24,
      is_active: true
    }).execute();

    const result = await createTicket(testInput);

    // Query database to verify ticket was saved
    const tickets = await db.select()
      .from(ticketsTable)
      .where(eq(ticketsTable.id, result.id))
      .execute();

    expect(tickets).toHaveLength(1);
    expect(tickets[0].title).toEqual('System Down');
    expect(tickets[0].description).toEqual(testInput.description);
    expect(tickets[0].priority).toEqual('high');
    expect(tickets[0].status).toEqual('open');
    expect(tickets[0].customer_id).toEqual(1);
    expect(tickets[0].created_at).toBeInstanceOf(Date);
  });

  it('should create ticket with assigned user', async () => {
    // Create prerequisite users
    await db.insert(usersTable).values([
      {
        email: 'assignedcreator@test.com',
        name: 'Assigned Test Creator',
        role: 'technician',
        group_id: null,
        is_active: true
      },
      {
        email: 'assigned@test.com',
        name: 'Assigned User',
        role: 'technician',
        group_id: null,
        is_active: true
      }
    ]).execute();

    // Create prerequisite customer
    await db.insert(customersTable).values({
      name: 'Assigned Test Customer',
      email: 'assigned@customer.com',
      sla_hours: 12,
      is_active: true
    }).execute();

    const inputWithAssignment: CreateTicketInput = {
      ...testInput,
      assigned_to: 2, // Second user we created
      priority: 'critical'
    };

    const result = await createTicket(inputWithAssignment);

    expect(result.assigned_to).toEqual(2);
    expect(result.priority).toEqual('critical');

    // Verify SLA calculation with 12-hour SLA
    const expectedSlaDate = new Date();
    expectedSlaDate.setHours(expectedSlaDate.getHours() + 12);
    const timeDiff = Math.abs(result.sla_due_date.getTime() - expectedSlaDate.getTime());
    expect(timeDiff).toBeLessThan(60000); // Within 1 minute tolerance
  });

  it('should create ticket with case and scheduled date', async () => {
    // Create prerequisite user
    await db.insert(usersTable).values({
      email: 'casecreator@test.com',
      name: 'Case Test Creator',
      role: 'technician',
      group_id: null,
      is_active: true
    }).execute();

    // Create prerequisite customer
    await db.insert(customersTable).values({
      name: 'Case Test Customer',
      email: 'case@customer.com',
      sla_hours: 72,
      is_active: true
    }).execute();

    // Create test case
    await db.insert(ticketCasesTable).values({
      name: 'Hardware Issue',
      description: 'Server hardware problems',
      is_active: true
    }).execute();

    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + 1);

    const inputWithCase: CreateTicketInput = {
      ...testInput,
      case_id: 1,
      scheduled_date: scheduleDate,
      priority: 'medium'
    };

    const result = await createTicket(inputWithCase);

    expect(result.case_id).toEqual(1);
    expect(result.scheduled_date).toEqual(scheduleDate);
    expect(result.priority).toEqual('medium');

    // Verify SLA calculation with 72-hour SLA
    const expectedSlaDate = new Date();
    expectedSlaDate.setHours(expectedSlaDate.getHours() + 72);
    const timeDiff = Math.abs(result.sla_due_date.getTime() - expectedSlaDate.getTime());
    expect(timeDiff).toBeLessThan(60000); // Within 1 minute tolerance
  });

  it('should generate unique ticket numbers', async () => {
    // Create prerequisite user
    await db.insert(usersTable).values({
      email: 'uniquecreator@test.com',
      name: 'Unique Test Creator',
      role: 'technician',
      group_id: null,
      is_active: true
    }).execute();

    // Create prerequisite customer
    await db.insert(customersTable).values({
      name: 'Unique Test Customer',
      email: 'unique@customer.com',
      sla_hours: 24,
      is_active: true
    }).execute();

    const ticket1 = await createTicket(testInput);
    const ticket2 = await createTicket({
      ...testInput,
      title: 'Second Ticket',
      description: 'Another test ticket'
    });

    expect(ticket1.ticket_number).not.toEqual(ticket2.ticket_number);
    expect(ticket1.ticket_number).toMatch(/^TKT-\d{8}-[A-Z0-9]{3}$/);
    expect(ticket2.ticket_number).toMatch(/^TKT-\d{8}-[A-Z0-9]{3}$/);
  });

  it('should throw error for non-existent customer', async () => {
    const inputWithInvalidCustomer: CreateTicketInput = {
      ...testInput,
      customer_id: 999
    };

    await expect(createTicket(inputWithInvalidCustomer))
      .rejects.toThrow(/customer not found/i);
  });

  it('should use default SLA when customer has minimum SLA hours', async () => {
    // Create prerequisite user
    await db.insert(usersTable).values({
      email: 'fastcreator@test.com',
      name: 'Fast SLA Creator',
      role: 'technician',
      group_id: null,
      is_active: true
    }).execute();

    // Create customer with 1 hour SLA
    await db.insert(customersTable).values({
      name: 'Fast SLA Customer',
      email: 'fast@customer.com',
      sla_hours: 1,
      is_active: true
    }).execute();

    const result = await createTicket(testInput);

    // Verify SLA calculation with 1-hour SLA
    const expectedSlaDate = new Date();
    expectedSlaDate.setHours(expectedSlaDate.getHours() + 1);
    const timeDiff = Math.abs(result.sla_due_date.getTime() - expectedSlaDate.getTime());
    expect(timeDiff).toBeLessThan(60000); // Within 1 minute tolerance
  });
});