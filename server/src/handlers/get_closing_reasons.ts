import { db } from '../db';
import { closingReasonsTable } from '../db/schema';
import { type ClosingReason } from '../schema';
import { eq } from 'drizzle-orm';

export const getClosingReasons = async (): Promise<ClosingReason[]> => {
  try {
    const results = await db.select()
      .from(closingReasonsTable)
      .where(eq(closingReasonsTable.is_active, true))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch closing reasons:', error);
    throw error;
  }
};