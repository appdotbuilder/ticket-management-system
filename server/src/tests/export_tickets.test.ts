import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  customersTable, 
  ticketsTable, 
  userGroupsTable,
  ticketCasesTable,
  pendingReasonsTable,
  closingReasonsTable,
  ticketHistoryTable
} from '../db/schema';
import { type TicketExportFilters } from '../schema';
import { exportTickets } from '../handlers/export_tickets';

// Helper function to create test data
const createTestData = async () => {
  // Create user group
  const userGroup = await db.insert(userGroupsTable)
    .values({
      name: 'Test Group',
      description: 'A group for testing'
    })
    .returning()
    .execute();

  // Create users
  const users = await db.insert(usersTable)
    .values([
      {
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        group_id: userGroup[0].id
      },
      {
        email: 'tech@test.com',
        name: 'Test Technician', 
        role: 'technician',
        group_id: userGroup[0].id
      }
    ])
    .returning()
    .execute();

  // Create customers
  const customers = await db.insert(customersTable)
    .values([
      {
        name: 'Test Customer 1',
        email: 'customer1@test.com',
        company: 'Test Company 1',
        sla_hours: 24
      },
      {
        name: 'Test Customer 2',
        email: 'customer2@test.com',
        company: 'Test Company 2',
        sla_hours: 48
      }
    ])
    .returning()
    .execute();

  // Create ticket case
  const ticketCase = await db.insert(ticketCasesTable)
    .values({
      name: 'Software Issue',
      description: 'Software related problems'
    })
    .returning()
    .execute();

  // Create pending reason
  const pendingReason = await db.insert(pendingReasonsTable)
    .values({
      reason: 'Waiting for Customer',
      description: 'Waiting for customer response'
    })
    .returning()
    .execute();

  // Create closing reason
  const closingReason = await db.insert(closingReasonsTable)
    .values({
      reason: 'Issue Resolved',
      description: 'Problem has been resolved'
    })
    .returning()
    .execute();

  // Create tickets with different statuses and priorities
  const tickets = await db.insert(ticketsTable)
    .values([
      {
        ticket_number: 'TKT-001',
        title: 'High Priority Ticket',
        description: 'This is a critical issue',
        status: 'open',
        priority: 'high',
        customer_id: customers[0].id,
        assigned_to: users[1].id,
        created_by: users[0].id,
        case_id: ticketCase[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
      },
      {
        ticket_number: 'TKT-002',
        title: 'Medium Priority Ticket',
        description: 'This is a medium priority issue',
        status: 'pending',
        priority: 'medium',
        customer_id: customers[1].id,
        assigned_to: users[1].id,
        created_by: users[0].id,
        pending_reason_id: pendingReason[0].id,
        sla_due_date: new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours from now
      },
      {
        ticket_number: 'TKT-003',
        title: 'Low Priority Ticket',
        description: 'This is a low priority issue',
        status: 'closed',
        priority: 'low',
        customer_id: customers[0].id,
        created_by: users[0].id,
        closing_reason_id: closingReason[0].id,
        resolved_at: new Date(),
        closed_at: new Date(),
        sla_due_date: new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours from now
      }
    ])
    .returning()
    .execute();

  // Create ticket history
  await db.insert(ticketHistoryTable)
    .values([
      {
        ticket_id: tickets[0].id,
        changed_by: users[0].id,
        field_name: 'status',
        old_value: 'open',
        new_value: 'in_progress',
        change_reason: 'Starting work on the ticket'
      },
      {
        ticket_id: tickets[1].id,
        changed_by: users[1].id,
        field_name: 'priority',
        old_value: 'low',
        new_value: 'medium',
        change_reason: 'Escalating priority'
      }
    ])
    .execute();

  return { users, customers, tickets, userGroup, ticketCase, pendingReason, closingReason };
};

describe('exportTickets', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should export all tickets when no filters applied', async () => {
    await createTestData();

    const filters: TicketExportFilters = {
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toBeDefined();
    expect(typeof csvData).toBe('string');
    
    // Should contain headers
    expect(csvData).toContain('Ticket Number');
    expect(csvData).toContain('Title');
    expect(csvData).toContain('Status');
    expect(csvData).toContain('Priority');
    expect(csvData).toContain('Customer Name');
    
    // Should contain ticket data
    expect(csvData).toContain('TKT-001');
    expect(csvData).toContain('TKT-002');
    expect(csvData).toContain('TKT-003');
    expect(csvData).toContain('High Priority Ticket');
    expect(csvData).toContain('Test Customer 1');
    expect(csvData).toContain('Test Customer 2');
  });

  it('should filter tickets by status', async () => {
    await createTestData();

    const filters: TicketExportFilters = {
      status: 'open',
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('TKT-001'); // open ticket
    expect(csvData).not.toContain('TKT-002'); // pending ticket
    expect(csvData).not.toContain('TKT-003'); // closed ticket
  });

  it('should filter tickets by priority', async () => {
    await createTestData();

    const filters: TicketExportFilters = {
      priority: 'high',
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('TKT-001'); // high priority
    expect(csvData).not.toContain('TKT-002'); // medium priority
    expect(csvData).not.toContain('TKT-003'); // low priority
  });

  it('should filter tickets by customer', async () => {
    const { customers } = await createTestData();

    const filters: TicketExportFilters = {
      customer_id: customers[0].id,
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('TKT-001'); // customer 1
    expect(csvData).toContain('TKT-003'); // customer 1
    expect(csvData).not.toContain('TKT-002'); // customer 2
    expect(csvData).toContain('Test Customer 1');
    expect(csvData).not.toContain('Test Customer 2');
  });

  it('should filter tickets by assigned user', async () => {
    const { users } = await createTestData();

    const filters: TicketExportFilters = {
      assigned_to: users[1].id,
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('TKT-001'); // assigned to technician
    expect(csvData).toContain('TKT-002'); // assigned to technician
    expect(csvData).not.toContain('TKT-003'); // not assigned
  });

  it('should filter tickets by date range', async () => {
    await createTestData();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const filters: TicketExportFilters = {
      date_from: yesterday,
      date_to: tomorrow,
      include_history: false
    };
    const csvData = await exportTickets(filters);

    // All tickets should be included since they were created today
    expect(csvData).toContain('TKT-001');
    expect(csvData).toContain('TKT-002');
    expect(csvData).toContain('TKT-003');
  });

  it('should include ticket history when requested', async () => {
    await createTestData();

    const filters: TicketExportFilters = {
      include_history: true
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('Ticket History');
    expect(csvData).toContain('Field Changed');
    expect(csvData).toContain('Old Value');
    expect(csvData).toContain('New Value');
    expect(csvData).toContain('status'); // field name from history
    expect(csvData).toContain('priority'); // field name from history
    expect(csvData).toContain('Starting work on the ticket'); // change reason
  });

  it('should not include history when not requested', async () => {
    await createTestData();

    const filters: TicketExportFilters = {
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).not.toContain('Ticket History');
    expect(csvData).not.toContain('Field Changed');
  });

  it('should handle multiple filters correctly', async () => {
    const { users, customers } = await createTestData();

    const filters: TicketExportFilters = {
      status: 'pending',
      priority: 'medium',
      customer_id: customers[1].id,
      assigned_to: users[1].id,
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('TKT-002'); // matches all criteria
    expect(csvData).not.toContain('TKT-001'); // different status and customer
    expect(csvData).not.toContain('TKT-003'); // different status, priority, customer
  });

  it('should properly escape CSV fields with commas', async () => {
    const { customers, users } = await createTestData();

    // Create ticket with description containing commas
    await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-004',
        title: 'Test, with, commas',
        description: 'This description contains, commas, and should be escaped',
        status: 'open',
        priority: 'medium',
        customer_id: customers[0].id,
        created_by: users[0].id,
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      })
      .execute();

    const filters: TicketExportFilters = {
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('"Test, with, commas"');
    expect(csvData).toContain('"This description contains, commas, and should be escaped"');
  });

  it('should handle empty result set', async () => {
    // Don't create any test data
    const filters: TicketExportFilters = {
      status: 'open',
      include_history: false
    };
    const csvData = await exportTickets(filters);

    // Should still contain headers
    expect(csvData).toContain('Ticket Number');
    expect(csvData).toContain('Title');
    
    // Should not contain any ticket data
    expect(csvData).not.toContain('TKT-');
  });

  it('should handle tickets with null optional fields', async () => {
    const { customers, users } = await createTestData();

    // Create ticket with minimal data (nulls for optional fields)
    await db.insert(ticketsTable)
      .values({
        ticket_number: 'TKT-005',
        title: 'Minimal Ticket',
        description: 'Ticket with minimal data',
        status: 'open',
        priority: 'low',
        customer_id: customers[0].id,
        created_by: users[0].id,
        // assigned_to: null (not provided)
        // case_id: null (not provided)
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
      })
      .execute();

    const filters: TicketExportFilters = {
      include_history: false
    };
    const csvData = await exportTickets(filters);

    expect(csvData).toContain('TKT-005');
    expect(csvData).toContain('Minimal Ticket');
    // Should handle null fields gracefully
  });

  it('should include all relevant ticket information', async () => {
    await createTestData();

    const filters: TicketExportFilters = {
      include_history: false
    };
    const csvData = await exportTickets(filters);

    // Check that all expected columns are present
    const expectedColumns = [
      'Ticket Number',
      'Title',
      'Description', 
      'Status',
      'Priority',
      'Customer Name',
      'Customer Email',
      'Customer Company',
      'Assigned To',
      'Assigned Email',
      'Created By',
      'Created By Email',
      'Case',
      'Pending Reason',
      'Closing Reason',
      'Scheduled Date',
      'SLA Due Date',
      'Resolved At',
      'Closed At',
      'Created At',
      'Updated At'
    ];

    expectedColumns.forEach(column => {
      expect(csvData).toContain(column);
    });

    // Verify specific data values
    expect(csvData).toContain('Test Company 1');
    expect(csvData).toContain('customer1@test.com');
    expect(csvData).toContain('Test Admin');
    expect(csvData).toContain('admin@test.com');
    expect(csvData).toContain('Test Technician');
    expect(csvData).toContain('Software Issue');
    expect(csvData).toContain('Waiting for Customer');
    expect(csvData).toContain('Issue Resolved');
  });
});