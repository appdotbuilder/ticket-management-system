import { db } from '../db';
import { userGroupsTable } from '../db/schema';
import { type UserGroup } from '../schema';

export const getUserGroups = async (): Promise<UserGroup[]> => {
  try {
    const result = await db.select()
      .from(userGroupsTable)
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch user groups:', error);
    throw error;
  }
};