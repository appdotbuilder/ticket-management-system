import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, userGroupsTable, customersTable, ticketsTable } from '../db/schema';
import { getDashboardStats } from '../handlers/get_dashboard_stats';

describe('getDashboardStats', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup helpers
  async function createTestUser(role: 'admin' | 'manager' | 'technician' | 'customer' = 'technician', groupId?: number) {
    const result = await db.insert(usersTable)
      .values({
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        role: role,
        group_id: groupId,
        is_active: true
      })
      .returning()
      .execute();
    return result[0];
  }

  async function createTestGroup(canViewAll: boolean = false) {
    const result = await db.insert(userGroupsTable)
      .values({
        name: `Test Group ${Date.now()}`,
        description: 'Test group',
        can_view_all_tickets: canViewAll,
        can_edit_all_tickets: false,
        can_delete_tickets: false,
        can_manage_users: false
      })
      .returning()
      .execute();
    return result[0];
  }

  async function createTestCustomer() {
    const result = await db.insert(customersTable)
      .values({
        name: 'Test Customer',
        email: `customer-${Date.now()}@example.com`,
        phone: '123-456-7890',
        address: '123 Test St',
        company: 'Test Company',
        sla_hours: 24,
        is_active: true
      })
      .returning()
      .execute();
    return result[0];
  }

  async function createTestTicket(customerId: number, createdById: number, options: {
    status?: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed',
    priority?: 'low' | 'medium' | 'high' | 'critical',
    assignedTo?: number,
    slaOffset?: number, // hours offset from now for SLA due date
    resolvedOffset?: number, // hours offset from creation for resolved_at
    createdOffset?: number // hours offset from now for created_at
  } = {}) {
    const now = new Date();
    const createdAt = new Date(now.getTime() + (options.createdOffset || 0) * 60 * 60 * 1000);
    const slaDate = new Date(now.getTime() + (options.slaOffset || 24) * 60 * 60 * 1000);
    const resolvedAt = options.resolvedOffset !== undefined 
      ? new Date(createdAt.getTime() + options.resolvedOffset * 60 * 60 * 1000)
      : null;

    const result = await db.insert(ticketsTable)
      .values({
        ticket_number: `TCK-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: 'Test Ticket',
        description: 'Test ticket description',
        status: options.status || 'open',
        priority: options.priority || 'medium',
        customer_id: customerId,
        assigned_to: options.assignedTo || null,
        created_by: createdById,
        case_id: null,
        pending_reason_id: null,
        closing_reason_id: null,
        scheduled_date: null,
        sla_due_date: slaDate,
        resolved_at: resolvedAt,
        closed_at: options.status === 'closed' ? resolvedAt : null,
        created_at: createdAt,
        updated_at: createdAt
      })
      .returning()
      .execute();
    return result[0];
  }

  it('should return stats for admin user with all tickets visible', async () => {
    const admin = await createTestUser('admin');
    const customer = await createTestCustomer();

    // Create various tickets
    await createTestTicket(customer.id, admin.id, { status: 'open' });
    await createTestTicket(customer.id, admin.id, { status: 'pending' });
    await createTestTicket(customer.id, admin.id, { status: 'in_progress' });
    await createTestTicket(customer.id, admin.id, { status: 'resolved', resolvedOffset: 2 });
    await createTestTicket(customer.id, admin.id, { status: 'closed' });

    const stats = await getDashboardStats(admin.id);

    expect(stats.total_tickets).toBe(5);
    expect(stats.open_tickets).toBe(1);
    expect(stats.pending_tickets).toBe(1);
    expect(stats.in_progress_tickets).toBe(1);
    expect(stats.resolved_tickets).toBe(1);
    expect(stats.closed_tickets).toBe(1);
    expect(stats.my_assigned_tickets).toBe(0); // None assigned to admin
    expect(stats.average_resolution_time).toBe(2.0); // 2 hours for the resolved ticket
  });

  it('should return stats for manager user with all tickets visible', async () => {
    const manager = await createTestUser('manager');
    const customer = await createTestCustomer();

    // Create tickets
    await createTestTicket(customer.id, manager.id, { status: 'open' });
    await createTestTicket(customer.id, manager.id, { status: 'resolved', assignedTo: manager.id, resolvedOffset: 1.5 });

    const stats = await getDashboardStats(manager.id);

    expect(stats.total_tickets).toBe(2);
    expect(stats.open_tickets).toBe(1);
    expect(stats.resolved_tickets).toBe(1);
    expect(stats.my_assigned_tickets).toBe(1);
    expect(stats.average_resolution_time).toBe(1.5);
  });

  it('should return limited stats for technician user without special permissions', async () => {
    const tech1 = await createTestUser('technician');
    const tech2 = await createTestUser('technician');
    const customer = await createTestCustomer();

    // Create tickets - tech1 can only see their assigned tickets
    await createTestTicket(customer.id, tech1.id, { status: 'open', assignedTo: tech1.id });
    await createTestTicket(customer.id, tech1.id, { status: 'resolved', assignedTo: tech1.id, resolvedOffset: 3 });
    await createTestTicket(customer.id, tech2.id, { status: 'pending', assignedTo: tech2.id }); // Should not be visible to tech1

    const stats = await getDashboardStats(tech1.id);

    expect(stats.total_tickets).toBe(2); // Only tickets assigned to tech1
    expect(stats.open_tickets).toBe(1);
    expect(stats.resolved_tickets).toBe(1);
    expect(stats.pending_tickets).toBe(0); // tech2's ticket not visible
    expect(stats.my_assigned_tickets).toBe(2);
    expect(stats.average_resolution_time).toBe(3.0);
  });

  it('should return all stats for technician with view-all group permissions', async () => {
    const group = await createTestGroup(true); // Can view all tickets
    const tech = await createTestUser('technician', group.id);
    const customer = await createTestCustomer();

    // Create tickets
    await createTestTicket(customer.id, tech.id, { status: 'open' });
    await createTestTicket(customer.id, tech.id, { status: 'pending', assignedTo: tech.id });

    const stats = await getDashboardStats(tech.id);

    expect(stats.total_tickets).toBe(2);
    expect(stats.open_tickets).toBe(1);
    expect(stats.pending_tickets).toBe(1);
    expect(stats.my_assigned_tickets).toBe(1);
  });

  it('should correctly identify overdue tickets', async () => {
    const admin = await createTestUser('admin');
    const customer = await createTestCustomer();

    // Create overdue tickets (SLA due date in the past)
    await createTestTicket(customer.id, admin.id, { status: 'open', slaOffset: -2 }); // 2 hours overdue
    await createTestTicket(customer.id, admin.id, { status: 'pending', slaOffset: -1 }); // 1 hour overdue
    await createTestTicket(customer.id, admin.id, { status: 'resolved', slaOffset: -1 }); // Overdue but resolved - should not count
    await createTestTicket(customer.id, admin.id, { status: 'open', slaOffset: 2 }); // Not overdue

    const stats = await getDashboardStats(admin.id);

    expect(stats.total_tickets).toBe(4);
    expect(stats.overdue_tickets).toBe(2); // Only open and pending overdue tickets
  });

  it('should correctly identify tickets due today', async () => {
    const admin = await createTestUser('admin');
    const customer = await createTestCustomer();

    // Create tickets due today (SLA due within today)
    await createTestTicket(customer.id, admin.id, { status: 'open', slaOffset: 2 }); // Due in 2 hours (today)
    await createTestTicket(customer.id, admin.id, { status: 'pending', slaOffset: 12 }); // Due in 12 hours (today)
    await createTestTicket(customer.id, admin.id, { status: 'open', slaOffset: 30 }); // Due tomorrow
    await createTestTicket(customer.id, admin.id, { status: 'resolved', slaOffset: 5 }); // Due today but resolved - should not count

    const stats = await getDashboardStats(admin.id);

    expect(stats.total_tickets).toBe(4);
    expect(stats.tickets_due_today).toBe(2);
  });

  it('should calculate average resolution time correctly with multiple tickets', async () => {
    const admin = await createTestUser('admin');
    const customer = await createTestCustomer();

    // Create resolved tickets with different resolution times
    await createTestTicket(customer.id, admin.id, { status: 'resolved', resolvedOffset: 1 }); // 1 hour
    await createTestTicket(customer.id, admin.id, { status: 'resolved', resolvedOffset: 3 }); // 3 hours
    await createTestTicket(customer.id, admin.id, { status: 'resolved', resolvedOffset: 5 }); // 5 hours
    await createTestTicket(customer.id, admin.id, { status: 'open' }); // Not resolved - should not affect average

    const stats = await getDashboardStats(admin.id);

    expect(stats.total_tickets).toBe(4);
    expect(stats.resolved_tickets).toBe(3);
    expect(stats.average_resolution_time).toBe(3.0); // (1 + 3 + 5) / 3 = 3
  });

  it('should return zero average resolution time when no tickets are resolved', async () => {
    const admin = await createTestUser('admin');
    const customer = await createTestCustomer();

    // Create only non-resolved tickets
    await createTestTicket(customer.id, admin.id, { status: 'open' });
    await createTestTicket(customer.id, admin.id, { status: 'pending' });

    const stats = await getDashboardStats(admin.id);

    expect(stats.total_tickets).toBe(2);
    expect(stats.resolved_tickets).toBe(0);
    expect(stats.average_resolution_time).toBe(0);
  });

  it('should return empty stats for user with no visible tickets', async () => {
    const tech = await createTestUser('technician');
    const customer = await createTestCustomer();

    // Create tickets not assigned to the technician
    const otherTech = await createTestUser('technician');
    await createTestTicket(customer.id, otherTech.id, { status: 'open', assignedTo: otherTech.id });

    const stats = await getDashboardStats(tech.id);

    expect(stats.total_tickets).toBe(0);
    expect(stats.open_tickets).toBe(0);
    expect(stats.pending_tickets).toBe(0);
    expect(stats.in_progress_tickets).toBe(0);
    expect(stats.resolved_tickets).toBe(0);
    expect(stats.closed_tickets).toBe(0);
    expect(stats.overdue_tickets).toBe(0);
    expect(stats.tickets_due_today).toBe(0);
    expect(stats.my_assigned_tickets).toBe(0);
    expect(stats.average_resolution_time).toBe(0);
  });

  it('should throw error for non-existent user', async () => {
    expect(getDashboardStats(99999)).rejects.toThrow(/User not found/i);
  });

  it('should handle customer role correctly', async () => {
    const customer = await createTestUser('customer');
    const customerRecord = await createTestCustomer();

    // Create a ticket - customer role should only see their assigned tickets
    await createTestTicket(customerRecord.id, customer.id, { status: 'open', assignedTo: customer.id });

    const stats = await getDashboardStats(customer.id);

    expect(stats.total_tickets).toBe(1);
    expect(stats.open_tickets).toBe(1);
    expect(stats.my_assigned_tickets).toBe(1);
  });
});