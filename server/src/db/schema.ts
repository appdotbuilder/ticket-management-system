import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  integer, 
  boolean,
  pgEnum,
  varchar
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'technician', 'customer']);
export const ticketStatusEnum = pgEnum('ticket_status', ['open', 'pending', 'in_progress', 'resolved', 'closed']);
export const ticketPriorityEnum = pgEnum('ticket_priority', ['low', 'medium', 'high', 'critical']);

// User groups table
export const userGroupsTable = pgTable('user_groups', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description'),
  can_view_all_tickets: boolean('can_view_all_tickets').notNull().default(false),
  can_edit_all_tickets: boolean('can_edit_all_tickets').notNull().default(false),
  can_delete_tickets: boolean('can_delete_tickets').notNull().default(false),
  can_manage_users: boolean('can_manage_users').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull(),
  group_id: integer('group_id').references(() => userGroupsTable.id),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Customers table
export const customersTable = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 50 }),
  address: text('address'),
  company: varchar('company', { length: 255 }),
  sla_hours: integer('sla_hours').notNull().default(24), // Default 24 hour SLA
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Master data tables
export const ticketCasesTable = pgTable('ticket_cases', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull()
});

export const pendingReasonsTable = pgTable('pending_reasons', {
  id: serial('id').primaryKey(),
  reason: varchar('reason', { length: 255 }).notNull(),
  description: text('description'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull()
});

export const closingReasonsTable = pgTable('closing_reasons', {
  id: serial('id').primaryKey(),
  reason: varchar('reason', { length: 255 }).notNull(),
  description: text('description'),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Main tickets table
export const ticketsTable = pgTable('tickets', {
  id: serial('id').primaryKey(),
  ticket_number: varchar('ticket_number', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  status: ticketStatusEnum('status').notNull().default('open'),
  priority: ticketPriorityEnum('priority').notNull().default('medium'),
  customer_id: integer('customer_id').notNull().references(() => customersTable.id),
  assigned_to: integer('assigned_to').references(() => usersTable.id),
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  case_id: integer('case_id').references(() => ticketCasesTable.id),
  pending_reason_id: integer('pending_reason_id').references(() => pendingReasonsTable.id),
  closing_reason_id: integer('closing_reason_id').references(() => closingReasonsTable.id),
  scheduled_date: timestamp('scheduled_date'),
  sla_due_date: timestamp('sla_due_date').notNull(),
  resolved_at: timestamp('resolved_at'),
  closed_at: timestamp('closed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Ticket history table for audit trail
export const ticketHistoryTable = pgTable('ticket_history', {
  id: serial('id').primaryKey(),
  ticket_id: integer('ticket_id').notNull().references(() => ticketsTable.id),
  changed_by: integer('changed_by').notNull().references(() => usersTable.id),
  field_name: varchar('field_name', { length: 100 }).notNull(),
  old_value: text('old_value'),
  new_value: text('new_value'),
  change_reason: text('change_reason'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Relations
export const userGroupsRelations = relations(userGroupsTable, ({ many }) => ({
  users: many(usersTable)
}));

export const usersRelations = relations(usersTable, ({ one, many }) => ({
  group: one(userGroupsTable, {
    fields: [usersTable.group_id],
    references: [userGroupsTable.id]
  }),
  assignedTickets: many(ticketsTable, { relationName: 'assignedTo' }),
  createdTickets: many(ticketsTable, { relationName: 'createdBy' }),
  ticketHistory: many(ticketHistoryTable)
}));

export const customersRelations = relations(customersTable, ({ many }) => ({
  tickets: many(ticketsTable)
}));

export const ticketCasesRelations = relations(ticketCasesTable, ({ many }) => ({
  tickets: many(ticketsTable)
}));

export const pendingReasonsRelations = relations(pendingReasonsTable, ({ many }) => ({
  tickets: many(ticketsTable)
}));

export const closingReasonsRelations = relations(closingReasonsTable, ({ many }) => ({
  tickets: many(ticketsTable)
}));

export const ticketsRelations = relations(ticketsTable, ({ one, many }) => ({
  customer: one(customersTable, {
    fields: [ticketsTable.customer_id],
    references: [customersTable.id]
  }),
  assignedUser: one(usersTable, {
    fields: [ticketsTable.assigned_to],
    references: [usersTable.id],
    relationName: 'assignedTo'
  }),
  createdByUser: one(usersTable, {
    fields: [ticketsTable.created_by],
    references: [usersTable.id],
    relationName: 'createdBy'
  }),
  case: one(ticketCasesTable, {
    fields: [ticketsTable.case_id],
    references: [ticketCasesTable.id]
  }),
  pendingReason: one(pendingReasonsTable, {
    fields: [ticketsTable.pending_reason_id],
    references: [pendingReasonsTable.id]
  }),
  closingReason: one(closingReasonsTable, {
    fields: [ticketsTable.closing_reason_id],
    references: [closingReasonsTable.id]
  }),
  history: many(ticketHistoryTable)
}));

export const ticketHistoryRelations = relations(ticketHistoryTable, ({ one }) => ({
  ticket: one(ticketsTable, {
    fields: [ticketHistoryTable.ticket_id],
    references: [ticketsTable.id]
  }),
  changedByUser: one(usersTable, {
    fields: [ticketHistoryTable.changed_by],
    references: [usersTable.id]
  })
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type UserGroup = typeof userGroupsTable.$inferSelect;
export type NewUserGroup = typeof userGroupsTable.$inferInsert;

export type Customer = typeof customersTable.$inferSelect;
export type NewCustomer = typeof customersTable.$inferInsert;

export type Ticket = typeof ticketsTable.$inferSelect;
export type NewTicket = typeof ticketsTable.$inferInsert;

export type TicketCase = typeof ticketCasesTable.$inferSelect;
export type NewTicketCase = typeof ticketCasesTable.$inferInsert;

export type PendingReason = typeof pendingReasonsTable.$inferSelect;
export type NewPendingReason = typeof pendingReasonsTable.$inferInsert;

export type ClosingReason = typeof closingReasonsTable.$inferSelect;
export type NewClosingReason = typeof closingReasonsTable.$inferInsert;

export type TicketHistory = typeof ticketHistoryTable.$inferSelect;
export type NewTicketHistory = typeof ticketHistoryTable.$inferInsert;

// Export all tables for proper query building
export const tables = {
  users: usersTable,
  userGroups: userGroupsTable,
  customers: customersTable,
  tickets: ticketsTable,
  ticketCases: ticketCasesTable,
  pendingReasons: pendingReasonsTable,
  closingReasons: closingReasonsTable,
  ticketHistory: ticketHistoryTable
};