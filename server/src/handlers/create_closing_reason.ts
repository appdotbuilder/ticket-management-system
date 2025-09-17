import { db } from '../db';
import { closingReasonsTable } from '../db/schema';
import { type CreateClosingReasonInput, type ClosingReason } from '../schema';

export const createClosingReason = async (input: CreateClosingReasonInput): Promise<ClosingReason> => {
  try {
    // Insert closing reason record
    const result = await db.insert(closingReasonsTable)
      .values({
        reason: input.reason,
        description: input.description,
        is_active: input.is_active
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Closing reason creation failed:', error);
    throw error;
  }
};