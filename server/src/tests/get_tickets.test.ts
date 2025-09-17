import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, customersTable, ticketsTable } from '../db/schema';
import { type TicketDashboardFilters } from '../schema';
import { getTickets } from '../handlers/get_tickets';

describe('getTickets', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no tickets exist', async () => {
    const result = await getTickets();
    expect(result).toEqual([]);
  });

  it('should return all tickets when no filters provided', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create test tickets with different timestamps
    const firstTicket = {
      ticket_number: 'TK-001',
      title: 'First Ticket',
      description: 'First ticket description',
      status: 'open' as const,
      priority: 'high' as const,
      customer_id: customer.id,
      created_by: user.id,
      sla_due_date: new Date()
    };

    const secondTicket = {
      ticket_number: 'TK-002',
      title: 'Second Ticket',
      description: 'Second ticket description',
      status: 'in_progress' as const,
      priority: 'medium' as const,
      customer_id: customer.id,
      assigned_to: user.id,
      created_by: user.id,
      sla_due_date: new Date()
    };

    // Insert first ticket
    await db.insert(ticketsTable)
      .values(firstTicket)
      .execute();

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    // Insert second ticket
    await db.insert(ticketsTable)
      .values(secondTicket)
      .execute();

    const result = await getTickets();

    expect(result).toHaveLength(2);
    expect(result[0].title).toEqual('Second Ticket'); // Should be ordered by created_at desc
    expect(result[1].title).toEqual('First Ticket');
  });

  it('should filter tickets by status', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create tickets with different statuses
    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-001',
          title: 'Open Ticket',
          description: 'Open ticket description',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date()
        },
        {
          ticket_number: 'TK-002',
          title: 'Closed Ticket',
          description: 'Closed ticket description',
          status: 'closed',
          priority: 'medium',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date(),
          closed_at: new Date()
        }
      ])
      .execute();

    const filters: TicketDashboardFilters = { status: 'open' };
    const result = await getTickets(filters);

    expect(result).toHaveLength(1);
    expect(result[0].status).toEqual('open');
    expect(result[0].title).toEqual('Open Ticket');
  });

  it('should filter tickets by priority', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create tickets with different priorities
    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-001',
          title: 'High Priority Ticket',
          description: 'High priority ticket description',
          status: 'open',
          priority: 'high',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date()
        },
        {
          ticket_number: 'TK-002',
          title: 'Low Priority Ticket',
          description: 'Low priority ticket description',
          status: 'open',
          priority: 'low',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date()
        }
      ])
      .execute();

    const filters: TicketDashboardFilters = { priority: 'high' };
    const result = await getTickets(filters);

    expect(result).toHaveLength(1);
    expect(result[0].priority).toEqual('high');
    expect(result[0].title).toEqual('High Priority Ticket');
  });

  it('should filter tickets by assigned user', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values([
        {
          name: 'User One',
          email: 'user1@test.com',
          role: 'technician'
        },
        {
          name: 'User Two',
          email: 'user2@test.com',
          role: 'technician'
        }
      ])
      .returning()
      .execute();

    // Create tickets assigned to different users
    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-001',
          title: 'Assigned to User 1',
          description: 'Assigned to user 1',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          assigned_to: users[0].id,
          created_by: users[0].id,
          sla_due_date: new Date()
        },
        {
          ticket_number: 'TK-002',
          title: 'Assigned to User 2',
          description: 'Assigned to user 2',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          assigned_to: users[1].id,
          created_by: users[1].id,
          sla_due_date: new Date()
        }
      ])
      .execute();

    const filters: TicketDashboardFilters = { assigned_to: users[0].id };
    const result = await getTickets(filters);

    expect(result).toHaveLength(1);
    expect(result[0].assigned_to).toEqual(users[0].id);
    expect(result[0].title).toEqual('Assigned to User 1');
  });

  it('should filter tickets by customer', async () => {
    // Create prerequisite data
    const customers = await db.insert(customersTable)
      .values([
        {
          name: 'Customer A',
          email: 'customerA@test.com',
          sla_hours: 24
        },
        {
          name: 'Customer B',
          email: 'customerB@test.com',
          sla_hours: 48
        }
      ])
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create tickets for different customers
    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-001',
          title: 'Customer A Ticket',
          description: 'Customer A ticket description',
          status: 'open',
          priority: 'medium',
          customer_id: customers[0].id,
          created_by: user.id,
          sla_due_date: new Date()
        },
        {
          ticket_number: 'TK-002',
          title: 'Customer B Ticket',
          description: 'Customer B ticket description',
          status: 'open',
          priority: 'medium',
          customer_id: customers[1].id,
          created_by: user.id,
          sla_due_date: new Date()
        }
      ])
      .execute();

    const filters: TicketDashboardFilters = { customer_id: customers[0].id };
    const result = await getTickets(filters);

    expect(result).toHaveLength(1);
    expect(result[0].customer_id).toEqual(customers[0].id);
    expect(result[0].title).toEqual('Customer A Ticket');
  });

  it('should filter tickets by date range', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create tickets with specific dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-001',
          title: 'Yesterday Ticket',
          description: 'Created yesterday',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date(),
          created_at: yesterday
        },
        {
          ticket_number: 'TK-002',
          title: 'Today Ticket',
          description: 'Created today',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date(),
          created_at: today
        }
      ])
      .execute();

    const filters: TicketDashboardFilters = {
      date_from: today,
      date_to: tomorrow
    };
    const result = await getTickets(filters);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Today Ticket');
    expect(result[0].created_at >= today).toBe(true);
  });

  it('should apply multiple filters simultaneously', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create various tickets
    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-001',
          title: 'Matching Ticket',
          description: 'Open high priority ticket',
          status: 'open',
          priority: 'high',
          customer_id: customer.id,
          assigned_to: user.id,
          created_by: user.id,
          sla_due_date: new Date()
        },
        {
          ticket_number: 'TK-002',
          title: 'Non-matching Status',
          description: 'Closed high priority ticket',
          status: 'closed',
          priority: 'high',
          customer_id: customer.id,
          assigned_to: user.id,
          created_by: user.id,
          sla_due_date: new Date()
        },
        {
          ticket_number: 'TK-003',
          title: 'Non-matching Priority',
          description: 'Open low priority ticket',
          status: 'open',
          priority: 'low',
          customer_id: customer.id,
          assigned_to: user.id,
          created_by: user.id,
          sla_due_date: new Date()
        }
      ])
      .execute();

    const filters: TicketDashboardFilters = {
      status: 'open',
      priority: 'high',
      assigned_to: user.id
    };
    const result = await getTickets(filters);

    expect(result).toHaveLength(1);
    expect(result[0].title).toEqual('Matching Ticket');
    expect(result[0].status).toEqual('open');
    expect(result[0].priority).toEqual('high');
    expect(result[0].assigned_to).toEqual(user.id);
  });

  it('should handle unassigned tickets correctly', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create tickets with and without assignment
    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-001',
          title: 'Unassigned Ticket',
          description: 'Ticket with no assignment',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          assigned_to: null,
          created_by: user.id,
          sla_due_date: new Date()
        },
        {
          ticket_number: 'TK-002',
          title: 'Assigned Ticket',
          description: 'Ticket with assignment',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          assigned_to: user.id,
          created_by: user.id,
          sla_due_date: new Date()
        }
      ])
      .execute();

    // Test without filter - should return all tickets
    const result = await getTickets();

    expect(result).toHaveLength(2);
    // Verify both assigned and unassigned tickets are present
    expect(result.some(ticket => ticket.assigned_to === null)).toBe(true);
    expect(result.some(ticket => ticket.assigned_to === user.id)).toBe(true);
  });

  it('should return tickets ordered by created_at descending', async () => {
    // Create prerequisite data
    const [customer] = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'customer@test.com',
        sla_hours: 24
      })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        name: 'Test User',
        email: 'user@test.com',
        role: 'technician'
      })
      .returning()
      .execute();

    // Create tickets with different creation times
    const oldDate = new Date('2023-01-01');
    const newDate = new Date('2023-12-31');

    await db.insert(ticketsTable)
      .values([
        {
          ticket_number: 'TK-OLD',
          title: 'Older Ticket',
          description: 'Created earlier',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date(),
          created_at: oldDate
        },
        {
          ticket_number: 'TK-NEW',
          title: 'Newer Ticket',
          description: 'Created later',
          status: 'open',
          priority: 'medium',
          customer_id: customer.id,
          created_by: user.id,
          sla_due_date: new Date(),
          created_at: newDate
        }
      ])
      .execute();

    const result = await getTickets();

    expect(result).toHaveLength(2);
    expect(result[0].title).toEqual('Newer Ticket');
    expect(result[1].title).toEqual('Older Ticket');
    expect(result[0].created_at > result[1].created_at).toBe(true);
  });
});