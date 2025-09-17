import { z } from 'zod';

// Enums for various ticket statuses and types
export const userRoleSchema = z.enum(['admin', 'manager', 'technician', 'customer']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const ticketStatusSchema = z.enum(['open', 'pending', 'in_progress', 'resolved', 'closed']);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  group_id: z.number().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// User group schema
export const userGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  can_view_all_tickets: z.boolean(),
  can_edit_all_tickets: z.boolean(),
  can_delete_tickets: z.boolean(),
  can_manage_users: z.boolean(),
  created_at: z.coerce.date()
});

export type UserGroup = z.infer<typeof userGroupSchema>;

// Customer schema
export const customerSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  company: z.string().nullable(),
  sla_hours: z.number().int(), // SLA response time in hours
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Customer = z.infer<typeof customerSchema>;

// Master data schemas
export const ticketCaseSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type TicketCase = z.infer<typeof ticketCaseSchema>;

export const pendingReasonSchema = z.object({
  id: z.number(),
  reason: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type PendingReason = z.infer<typeof pendingReasonSchema>;

export const closingReasonSchema = z.object({
  id: z.number(),
  reason: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type ClosingReason = z.infer<typeof closingReasonSchema>;

// Main ticket schema
export const ticketSchema = z.object({
  id: z.number(),
  ticket_number: z.string(),
  title: z.string(),
  description: z.string(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  customer_id: z.number(),
  assigned_to: z.number().nullable(),
  created_by: z.number(),
  case_id: z.number().nullable(),
  pending_reason_id: z.number().nullable(),
  closing_reason_id: z.number().nullable(),
  scheduled_date: z.coerce.date().nullable(),
  sla_due_date: z.coerce.date(),
  resolved_at: z.coerce.date().nullable(),
  closed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Ticket = z.infer<typeof ticketSchema>;

// Ticket history schema for tracking changes
export const ticketHistorySchema = z.object({
  id: z.number(),
  ticket_id: z.number(),
  changed_by: z.number(),
  field_name: z.string(),
  old_value: z.string().nullable(),
  new_value: z.string().nullable(),
  change_reason: z.string().nullable(),
  created_at: z.coerce.date()
});

export type TicketHistory = z.infer<typeof ticketHistorySchema>;

// Input schemas for creating
export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  group_id: z.number().nullable(),
  is_active: z.boolean().default(true)
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const createUserGroupInputSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  can_view_all_tickets: z.boolean().default(false),
  can_edit_all_tickets: z.boolean().default(false),
  can_delete_tickets: z.boolean().default(false),
  can_manage_users: z.boolean().default(false)
});

export type CreateUserGroupInput = z.infer<typeof createUserGroupInputSchema>;

export const createCustomerInputSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  company: z.string().nullable(),
  sla_hours: z.number().int().positive(),
  is_active: z.boolean().default(true)
});

export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

export const createTicketInputSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: ticketPrioritySchema,
  customer_id: z.number(),
  assigned_to: z.number().nullable(),
  case_id: z.number().nullable(),
  scheduled_date: z.coerce.date().nullable()
});

export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;

export const createTicketCaseInputSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean().default(true)
});

export type CreateTicketCaseInput = z.infer<typeof createTicketCaseInputSchema>;

export const createPendingReasonInputSchema = z.object({
  reason: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean().default(true)
});

export type CreatePendingReasonInput = z.infer<typeof createPendingReasonInputSchema>;

export const createClosingReasonInputSchema = z.object({
  reason: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean().default(true)
});

export type CreateClosingReasonInput = z.infer<typeof createClosingReasonInputSchema>;

// Update schemas
export const updateTicketStatusInputSchema = z.object({
  ticket_id: z.number(),
  status: ticketStatusSchema,
  reason_id: z.number().nullable(),
  change_reason: z.string().nullable()
});

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusInputSchema>;

export const scheduleTicketInputSchema = z.object({
  ticket_id: z.number(),
  scheduled_date: z.coerce.date(),
  change_reason: z.string().nullable()
});

export type ScheduleTicketInput = z.infer<typeof scheduleTicketInputSchema>;

export const assignTicketInputSchema = z.object({
  ticket_id: z.number(),
  assigned_to: z.number().nullable(),
  change_reason: z.string().nullable()
});

export type AssignTicketInput = z.infer<typeof assignTicketInputSchema>;

// Dashboard and reporting schemas
export const ticketDashboardFiltersSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigned_to: z.number().optional(),
  customer_id: z.number().optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional()
});

export type TicketDashboardFilters = z.infer<typeof ticketDashboardFiltersSchema>;

export const slaReportSchema = z.object({
  customer_id: z.number(),
  customer_name: z.string(),
  total_tickets: z.number(),
  tickets_within_sla: z.number(),
  tickets_breached_sla: z.number(),
  average_resolution_time: z.number(), // in hours
  sla_compliance_percentage: z.number()
});

export type SLAReport = z.infer<typeof slaReportSchema>;

export const ticketExportFiltersSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  customer_id: z.number().optional(),
  assigned_to: z.number().optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
  include_history: z.boolean().default(false)
});

export type TicketExportFilters = z.infer<typeof ticketExportFiltersSchema>;

// Bulk customer import schema
export const importCustomersInputSchema = z.object({
  customers: z.array(createCustomerInputSchema)
});

export type ImportCustomersInput = z.infer<typeof importCustomersInputSchema>;