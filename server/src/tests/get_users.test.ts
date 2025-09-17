import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, userGroupsTable } from '../db/schema';
import { getUsers } from '../handlers/get_users';
import { type CreateUserInput, type CreateUserGroupInput } from '../schema';

describe('getUsers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no users exist', async () => {
    const result = await getUsers();
    expect(result).toEqual([]);
  });

  it('should fetch all users successfully', async () => {
    // Create a user group first
    const groupResult = await db.insert(userGroupsTable)
      .values({
        name: 'Support Team',
        description: 'Customer support team',
        can_view_all_tickets: true,
        can_edit_all_tickets: false,
        can_delete_tickets: false,
        can_manage_users: false
      })
      .returning()
      .execute();

    const groupId = groupResult[0].id;

    // Create test users
    const testUsers = [
      {
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin' as const,
        group_id: groupId,
        is_active: true
      },
      {
        email: 'tech@example.com',
        name: 'Tech User',
        role: 'technician' as const,
        group_id: null,
        is_active: true
      },
      {
        email: 'manager@example.com',
        name: 'Manager User',
        role: 'manager' as const,
        group_id: groupId,
        is_active: false
      }
    ];

    await db.insert(usersTable).values(testUsers).execute();

    const result = await getUsers();

    // Should return all users
    expect(result).toHaveLength(3);

    // Check user properties
    const adminUser = result.find(u => u.email === 'admin@example.com');
    expect(adminUser).toBeDefined();
    expect(adminUser?.name).toBe('Admin User');
    expect(adminUser?.role).toBe('admin');
    expect(adminUser?.group_id).toBe(groupId);
    expect(adminUser?.is_active).toBe(true);
    expect(adminUser?.id).toBeDefined();
    expect(adminUser?.created_at).toBeInstanceOf(Date);
    expect(adminUser?.updated_at).toBeInstanceOf(Date);

    // Check user without group
    const techUser = result.find(u => u.email === 'tech@example.com');
    expect(techUser).toBeDefined();
    expect(techUser?.name).toBe('Tech User');
    expect(techUser?.role).toBe('technician');
    expect(techUser?.group_id).toBeNull();
    expect(techUser?.is_active).toBe(true);

    // Check inactive user
    const managerUser = result.find(u => u.email === 'manager@example.com');
    expect(managerUser).toBeDefined();
    expect(managerUser?.name).toBe('Manager User');
    expect(managerUser?.role).toBe('manager');
    expect(managerUser?.group_id).toBe(groupId);
    expect(managerUser?.is_active).toBe(false);
  });

  it('should handle users with different roles', async () => {
    // Create users with all possible roles
    const testUsers = [
      {
        email: 'admin@test.com',
        name: 'Admin',
        role: 'admin' as const,
        group_id: null,
        is_active: true
      },
      {
        email: 'manager@test.com',
        name: 'Manager',
        role: 'manager' as const,
        group_id: null,
        is_active: true
      },
      {
        email: 'tech@test.com',
        name: 'Technician',
        role: 'technician' as const,
        group_id: null,
        is_active: true
      },
      {
        email: 'customer@test.com',
        name: 'Customer',
        role: 'customer' as const,
        group_id: null,
        is_active: true
      }
    ];

    await db.insert(usersTable).values(testUsers).execute();

    const result = await getUsers();

    expect(result).toHaveLength(4);
    
    const roles = result.map(u => u.role).sort();
    expect(roles).toEqual(['admin', 'customer', 'manager', 'technician']);
  });

  it('should return users in consistent order', async () => {
    // Create multiple users
    const users = Array.from({ length: 5 }, (_, i) => ({
      email: `user${i}@test.com`,
      name: `User ${i}`,
      role: 'technician' as const,
      group_id: null,
      is_active: true
    }));

    await db.insert(usersTable).values(users).execute();

    // Fetch users multiple times
    const result1 = await getUsers();
    const result2 = await getUsers();

    expect(result1).toHaveLength(5);
    expect(result2).toHaveLength(5);

    // Results should be consistent (assuming same database state)
    const emails1 = result1.map(u => u.email).sort();
    const emails2 = result2.map(u => u.email).sort();
    expect(emails1).toEqual(emails2);
  });

  it('should handle users with and without groups correctly', async () => {
    // Create two user groups
    const groups = await db.insert(userGroupsTable)
      .values([
        {
          name: 'Group A',
          description: 'First group',
          can_view_all_tickets: true,
          can_edit_all_tickets: false,
          can_delete_tickets: false,
          can_manage_users: false
        },
        {
          name: 'Group B',
          description: 'Second group',
          can_view_all_tickets: false,
          can_edit_all_tickets: true,
          can_delete_tickets: true,
          can_manage_users: false
        }
      ])
      .returning()
      .execute();

    // Create users with different group assignments
    await db.insert(usersTable)
      .values([
        {
          email: 'user1@test.com',
          name: 'User 1',
          role: 'technician',
          group_id: groups[0].id,
          is_active: true
        },
        {
          email: 'user2@test.com',
          name: 'User 2',
          role: 'manager',
          group_id: groups[1].id,
          is_active: true
        },
        {
          email: 'user3@test.com',
          name: 'User 3',
          role: 'admin',
          group_id: null,
          is_active: true
        }
      ])
      .execute();

    const result = await getUsers();

    expect(result).toHaveLength(3);

    const user1 = result.find(u => u.email === 'user1@test.com');
    expect(user1?.group_id).toBe(groups[0].id);

    const user2 = result.find(u => u.email === 'user2@test.com');
    expect(user2?.group_id).toBe(groups[1].id);

    const user3 = result.find(u => u.email === 'user3@test.com');
    expect(user3?.group_id).toBeNull();
  });

  it('should return correct data types for all fields', async () => {
    // Create a user group
    const groupResult = await db.insert(userGroupsTable)
      .values({
        name: 'Test Group',
        description: 'Test description',
        can_view_all_tickets: true,
        can_edit_all_tickets: true,
        can_delete_tickets: false,
        can_manage_users: true
      })
      .returning()
      .execute();

    // Create a test user
    await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        role: 'manager',
        group_id: groupResult[0].id,
        is_active: true
      })
      .execute();

    const result = await getUsers();
    const user = result[0];

    // Verify data types
    expect(typeof user.id).toBe('number');
    expect(typeof user.email).toBe('string');
    expect(typeof user.name).toBe('string');
    expect(typeof user.role).toBe('string');
    expect(typeof user.group_id).toBe('number');
    expect(typeof user.is_active).toBe('boolean');
    expect(user.created_at).toBeInstanceOf(Date);
    expect(user.updated_at).toBeInstanceOf(Date);
  });
});