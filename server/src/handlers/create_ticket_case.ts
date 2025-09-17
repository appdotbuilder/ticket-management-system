import { db } from '../db';
import { ticketCasesTable } from '../db/schema';
import { type CreateTicketCaseInput, type TicketCase } from '../schema';

export const createTicketCase = async (input: CreateTicketCaseInput): Promise<TicketCase> => {
  try {
    // Insert ticket case record
    const result = await db.insert(ticketCasesTable)
      .values({
        name: input.name,
        description: input.description,
        is_active: input.is_active
      })
      .returning()
      .execute();

    // Return the created ticket case
    return result[0];
  } catch (error) {
    console.error('Ticket case creation failed:', error);
    throw error;
  }
};