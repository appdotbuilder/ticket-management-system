import { db } from '../db';
import { ticketsTable, customersTable, usersTable, ticketCasesTable, pendingReasonsTable, closingReasonsTable, ticketHistoryTable } from '../db/schema';
import { type TicketExportFilters } from '../schema';
import { eq, and, gte, lte, SQL, inArray } from 'drizzle-orm';

export async function exportTickets(filters: TicketExportFilters): Promise<string> {
  try {
    // Build conditions array for filtering
    const conditions: SQL<unknown>[] = [];

    if (filters.status) {
      conditions.push(eq(ticketsTable.status, filters.status));
    }

    if (filters.priority) {
      conditions.push(eq(ticketsTable.priority, filters.priority));
    }

    if (filters.customer_id) {
      conditions.push(eq(ticketsTable.customer_id, filters.customer_id));
    }

    if (filters.assigned_to) {
      conditions.push(eq(ticketsTable.assigned_to, filters.assigned_to));
    }

    if (filters.date_from) {
      conditions.push(gte(ticketsTable.created_at, filters.date_from));
    }

    if (filters.date_to) {
      conditions.push(lte(ticketsTable.created_at, filters.date_to));
    }

    // Build query with or without conditions
    const baseQuery = db.select()
      .from(ticketsTable)
      .innerJoin(customersTable, eq(ticketsTable.customer_id, customersTable.id))
      .leftJoin(ticketCasesTable, eq(ticketsTable.case_id, ticketCasesTable.id))
      .leftJoin(pendingReasonsTable, eq(ticketsTable.pending_reason_id, pendingReasonsTable.id))
      .leftJoin(closingReasonsTable, eq(ticketsTable.closing_reason_id, closingReasonsTable.id));

    // Execute the query with optional where clause
    const rawTickets = conditions.length > 0
      ? await baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions)).execute()
      : await baseQuery.execute();

    // Get user data separately to handle the multiple user relationships
    const allUserIds = new Set<number>();
    rawTickets.forEach(result => {
      allUserIds.add(result.tickets.created_by);
      if (result.tickets.assigned_to) {
        allUserIds.add(result.tickets.assigned_to);
      }
    });

    const users = await db.select()
      .from(usersTable)
      .where(inArray(usersTable.id, Array.from(allUserIds)))
      .execute();

    const userMap = new Map(users.map(user => [user.id, user]));

    // Transform the results to include user data
    const tickets = rawTickets.map(result => {
      const createdByUser = userMap.get(result.tickets.created_by);
      const assignedUser = result.tickets.assigned_to ? userMap.get(result.tickets.assigned_to) : null;

      return {
        // Ticket fields
        id: result.tickets.id,
        ticket_number: result.tickets.ticket_number,
        title: result.tickets.title,
        description: result.tickets.description,
        status: result.tickets.status,
        priority: result.tickets.priority,
        scheduled_date: result.tickets.scheduled_date,
        sla_due_date: result.tickets.sla_due_date,
        resolved_at: result.tickets.resolved_at,
        closed_at: result.tickets.closed_at,
        created_at: result.tickets.created_at,
        updated_at: result.tickets.updated_at,
        // Customer data
        customer_name: result.customers.name,
        customer_email: result.customers.email,
        customer_company: result.customers.company,
        // User data
        assigned_user_name: assignedUser?.name || null,
        assigned_user_email: assignedUser?.email || null,
        created_by_name: createdByUser?.name || 'Unknown',
        created_by_email: createdByUser?.email || 'Unknown',
        // Case data
        case_name: result.ticket_cases?.name || null,
        // Reason data
        pending_reason: result.pending_reasons?.reason || null,
        closing_reason: result.closing_reasons?.reason || null
      };
    });

    // Get ticket history if requested
    let ticketHistory: any[] = [];
    if (filters.include_history && tickets.length > 0) {
      const ticketIds = tickets.map(t => t.id);
      
      const historyResults = await db.select()
        .from(ticketHistoryTable)
        .innerJoin(usersTable, eq(ticketHistoryTable.changed_by, usersTable.id))
        .where(inArray(ticketHistoryTable.ticket_id, ticketIds))
        .execute();

      ticketHistory = historyResults.map(result => ({
        ticket_id: result.ticket_history.ticket_id,
        field_name: result.ticket_history.field_name,
        old_value: result.ticket_history.old_value,
        new_value: result.ticket_history.new_value,
        change_reason: result.ticket_history.change_reason,
        changed_by_name: result.users.name,
        changed_at: result.ticket_history.created_at
      }));
    }

    // Convert to CSV format
    let csvContent = '';

    // Add ticket data headers
    const ticketHeaders = [
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

    csvContent += ticketHeaders.join(',') + '\n';

    // Add ticket data rows
    for (const ticket of tickets) {
      const row = [
        escapeCSVField(ticket.ticket_number),
        escapeCSVField(ticket.title),
        escapeCSVField(ticket.description),
        escapeCSVField(ticket.status),
        escapeCSVField(ticket.priority),
        escapeCSVField(ticket.customer_name),
        escapeCSVField(ticket.customer_email),
        escapeCSVField(ticket.customer_company),
        escapeCSVField(ticket.assigned_user_name),
        escapeCSVField(ticket.assigned_user_email),
        escapeCSVField(ticket.created_by_name),
        escapeCSVField(ticket.created_by_email),
        escapeCSVField(ticket.case_name),
        escapeCSVField(ticket.pending_reason),
        escapeCSVField(ticket.closing_reason),
        escapeCSVField(ticket.scheduled_date?.toISOString()),
        escapeCSVField(ticket.sla_due_date.toISOString()),
        escapeCSVField(ticket.resolved_at?.toISOString()),
        escapeCSVField(ticket.closed_at?.toISOString()),
        escapeCSVField(ticket.created_at.toISOString()),
        escapeCSVField(ticket.updated_at.toISOString())
      ];
      csvContent += row.join(',') + '\n';
    }

    // Add history data if requested
    if (filters.include_history && ticketHistory.length > 0) {
      csvContent += '\n\nTicket History\n';
      const historyHeaders = [
        'Ticket ID',
        'Field Changed',
        'Old Value',
        'New Value',
        'Change Reason',
        'Changed By',
        'Changed At'
      ];
      csvContent += historyHeaders.join(',') + '\n';

      for (const history of ticketHistory) {
        const historyRow = [
          escapeCSVField(history.ticket_id.toString()),
          escapeCSVField(history.field_name),
          escapeCSVField(history.old_value),
          escapeCSVField(history.new_value),
          escapeCSVField(history.change_reason),
          escapeCSVField(history.changed_by_name),
          escapeCSVField(history.changed_at.toISOString())
        ];
        csvContent += historyRow.join(',') + '\n';
      }
    }

    return csvContent;
  } catch (error) {
    console.error('Ticket export failed:', error);
    throw error;
  }
}

// Helper function to escape CSV fields
function escapeCSVField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If the value contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  
  return stringValue;
}