import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userGroupsTable } from '../db/schema';
import { type CreateUserGroupInput } from '../schema';
import { createUserGroup } from '../handlers/create_user_group';
import { eq } from 'drizzle-orm';

// Test input with all fields specified
const testInput: CreateUserGroupInput = {
  name: 'Test Group',
  description: 'A group for testing purposes',
  can_view_all_tickets: true,
  can_edit_all_tickets: false,
  can_delete_tickets: false,
  can_manage_users: true
};

describe('createUserGroup', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user group', async () => {
    const result = await createUserGroup(testInput);

    // Basic field validation
    expect(result.name).toEqual('Test Group');
    expect(result.description).toEqual('A group for testing purposes');
    expect(result.can_view_all_tickets).toEqual(true);
    expect(result.can_edit_all_tickets).toEqual(false);
    expect(result.can_delete_tickets).toEqual(false);
    expect(result.can_manage_users).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
  });

  it('should save user group to database', async () => {
    const result = await createUserGroup(testInput);

    // Query database to verify the record was created
    const groups = await db.select()
      .from(userGroupsTable)
      .where(eq(userGroupsTable.id, result.id))
      .execute();

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toEqual('Test Group');
    expect(groups[0].description).toEqual('A group for testing purposes');
    expect(groups[0].can_view_all_tickets).toEqual(true);
    expect(groups[0].can_edit_all_tickets).toEqual(false);
    expect(groups[0].can_delete_tickets).toEqual(false);
    expect(groups[0].can_manage_users).toEqual(true);
    expect(groups[0].created_at).toBeInstanceOf(Date);
  });

  it('should handle null description', async () => {
    const inputWithNullDescription: CreateUserGroupInput = {
      name: 'Group with No Description',
      description: null,
      can_view_all_tickets: false,
      can_edit_all_tickets: false,
      can_delete_tickets: false,
      can_manage_users: false
    };

    const result = await createUserGroup(inputWithNullDescription);

    expect(result.name).toEqual('Group with No Description');
    expect(result.description).toBeNull();
    expect(result.can_view_all_tickets).toEqual(false);
    expect(result.can_edit_all_tickets).toEqual(false);
    expect(result.can_delete_tickets).toEqual(false);
    expect(result.can_manage_users).toEqual(false);
  });

  it('should apply default values correctly', async () => {
    // Test with minimal input to verify Zod defaults are applied
    const minimalInput: CreateUserGroupInput = {
      name: 'Minimal Group',
      description: null,
      can_view_all_tickets: false,
      can_edit_all_tickets: false,
      can_delete_tickets: false,
      can_manage_users: false
    };

    const result = await createUserGroup(minimalInput);

    expect(result.name).toEqual('Minimal Group');
    expect(result.description).toBeNull();
    expect(result.can_view_all_tickets).toEqual(false);
    expect(result.can_edit_all_tickets).toEqual(false);
    expect(result.can_delete_tickets).toEqual(false);
    expect(result.can_manage_users).toEqual(false);
  });

  it('should create admin group with all permissions', async () => {
    const adminInput: CreateUserGroupInput = {
      name: 'Admin Group',
      description: 'Full admin privileges',
      can_view_all_tickets: true,
      can_edit_all_tickets: true,
      can_delete_tickets: true,
      can_manage_users: true
    };

    const result = await createUserGroup(adminInput);

    expect(result.name).toEqual('Admin Group');
    expect(result.description).toEqual('Full admin privileges');
    expect(result.can_view_all_tickets).toEqual(true);
    expect(result.can_edit_all_tickets).toEqual(true);
    expect(result.can_delete_tickets).toEqual(true);
    expect(result.can_manage_users).toEqual(true);
  });

  it('should enforce unique group name constraint', async () => {
    // Create first group
    await createUserGroup(testInput);

    // Try to create another group with the same name
    const duplicateInput: CreateUserGroupInput = {
      name: 'Test Group', // Same name as first group
      description: 'Another group with duplicate name',
      can_view_all_tickets: false,
      can_edit_all_tickets: false,
      can_delete_tickets: false,
      can_manage_users: false
    };

    await expect(createUserGroup(duplicateInput)).rejects.toThrow(/unique/i);
  });
});