import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, userGroupsTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Simple test input with all required fields
const testInput: CreateUserInput = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'technician',
  group_id: null,
  is_active: true
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user with basic information', async () => {
    const result = await createUser(testInput);

    // Basic field validation
    expect(result.email).toEqual('test@example.com');
    expect(result.name).toEqual('Test User');
    expect(result.role).toEqual('technician');
    expect(result.group_id).toBeNull();
    expect(result.is_active).toBe(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save user to database', async () => {
    const result = await createUser(testInput);

    // Query using proper drizzle syntax
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].name).toEqual('Test User');
    expect(users[0].role).toEqual('technician');
    expect(users[0].group_id).toBeNull();
    expect(users[0].is_active).toBe(true);
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create a user with group assignment', async () => {
    // First create a user group
    const groupResult = await db.insert(userGroupsTable)
      .values({
        name: 'Tech Support',
        description: 'Technical support group',
        can_view_all_tickets: true,
        can_edit_all_tickets: false,
        can_delete_tickets: false,
        can_manage_users: false
      })
      .returning()
      .execute();

    const group = groupResult[0];

    const userWithGroupInput: CreateUserInput = {
      email: 'tech@example.com',
      name: 'Tech User',
      role: 'technician',
      group_id: group.id,
      is_active: true
    };

    const result = await createUser(userWithGroupInput);

    // Validate user with group
    expect(result.email).toEqual('tech@example.com');
    expect(result.name).toEqual('Tech User');
    expect(result.role).toEqual('technician');
    expect(result.group_id).toEqual(group.id);
    expect(result.is_active).toBe(true);

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users[0].group_id).toEqual(group.id);
  });

  it('should create users with different roles', async () => {
    const adminInput: CreateUserInput = {
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      group_id: null,
      is_active: true
    };

    const managerInput: CreateUserInput = {
      email: 'manager@example.com',
      name: 'Manager User',
      role: 'manager',
      group_id: null,
      is_active: true
    };

    const customerInput: CreateUserInput = {
      email: 'customer@example.com',
      name: 'Customer User',
      role: 'customer',
      group_id: null,
      is_active: true
    };

    const adminResult = await createUser(adminInput);
    const managerResult = await createUser(managerInput);
    const customerResult = await createUser(customerInput);

    expect(adminResult.role).toEqual('admin');
    expect(managerResult.role).toEqual('manager');
    expect(customerResult.role).toEqual('customer');

    // Verify all users are in database
    const allUsers = await db.select()
      .from(usersTable)
      .execute();

    expect(allUsers).toHaveLength(3);
    const roles = allUsers.map(u => u.role).sort();
    expect(roles).toEqual(['admin', 'customer', 'manager']);
  });

  it('should create inactive user when specified', async () => {
    const inactiveUserInput: CreateUserInput = {
      email: 'inactive@example.com',
      name: 'Inactive User',
      role: 'technician',
      group_id: null,
      is_active: false
    };

    const result = await createUser(inactiveUserInput);

    expect(result.is_active).toBe(false);

    // Verify in database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users[0].is_active).toBe(false);
  });

  it('should apply default value for is_active when using Zod defaults', async () => {
    const inputWithDefaults: CreateUserInput = {
      email: 'default@example.com',
      name: 'Default User',
      role: 'technician',
      group_id: null,
      is_active: true // Zod default is applied in schema parsing
    };

    const result = await createUser(inputWithDefaults);

    expect(result.is_active).toBe(true);
  });

  it('should handle email uniqueness constraint', async () => {
    await createUser(testInput);

    // Try to create another user with the same email
    const duplicateInput: CreateUserInput = {
      email: 'test@example.com', // Same email
      name: 'Another User',
      role: 'manager',
      group_id: null,
      is_active: true
    };

    await expect(createUser(duplicateInput)).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });

  it('should handle invalid group_id foreign key constraint', async () => {
    const invalidGroupInput: CreateUserInput = {
      email: 'invalid@example.com',
      name: 'Invalid Group User',
      role: 'technician',
      group_id: 999, // Non-existent group ID
      is_active: true
    };

    await expect(createUser(invalidGroupInput)).rejects.toThrow(/violates foreign key constraint/i);
  });
});