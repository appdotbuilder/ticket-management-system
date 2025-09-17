import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, customersTable, ticketsTable } from '../db/schema';
import { getMyTickets } from '../handlers/get_my_tickets';

// Test data
const testUser1 = {
  email: 'user1@test.com',
  name: 'Test User 1',
  role: 'technician' as const,
  group_id: null,
  is_active: true
};

const testUser2 = {
  email: 'user2@test.com',
  name: 'Test User 2', 
  role: 'technician' as const,
  group_id: null,
  is_active: true
};

const testCustomer = {
  name: 'Test Customer',
  email: 'customer@test.com',
  phone: null,
  address: null,
  company: null,
  sla_hours: 24,
  is_active: true
};

describe('getMyTickets', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return tickets assigned to the user', async () => {
    // Create prerequisite data
    const [user1] = await db.insert(usersTable).values(testUser1).returning();
    const [user2] = await db.insert(usersTable).values(testUser2).returning();
    const [customer] = await db.insert(customersTable).values(testCustomer).returning();

    // Calculate SLA due date (24 hours from now)
    const slaDate = new Date();
    slaDate.setHours(slaDate.getHours() + 24);

    // Create tickets - one assigned to user1, one to user2
    const ticketData1 = {
      ticket_number: 'TKT-001',
      title: 'Assigned to User 1',
      description: 'Ticket assigned to user 1',
      status: 'open' as const,
      priority: 'medium' as const,
      customer_id: customer.id,
      assigned_to: user1.id,
      created_by: user2.id,
      case_id: null,
      pending_reason_id: null,
      closing_reason_id: null,
      scheduled_date: null,
      sla_due_date: slaDate,
      resolved_at: null,
      closed_at: null
    };

    const ticketData2 = {
      ticket_number: 'TKT-002',
      title: 'Assigned to User 2',
      description: 'Ticket assigned to user 2',
      status: 'in_progress' as const,
      priority: 'high' as const,
      customer_id: customer.id,
      assigned_to: user2.id,
      created_by: user1.id,
      case_id: null,
      pending_reason_id: null,
      closing_reason_id: null,
      scheduled_date: null,
      sla_due_date: slaDate,
      resolved_at: null,
      closed_at: null
    };

    await db.insert(ticketsTable).values([ticketData1, ticketData2]);

    // Get tickets for user1 - should include ticket assigned to user1
    const user1Tickets = await getMyTickets(user1.id);

    expect(user1Tickets).toHaveLength(2); // One assigned to user1, one created by user1
    
    // Verify tickets contain user1's assigned ticket
    const assignedTicket = user1Tickets.find(t => t.assigned_to === user1.id);
    expect(assignedTicket).toBeDefined();
    expect(assignedTicket!.title).toEqual('Assigned to User 1');
    
    // Verify tickets contain user1's created ticket
    const createdTicket = user1Tickets.find(t => t.created_by === user1.id);
    expect(createdTicket).toBeDefined();
    expect(createdTicket!.title).toEqual('Assigned to User 2');
  });

  it('should return tickets created by the user', async () => {
    // Create prerequisite data
    const [user1] = await db.insert(usersTable).values(testUser1).returning();
    const [user2] = await db.insert(usersTable).values(testUser2).returning();
    const [customer] = await db.insert(customersTable).values(testCustomer).returning();

    const slaDate = new Date();
    slaDate.setHours(slaDate.getHours() + 24);

    // Create ticket created by user1 but assigned to user2
    const ticketData = {
      ticket_number: 'TKT-003',
      title: 'Created by User 1',
      description: 'Ticket created by user 1',
      status: 'open' as const,
      priority: 'low' as const,
      customer_id: customer.id,
      assigned_to: user2.id,
      created_by: user1.id,
      case_id: null,
      pending_reason_id: null,
      closing_reason_id: null,
      scheduled_date: null,
      sla_due_date: slaDate,
      resolved_at: null,
      closed_at: null
    };

    await db.insert(ticketsTable).values(ticketData);

    // Get tickets for user1 - should include ticket created by user1
    const user1Tickets = await getMyTickets(user1.id);

    expect(user1Tickets).toHaveLength(1);
    expect(user1Tickets[0].title).toEqual('Created by User 1');
    expect(user1Tickets[0].created_by).toEqual(user1.id);
    expect(user1Tickets[0].assigned_to).toEqual(user2.id);
  });

  it('should return empty array when user has no tickets', async () => {
    // Create user but no tickets
    const [user] = await db.insert(usersTable).values(testUser1).returning();

    const userTickets = await getMyTickets(user.id);

    expect(userTickets).toHaveLength(0);
  });

  it('should return tickets in descending order by creation date', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser1).returning();
    const [customer] = await db.insert(customersTable).values(testCustomer).returning();

    const slaDate = new Date();
    slaDate.setHours(slaDate.getHours() + 24);

    // Create multiple tickets with different creation times
    const baseTime = new Date();
    baseTime.setHours(baseTime.getHours() - 2); // 2 hours ago

    const ticketData1 = {
      ticket_number: 'TKT-004',
      title: 'Older Ticket',
      description: 'Older ticket',
      status: 'open' as const,
      priority: 'medium' as const,
      customer_id: customer.id,
      assigned_to: user.id,
      created_by: user.id,
      case_id: null,
      pending_reason_id: null,
      closing_reason_id: null,
      scheduled_date: null,
      sla_due_date: slaDate,
      resolved_at: null,
      closed_at: null
    };

    // Insert first ticket
    await db.insert(ticketsTable).values(ticketData1);

    // Wait a bit and create second ticket
    await new Promise(resolve => setTimeout(resolve, 10));

    const ticketData2 = {
      ticket_number: 'TKT-005',
      title: 'Newer Ticket',
      description: 'Newer ticket',
      status: 'open' as const,
      priority: 'medium' as const,
      customer_id: customer.id,
      assigned_to: user.id,
      created_by: user.id,
      case_id: null,
      pending_reason_id: null,
      closing_reason_id: null,
      scheduled_date: null,
      sla_due_date: slaDate,
      resolved_at: null,
      closed_at: null
    };

    await db.insert(ticketsTable).values(ticketData2);

    const userTickets = await getMyTickets(user.id);

    expect(userTickets).toHaveLength(2);
    // Verify tickets are ordered by creation date descending
    expect(userTickets[0].title).toEqual('Newer Ticket');
    expect(userTickets[1].title).toEqual('Older Ticket');
    expect(userTickets[0].created_at >= userTickets[1].created_at).toBe(true);
  });

  it('should not return duplicate tickets when user is both creator and assignee', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser1).returning();
    const [customer] = await db.insert(customersTable).values(testCustomer).returning();

    const slaDate = new Date();
    slaDate.setHours(slaDate.getHours() + 24);

    // Create ticket where user is both creator and assignee
    const ticketData = {
      ticket_number: 'TKT-006',
      title: 'Created and Assigned to Same User',
      description: 'User is both creator and assignee',
      status: 'open' as const,
      priority: 'medium' as const,
      customer_id: customer.id,
      assigned_to: user.id,
      created_by: user.id,
      case_id: null,
      pending_reason_id: null,
      closing_reason_id: null,
      scheduled_date: null,
      sla_due_date: slaDate,
      resolved_at: null,
      closed_at: null
    };

    await db.insert(ticketsTable).values(ticketData);

    const userTickets = await getMyTickets(user.id);

    // Should only return one ticket, not duplicated
    expect(userTickets).toHaveLength(1);
    expect(userTickets[0].title).toEqual('Created and Assigned to Same User');
    expect(userTickets[0].created_by).toEqual(user.id);
    expect(userTickets[0].assigned_to).toEqual(user.id);
  });

  it('should return tickets with different statuses and priorities', async () => {
    // Create prerequisite data
    const [user] = await db.insert(usersTable).values(testUser1).returning();
    const [customer] = await db.insert(customersTable).values(testCustomer).returning();

    const slaDate = new Date();
    slaDate.setHours(slaDate.getHours() + 24);

    // Create tickets with different statuses and priorities
    const ticketsData = [
      {
        ticket_number: 'TKT-007',
        title: 'Open Critical Ticket',
        description: 'Open critical ticket',
        status: 'open' as const,
        priority: 'critical' as const,
        customer_id: customer.id,
        assigned_to: user.id,
        created_by: user.id,
        case_id: null,
        pending_reason_id: null,
        closing_reason_id: null,
        scheduled_date: null,
        sla_due_date: slaDate,
        resolved_at: null,
        closed_at: null
      },
      {
        ticket_number: 'TKT-008',
        title: 'Resolved Low Priority Ticket',
        description: 'Resolved low priority ticket',
        status: 'resolved' as const,
        priority: 'low' as const,
        customer_id: customer.id,
        assigned_to: user.id,
        created_by: user.id,
        case_id: null,
        pending_reason_id: null,
        closing_reason_id: null,
        scheduled_date: null,
        sla_due_date: slaDate,
        resolved_at: new Date(),
        closed_at: null
      }
    ];

    await db.insert(ticketsTable).values(ticketsData);

    const userTickets = await getMyTickets(user.id);

    expect(userTickets).toHaveLength(2);
    
    const openTicket = userTickets.find(t => t.status === 'open');
    const resolvedTicket = userTickets.find(t => t.status === 'resolved');
    
    expect(openTicket).toBeDefined();
    expect(openTicket!.priority).toEqual('critical');
    expect(resolvedTicket).toBeDefined();
    expect(resolvedTicket!.priority).toEqual('low');
    expect(resolvedTicket!.resolved_at).toBeInstanceOf(Date);
  });
});