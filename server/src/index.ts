import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import all schemas
import {
  createUserInputSchema,
  createUserGroupInputSchema,
  createCustomerInputSchema,
  importCustomersInputSchema,
  createTicketInputSchema,
  createTicketCaseInputSchema,
  createPendingReasonInputSchema,
  createClosingReasonInputSchema,
  updateTicketStatusInputSchema,
  scheduleTicketInputSchema,
  assignTicketInputSchema,
  ticketDashboardFiltersSchema,
  ticketExportFiltersSchema
} from './schema';

// Import all handlers
import { createUser } from './handlers/create_user';
import { createUserGroup } from './handlers/create_user_group';
import { createCustomer } from './handlers/create_customer';
import { importCustomers } from './handlers/import_customers';
import { getCustomers } from './handlers/get_customers';
import { createTicket } from './handlers/create_ticket';
import { getTickets } from './handlers/get_tickets';
import { getMyTickets } from './handlers/get_my_tickets';
import { pendingTicket } from './handlers/pending_ticket';
import { resumeTicket } from './handlers/resume_ticket';
import { scheduleTicket } from './handlers/schedule_ticket';
import { assignTicket } from './handlers/assign_ticket';
import { closeTicket } from './handlers/close_ticket';
import { getSLAReport } from './handlers/get_sla_report';
import { exportTickets } from './handlers/export_tickets';
import { createTicketCase } from './handlers/create_ticket_case';
import { getTicketCases } from './handlers/get_ticket_cases';
import { createPendingReason } from './handlers/create_pending_reason';
import { getPendingReasons } from './handlers/get_pending_reasons';
import { createClosingReason } from './handlers/create_closing_reason';
import { getClosingReasons } from './handlers/get_closing_reasons';
import { getUsers } from './handlers/get_users';
import { getUserGroups } from './handlers/get_user_groups';
import { getDashboardStats } from './handlers/get_dashboard_stats';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User Management
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),

  getUsers: publicProcedure
    .query(() => getUsers()),

  createUserGroup: publicProcedure
    .input(createUserGroupInputSchema)
    .mutation(({ input }) => createUserGroup(input)),

  getUserGroups: publicProcedure
    .query(() => getUserGroups()),

  // Customer Management
  createCustomer: publicProcedure
    .input(createCustomerInputSchema)
    .mutation(({ input }) => createCustomer(input)),

  getCustomers: publicProcedure
    .query(() => getCustomers()),

  importCustomers: publicProcedure
    .input(importCustomersInputSchema)
    .mutation(({ input }) => importCustomers(input)),

  // Ticket Management
  createTicket: publicProcedure
    .input(createTicketInputSchema)
    .mutation(({ input }) => createTicket(input)),

  getTickets: publicProcedure
    .input(ticketDashboardFiltersSchema.optional())
    .query(({ input }) => getTickets(input)),

  getMyTickets: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getMyTickets(input.userId)),

  // Ticket Status Operations
  pendingTicket: publicProcedure
    .input(updateTicketStatusInputSchema)
    .mutation(({ input }) => pendingTicket(input)),

  resumeTicket: publicProcedure
    .input(updateTicketStatusInputSchema)
    .mutation(({ input }) => resumeTicket(input)),

  closeTicket: publicProcedure
    .input(updateTicketStatusInputSchema)
    .mutation(({ input }) => closeTicket(input)),

  // Ticket Scheduling and Assignment
  scheduleTicket: publicProcedure
    .input(scheduleTicketInputSchema)
    .mutation(({ input }) => scheduleTicket(input)),

  assignTicket: publicProcedure
    .input(assignTicketInputSchema)
    .mutation(({ input }) => assignTicket(input)),

  // Master Data Management
  createTicketCase: publicProcedure
    .input(createTicketCaseInputSchema)
    .mutation(({ input }) => createTicketCase(input)),

  getTicketCases: publicProcedure
    .query(() => getTicketCases()),

  createPendingReason: publicProcedure
    .input(createPendingReasonInputSchema)
    .mutation(({ input }) => createPendingReason(input)),

  getPendingReasons: publicProcedure
    .query(() => getPendingReasons()),

  createClosingReason: publicProcedure
    .input(createClosingReasonInputSchema)
    .mutation(({ input }) => createClosingReason(input)),

  getClosingReasons: publicProcedure
    .query(() => getClosingReasons()),

  // Reporting and Dashboard
  getDashboardStats: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getDashboardStats(input.userId)),

  getSLAReport: publicProcedure
    .query(() => getSLAReport()),

  exportTickets: publicProcedure
    .input(ticketExportFiltersSchema)
    .mutation(({ input }) => exportTickets(input)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC Trouble Ticket Server listening at port: ${port}`);
}

start();