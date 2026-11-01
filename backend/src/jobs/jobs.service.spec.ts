import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
import { DatabaseService } from '../database/database.service.js';

describe('JobsService.updateJobStatus', () => {
  let service: JobsService;
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = vi.fn();
    const fakeDb = { query } as unknown as DatabaseService;
    service = new JobsService(fakeDb);
  });

  // Legal transitions: one test per row in this table
  it.each([
    ['pending', 'running'],
    ['running', 'completed'],
    ['running', 'failed'],
  ])('allows %s -> %s', async (from, to) => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: from }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, status: to }] });

    const result = await service.updateJobStatus(1, { status: to as any });

    expect(result).toEqual({ id: 1, status: to });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE jobs'),
      [to, 1, from],
    );
  });

  // Illegal transitions: every pair that is NOT in the allowed list
  it.each([
    ['pending', 'pending'],
    ['pending', 'completed'],
    ['pending', 'failed'],
    ['running', 'pending'],
    ['running', 'running'],
    ['completed', 'pending'],
    ['completed', 'running'],
    ['completed', 'completed'],
    ['completed', 'failed'],
    ['failed', 'pending'],
    ['failed', 'running'],
    ['failed', 'completed'],
    ['failed', 'failed'],
  ])('rejects %s -> %s', async (from, to) => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, status: from }] });

    await expect(
      service.updateJobStatus(1, { status: to as any }),
    ).rejects.toThrow(BadRequestException);

    // Only the SELECT ran. The UPDATE was never attempted.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundException when the job does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.updateJobStatus(99, { status: 'running' }),
    ).rejects.toThrow(NotFoundException);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictException when the status changed before the update', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE matched no row

    await expect(
      service.updateJobStatus(1, { status: 'running' }),
    ).rejects.toThrow(ConflictException);
  });
});