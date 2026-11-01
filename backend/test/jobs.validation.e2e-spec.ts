import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JobsController } from '../src/jobs/jobs.controller.js';
import { JobsService } from '../src/jobs/jobs.service.js';

describe('Jobs API request validation', () => {
  let app: INestApplication;

  // Fake service: these tests check the controller and validation layer only
  const jobsService = {
    getAllJobs: vi.fn(),
    createJob: vi.fn(),
    getJobById: vi.fn(),
    updateJobStatus: vi.fn(),
    deleteJob: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [{ provide: JobsService, useValue: jobsService }],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same options as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /jobs/health returns ok', async () => {
    await request(app.getHttpServer())
      .get('/jobs/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  describe('non-integer IDs', () => {
    it('GET /jobs/abc returns 400', async () => {
      await request(app.getHttpServer()).get('/jobs/abc').expect(400);
      expect(jobsService.getJobById).not.toHaveBeenCalled();
    });

    it('PATCH /jobs/abc/status returns 400', async () => {
      await request(app.getHttpServer())
        .patch('/jobs/abc/status')
        .send({ status: 'running' })
        .expect(400);
      expect(jobsService.updateJobStatus).not.toHaveBeenCalled();
    });

    it('DELETE /jobs/abc returns 400', async () => {
      await request(app.getHttpServer()).delete('/jobs/abc').expect(400);
      expect(jobsService.deleteJob).not.toHaveBeenCalled();
    });
  });

  describe('POST /jobs', () => {
    it('creates a job from a valid body', async () => {
      jobsService.createJob.mockResolvedValue({ id: 1, status: 'pending' });

      const res = await request(app.getHttpServer())
        .post('/jobs')
        .send({ title: 'Send emails', type: 'email' })
        .expect(201);

      expect(res.body.id).toBe(1);
      expect(jobsService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Send emails', type: 'email' }),
      );
    });

    it('accepts a title of exactly 255 characters (boundary)', async () => {
      jobsService.createJob.mockResolvedValue({ id: 2 });

      await request(app.getHttpServer())
        .post('/jobs')
        .send({ title: 'a'.repeat(255), type: 'email' })
        .expect(201);
    });

    it.each([
      ['missing title', { type: 'email' }],
      ['missing type', { title: 'Send emails' }],
      ['empty body', {}],
      ['empty title', { title: '', type: 'email' }],
      ['empty type', { title: 'Send emails', type: '' }],
      ['non-string title', { title: 123, type: 'email' }],
      ['title over 255 characters', { title: 'a'.repeat(256), type: 'email' }],
      ['type over 100 characters', { title: 'Send emails', type: 'a'.repeat(101) }],
      ['unknown extra field', { title: 'Send emails', type: 'email', priority: 'high' }],
    ])('rejects %s with 400', async (_name, body) => {
      await request(app.getHttpServer()).post('/jobs').send(body).expect(400);
      expect(jobsService.createJob).not.toHaveBeenCalled();
    });

    it.todo('rejects a whitespace-only title (known gap: @IsNotEmpty does not trim)');
  });

  describe('PATCH /jobs/:id/status', () => {
    it('passes a valid status and a numeric ID to the service', async () => {
      jobsService.updateJobStatus.mockResolvedValue({ id: 1, status: 'running' });

      await request(app.getHttpServer())
        .patch('/jobs/1/status')
        .send({ status: 'running' })
        .expect(200);

      expect(jobsService.updateJobStatus).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'running' }),
      );
    });

    it.each([
      ['missing status', {}],
      ['unknown status name', { status: 'banana' }],
      ['non-string status', { status: 5 }],
      ['unknown extra field', { status: 'running', priority: 'high' }],
    ])('rejects %s with 400', async (_name, body) => {
      await request(app.getHttpServer())
        .patch('/jobs/1/status')
        .send(body)
        .expect(400);
      expect(jobsService.updateJobStatus).not.toHaveBeenCalled();
    });
  });
});