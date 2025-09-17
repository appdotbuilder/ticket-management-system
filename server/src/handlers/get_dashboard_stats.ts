import { db } from '../db';
import { ticketsTable, usersTable, userGroupsTable } from '../db/schema';
import { eq, and, count, sql, isNull, avg } from 'drizzle-orm';

export interface DashboardStats {
  total_tickets: number;
  open_tickets: number;
  pending_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  overdue_tickets: number;
  tickets_due_today: number;
  my_assigned_tickets: number;
  average_resolution_time: number; // in hours
}

export async function getDashboardStats(userId: number): Promise<DashboardStats> {
  try {
    // Get user info and permissions
    const userResult = await db.select({
      role: usersTable.role,
      group_id: usersTable.group_id,
      can_view_all_tickets: userGroupsTable.can_view_all_tickets
    })
    .from(usersTable)
    .leftJoin(userGroupsTable, eq(usersTable.group_id, userGroupsTable.id))
    .where(eq(usersTable.id, userId))
    .execute();

    if (userResult.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult[0];
    const canViewAllTickets = user.role === 'admin' || user.role === 'manager' || user.can_view_all_tickets === true;

    // Build and execute query with permission filtering
    let query = db.select({
      id: ticketsTable.id,
      status: ticketsTable.status,
      assigned_to: ticketsTable.assigned_to,
      sla_due_date: ticketsTable.sla_due_date,
      created_at: ticketsTable.created_at,
      resolved_at: ticketsTable.resolved_at
    }).from(ticketsTable);

    // Apply permission filtering and execute
    const tickets = canViewAllTickets 
      ? await query.execute()
      : await query.where(eq(ticketsTable.assigned_to, userId)).execute();

    // Calculate current date boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Initialize stats
    const stats = {
      total_tickets: tickets.length,
      open_tickets: 0,
      pending_tickets: 0,
      in_progress_tickets: 0,
      resolved_tickets: 0,
      closed_tickets: 0,
      overdue_tickets: 0,
      tickets_due_today: 0,
      my_assigned_tickets: 0,
      average_resolution_time: 0
    };

    // Calculate resolution times for average
    const resolutionTimes: number[] = [];

    // Process each ticket
    for (const ticket of tickets) {
      // Count by status
      switch (ticket.status) {
        case 'open':
          stats.open_tickets++;
          break;
        case 'pending':
          stats.pending_tickets++;
          break;
        case 'in_progress':
          stats.in_progress_tickets++;
          break;
        case 'resolved':
          stats.resolved_tickets++;
          break;
        case 'closed':
          stats.closed_tickets++;
          break;
      }

      // Count my assigned tickets
      if (ticket.assigned_to === userId) {
        stats.my_assigned_tickets++;
      }

      // Check if overdue (SLA due date passed and not resolved/closed)
      if (ticket.sla_due_date && ticket.sla_due_date < now && 
          ticket.status !== 'resolved' && ticket.status !== 'closed') {
        stats.overdue_tickets++;
      }

      // Check if due today
      if (ticket.sla_due_date && 
          ticket.sla_due_date >= todayStart && 
          ticket.sla_due_date < todayEnd &&
          ticket.status !== 'resolved' && ticket.status !== 'closed') {
        stats.tickets_due_today++;
      }

      // Calculate resolution time if resolved
      if (ticket.resolved_at && ticket.created_at) {
        const resolutionTimeMs = ticket.resolved_at.getTime() - ticket.created_at.getTime();
        const resolutionTimeHours = resolutionTimeMs / (1000 * 60 * 60);
        resolutionTimes.push(resolutionTimeHours);
      }
    }

    // Calculate average resolution time
    if (resolutionTimes.length > 0) {
      const totalTime = resolutionTimes.reduce((sum, time) => sum + time, 0);
      stats.average_resolution_time = Math.round((totalTime / resolutionTimes.length) * 100) / 100; // Round to 2 decimal places
    }

    return stats;
  } catch (error) {
    console.error('Dashboard stats retrieval failed:', error);
    throw error;
  }
}