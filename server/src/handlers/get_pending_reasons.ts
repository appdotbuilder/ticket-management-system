import { db } from '../db';
import { pendingReasonsTable } from '../db/schema';
import { type PendingReason } from '../schema';
import { eq } from 'drizzle-orm';

export async function getPendingReasons(): Promise<PendingReason[]> {
  try {
    const result = await db.select()
      .from(pendingReasonsTable)
      .where(eq(pendingReasonsTable.is_active, true))
      .orderBy(pendingReasonsTable.reason)
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch pending reasons:', error);
    throw error;
  }
}