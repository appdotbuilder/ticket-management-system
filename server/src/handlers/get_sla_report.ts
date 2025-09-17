import { db } from '../db';
import { customersTable, ticketsTable } from '../db/schema';
import { type SLAReport } from '../schema';
import { eq, sql, count, avg } from 'drizzle-orm';

export const getSLAReport = async (): Promise<SLAReport[]> => {
  try {
    // Get all customers with their ticket statistics
    const results = await db
      .select({
        customer_id: customersTable.id,
        customer_name: customersTable.name,
        sla_hours: customersTable.sla_hours,
        total_tickets: count(ticketsTable.id),
        // Count tickets resolved within SLA (resolved_at <= sla_due_date)
        tickets_within_sla: sql<string>`CAST(COUNT(CASE 
          WHEN ${ticketsTable.resolved_at} IS NOT NULL 
          AND ${ticketsTable.resolved_at} <= ${ticketsTable.sla_due_date} 
          THEN 1 
          END) AS TEXT)`,
        // Count tickets that breached SLA (resolved_at > sla_due_date OR still open past due date)
        tickets_breached_sla: sql<string>`CAST(COUNT(CASE 
          WHEN (${ticketsTable.resolved_at} IS NOT NULL AND ${ticketsTable.resolved_at} > ${ticketsTable.sla_due_date})
          OR (${ticketsTable.resolved_at} IS NULL AND ${ticketsTable.sla_due_date} < NOW())
          THEN 1 
          END) AS TEXT)`,
        // Average resolution time in hours for resolved tickets only
        avg_resolution_hours: sql<string>`CAST(AVG(CASE 
          WHEN ${ticketsTable.resolved_at} IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (${ticketsTable.resolved_at} - ${ticketsTable.created_at})) / 3600
          END) AS TEXT)`
      })
      .from(customersTable)
      .leftJoin(ticketsTable, eq(customersTable.id, ticketsTable.customer_id))
      .where(eq(customersTable.is_active, true))
      .groupBy(customersTable.id, customersTable.name, customersTable.sla_hours)
      .execute();

    return results.map(result => {
      const totalTickets = result.total_tickets;
      const ticketsWithinSla = parseInt(result.tickets_within_sla) || 0;
      const ticketsBreachedSla = parseInt(result.tickets_breached_sla) || 0;
      const avgResolutionHours = parseFloat(result.avg_resolution_hours) || 0;

      // Calculate SLA compliance percentage
      const slaCompliancePercentage = totalTickets > 0 
        ? (ticketsWithinSla / totalTickets) * 100 
        : 0;

      return {
        customer_id: result.customer_id,
        customer_name: result.customer_name,
        total_tickets: totalTickets,
        tickets_within_sla: ticketsWithinSla,
        tickets_breached_sla: ticketsBreachedSla,
        average_resolution_time: Math.round(avgResolutionHours * 100) / 100, // Round to 2 decimal places
        sla_compliance_percentage: Math.round(slaCompliancePercentage * 100) / 100 // Round to 2 decimal places
      };
    });
  } catch (error) {
    console.error('SLA report generation failed:', error);
    throw error;
  }
};