import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userGroupsTable } from '../db/schema';
import { type CreateUserGroupInput } from '../schema';
import { getUserGroups } from '../handlers/get_user_groups';

// Test user group inputs
const testGroup1: CreateUserGroupInput = {
  name: 'Administrators',
  description: 'Full access admin group',
  can_view_all_tickets: true,
  can_edit_all_tickets: true,
  can_delete_tickets: true,
  can_manage_users: true
};

const testGroup2: CreateUserGroupInput = {
  name: 'Technicians',
  description: 'Support technicians',
  can_view_all_tickets: true,
  can_edit_all_tickets: false,
  can_delete_tickets: false,
  can_manage_users: false
};

const testGroup3: CreateUserGroupInput = {
  name: 'Managers',
  description: null,
  can_view_all_tickets: true,
  can_edit_all_tickets: true,
  can_delete_tickets: false,
  can_manage_users: true
};

describe('getUserGroups', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no user groups exist', async () => {
    const result = await getUserGroups();

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return all user groups when they exist', async () => {
    // Create test user groups
    await db.insert(userGroupsTable)
      .values([testGroup1, testGroup2, testGroup3])
      .execute();

    const result = await getUserGroups();

    expect(result).toHaveLength(3);
    
    // Check that all groups are returned
    const groupNames = result.map(group => group.name).sort();
    expect(groupNames).toEqual(['Administrators', 'Managers', 'Technicians']);
  });

  it('should return user groups with all required fields', async () => {
    await db.insert(userGroupsTable)
      .values(testGroup1)
      .execute();

    const result = await getUserGroups();

    expect(result).toHaveLength(1);
    const group = result[0];

    // Check all required fields exist
    expect(group.id).toBeDefined();
    expect(typeof group.id).toBe('number');
    expect(group.name).toBe('Administrators');
    expect(group.description).toBe('Full access admin group');
    expect(group.can_view_all_tickets).toBe(true);
    expect(group.can_edit_all_tickets).toBe(true);
    expect(group.can_delete_tickets).toBe(true);
    expect(group.can_manage_users).toBe(true);
    expect(group.created_at).toBeInstanceOf(Date);
  });

  it('should handle null description correctly', async () => {
    await db.insert(userGroupsTable)
      .values(testGroup3)
      .execute();

    const result = await getUserGroups();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Managers');
    expect(result[0].description).toBeNull();
  });

  it('should return user groups with correct permission combinations', async () => {
    await db.insert(userGroupsTable)
      .values([testGroup1, testGroup2])
      .execute();

    const result = await getUserGroups();

    expect(result).toHaveLength(2);
    
    const adminGroup = result.find(group => group.name === 'Administrators');
    const techGroup = result.find(group => group.name === 'Technicians');

    // Check admin permissions
    expect(adminGroup).toBeDefined();
    expect(adminGroup!.can_view_all_tickets).toBe(true);
    expect(adminGroup!.can_edit_all_tickets).toBe(true);
    expect(adminGroup!.can_delete_tickets).toBe(true);
    expect(adminGroup!.can_manage_users).toBe(true);

    // Check technician permissions
    expect(techGroup).toBeDefined();
    expect(techGroup!.can_view_all_tickets).toBe(true);
    expect(techGroup!.can_edit_all_tickets).toBe(false);
    expect(techGroup!.can_delete_tickets).toBe(false);
    expect(techGroup!.can_manage_users).toBe(false);
  });

  it('should return groups ordered by database insertion order', async () => {
    // Insert groups in specific order
    await db.insert(userGroupsTable)
      .values(testGroup2) // Technicians first
      .execute();
      
    await db.insert(userGroupsTable)
      .values(testGroup1) // Administrators second
      .execute();

    const result = await getUserGroups();

    expect(result).toHaveLength(2);
    // Should maintain insertion order (first inserted has lower ID)
    expect(result[0].name).toBe('Technicians');
    expect(result[1].name).toBe('Administrators');
    expect(result[0].id).toBeLessThan(result[1].id);
  });
});