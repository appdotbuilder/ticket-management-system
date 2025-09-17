import { db } from '../db';
import { usersTable, userGroupsTable } from '../db/schema';
import { type User } from '../schema';
import { eq } from 'drizzle-orm';

export async function getUsers(): Promise<User[]> {
  try {
    // Fetch users with their group information using a left join
    // to include users even if they don't have a group
    const results = await db.select()
      .from(usersTable)
      .leftJoin(userGroupsTable, eq(usersTable.group_id, userGroupsTable.id))
      .execute();

    // Transform the results to match the User schema
    return results.map(result => ({
      id: result.users.id,
      email: result.users.email,
      name: result.users.name,
      role: result.users.role,
      group_id: result.users.group_id,
      is_active: result.users.is_active,
      created_at: result.users.created_at,
      updated_at: result.users.updated_at
    }));
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
}