import { db } from '../db';
import { pendingReasonsTable } from '../db/schema';
import { type CreatePendingReasonInput, type PendingReason } from '../schema';

export const createPendingReason = async (input: CreatePendingReasonInput): Promise<PendingReason> => {
  try {
    // Insert pending reason record
    const result = await db.insert(pendingReasonsTable)
      .values({
        reason: input.reason,
        description: input.description,
        is_active: input.is_active
      })
      .returning()
      .execute();

    const pendingReason = result[0];
    return pendingReason;
  } catch (error) {
    console.error('Pending reason creation failed:', error);
    throw error;
  }
};