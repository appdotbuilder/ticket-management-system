import { type CreatePendingReasonInput, type PendingReason } from '../schema';

export async function createPendingReason(input: CreatePendingReasonInput): Promise<PendingReason> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is creating master data for pending ticket reasons.
    return Promise.resolve({
        id: 0, // Placeholder ID
        reason: input.reason,
        description: input.description,
        is_active: input.is_active,
        created_at: new Date()
    } as PendingReason);
}