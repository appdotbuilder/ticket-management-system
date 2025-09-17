import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { customersTable, ticketsTable, usersTable } from '../db/schema';
import { getSLAReport } from '../handlers/get_sla_report';

describe('getSLAReport', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no customers exist', async () => {
    const result = await getSLAReport();
    expect(result).toEqual([]);
  });

  it('should return customers with no tickets', async () => {
    // Create a customer without tickets
    const customers = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: 'test@example.com',
        sla_hours: 24,
        is_active: true
      })
      .returning()
      .execute();

    const result = await getSLAReport();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      customer_id: customers[0].id,
      customer_name: 'Test Customer',
      total_tickets: 0,
      tickets_within_sla: 0,
      tickets_breached_sla: 0,
      average_resolution_time: 0,
      sla_compliance_percentage: 0
    });
  });

  it('should calculate SLA metrics correctly for resolved tickets', async () => {
    // Create customer and user
    const customers = await db.insert(customersTable)
      .values({
        name: 'Acme Corp',
        email: 'contact@acme.com',
        sla_hours: 24,
        is_active: true
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        name: 'John Doe',
        email: 'john@example.com',
        role: 'technician',
        is_active: true
      })
      .returning()
      .execute();

    const customerId = customers[0].id;
    const userId = users[0].id;
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // Create tickets with different SLA scenarios
    await db.insert(ticketsTable)
      .values([
        // Ticket 1: Resolved within SLA (12 hours)
        {
          ticket_number: 'T-001',
          title: 'Within SLA Ticket',
          description: 'Test ticket',
          status: 'resolved',
          priority: 'medium',
          customer_id: customerId,
          created_by: userId,
          created_at: oneDayAgo,
          sla_due_date: now, // 24 hours SLA
          resolved_at: new Date(oneDayAgo.getTime() + 12 * 60 * 60 * 1000) // Resolved after 12 hours
        },
        // Ticket 2: Resolved after SLA breach (36 hours)
        {
          ticket_number: 'T-002',
          title: 'SLA Breached Ticket',
          description: 'Test ticket',
          status: 'resolved',
          priority: 'high',
          customer_id: customerId,
          created_by: userId,
          created_at: twoDaysAgo,
          sla_due_date: oneDayAgo, // 24 hours SLA
          resolved_at: new Date(twoDaysAgo.getTime() + 36 * 60 * 60 * 1000) // Resolved after 36 hours
        },
        // Ticket 3: Still open but within SLA
        {
          ticket_number: 'T-003',
          title: 'Open Within SLA',
          description: 'Test ticket',
          status: 'open',
          priority: 'low',
          customer_id: customerId,
          created_by: userId,
          created_at: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
          sla_due_date: new Date(now.getTime() + 22 * 60 * 60 * 1000), // Due in 22 hours
          resolved_at: null
        },
        // Ticket 4: Still open and past SLA
        {
          ticket_number: 'T-004',
          title: 'Open Past SLA',
          description: 'Test ticket',
          status: 'open',
          priority: 'critical',
          customer_id: customerId,
          created_by: userId,
          created_at: twoDaysAgo,
          sla_due_date: oneDayAgo, // Was due yesterday
          resolved_at: null
        }
      ])
      .execute();

    const result = await getSLAReport();

    expect(result).toHaveLength(1);
    expect(result[0].customer_id).toEqual(customerId);
    expect(result[0].customer_name).toEqual('Acme Corp');
    expect(result[0].total_tickets).toEqual(4);
    expect(result[0].tickets_within_sla).toEqual(1); // Only T-001
    expect(result[0].tickets_breached_sla).toEqual(2); // T-002 (resolved late) and T-004 (open past due)
    expect(result[0].average_resolution_time).toEqual(24); // Average of 12h and 36h = 24h
    expect(result[0].sla_compliance_percentage).toEqual(25); // 1/4 = 25%
  });

  it('should handle multiple customers correctly', async () => {
    // Create two customers
    const customers = await db.insert(customersTable)
      .values([
        {
          name: 'Good Customer',
          email: 'good@example.com',
          sla_hours: 12,
          is_active: true
        },
        {
          name: 'Challenging Customer',
          email: 'challenge@example.com',
          sla_hours: 48,
          is_active: true
        }
      ])
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        name: 'Support Agent',
        email: 'support@example.com',
        role: 'technician',
        is_active: true
      })
      .returning()
      .execute();

    const userId = users[0].id;
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    // Create tickets for both customers
    await db.insert(ticketsTable)
      .values([
        // Good customer: 2 tickets, both within SLA
        {
          ticket_number: 'G-001',
          title: 'Good Ticket 1',
          description: 'Test',
          status: 'resolved',
          priority: 'medium',
          customer_id: customers[0].id,
          created_by: userId,
          created_at: sixHoursAgo,
          sla_due_date: new Date(sixHoursAgo.getTime() + 12 * 60 * 60 * 1000),
          resolved_at: new Date(sixHoursAgo.getTime() + 4 * 60 * 60 * 1000) // 4 hours
        },
        {
          ticket_number: 'G-002',
          title: 'Good Ticket 2',
          description: 'Test',
          status: 'resolved',
          priority: 'low',
          customer_id: customers[0].id,
          created_by: userId,
          created_at: sixHoursAgo,
          sla_due_date: new Date(sixHoursAgo.getTime() + 12 * 60 * 60 * 1000),
          resolved_at: new Date(sixHoursAgo.getTime() + 8 * 60 * 60 * 1000) // 8 hours
        },
        // Challenging customer: 1 ticket, within longer SLA
        {
          ticket_number: 'C-001',
          title: 'Challenge Ticket',
          description: 'Test',
          status: 'resolved',
          priority: 'high',
          customer_id: customers[1].id,
          created_by: userId,
          created_at: sixHoursAgo,
          sla_due_date: new Date(sixHoursAgo.getTime() + 48 * 60 * 60 * 1000),
          resolved_at: new Date(sixHoursAgo.getTime() + 20 * 60 * 60 * 1000) // 20 hours
        }
      ])
      .execute();

    const result = await getSLAReport();

    expect(result).toHaveLength(2);

    // Good customer results
    const goodCustomer = result.find(r => r.customer_name === 'Good Customer');
    expect(goodCustomer).toBeDefined();
    expect(goodCustomer!.total_tickets).toEqual(2);
    expect(goodCustomer!.tickets_within_sla).toEqual(2);
    expect(goodCustomer!.tickets_breached_sla).toEqual(0);
    expect(goodCustomer!.average_resolution_time).toEqual(6); // (4 + 8) / 2
    expect(goodCustomer!.sla_compliance_percentage).toEqual(100);

    // Challenging customer results
    const challengingCustomer = result.find(r => r.customer_name === 'Challenging Customer');
    expect(challengingCustomer).toBeDefined();
    expect(challengingCustomer!.total_tickets).toEqual(1);
    expect(challengingCustomer!.tickets_within_sla).toEqual(1);
    expect(challengingCustomer!.tickets_breached_sla).toEqual(0);
    expect(challengingCustomer!.average_resolution_time).toEqual(20);
    expect(challengingCustomer!.sla_compliance_percentage).toEqual(100);
  });

  it('should exclude inactive customers', async () => {
    // Create active and inactive customers
    const customers = await db.insert(customersTable)
      .values([
        {
          name: 'Active Customer',
          email: 'active@example.com',
          sla_hours: 24,
          is_active: true
        },
        {
          name: 'Inactive Customer',
          email: 'inactive@example.com',
          sla_hours: 24,
          is_active: false
        }
      ])
      .returning()
      .execute();

    const result = await getSLAReport();

    expect(result).toHaveLength(1);
    expect(result[0].customer_name).toEqual('Active Customer');
  });

  it('should handle edge cases with zero division', async () => {
    // Create customer with no resolved tickets
    const customers = await db.insert(customersTable)
      .values({
        name: 'No Resolution Customer',
        email: 'noresolution@example.com',
        sla_hours: 24,
        is_active: true
      })
      .returning()
      .execute();

    const users = await db.insert(usersTable)
      .values({
        name: 'Agent',
        email: 'agent@example.com',
        role: 'technician',
        is_active: true
      })
      .returning()
      .execute();

    // Create only open tickets (no resolved tickets)
    await db.insert(ticketsTable)
      .values({
        ticket_number: 'O-001',
        title: 'Open Ticket',
        description: 'Still open',
        status: 'open',
        priority: 'medium',
        customer_id: customers[0].id,
        created_by: users[0].id,
        created_at: new Date(),
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
        resolved_at: null
      })
      .execute();

    const result = await getSLAReport();

    expect(result).toHaveLength(1);
    expect(result[0].total_tickets).toEqual(1);
    expect(result[0].tickets_within_sla).toEqual(0);
    expect(result[0].tickets_breached_sla).toEqual(0);
    expect(result[0].average_resolution_time).toEqual(0); // No resolved tickets
    expect(result[0].sla_compliance_percentage).toEqual(0);
  });
});