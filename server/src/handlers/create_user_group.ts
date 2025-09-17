import { db } from '../db';
import { userGroupsTable } from '../db/schema';
import { type CreateUserGroupInput, type UserGroup } from '../schema';

export const createUserGroup = async (input: CreateUserGroupInput): Promise<UserGroup> => {
  try {
    // Insert user group record
    const result = await db.insert(userGroupsTable)
      .values({
        name: input.name,
        description: input.description,
        can_view_all_tickets: input.can_view_all_tickets,
        can_edit_all_tickets: input.can_edit_all_tickets,
        can_delete_tickets: input.can_delete_tickets,
        can_manage_users: input.can_manage_users
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User group creation failed:', error);
    throw error;
  }
};