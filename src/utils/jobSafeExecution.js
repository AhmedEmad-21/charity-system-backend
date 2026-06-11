const SystemAuditLog = require('../models/systemAuditLogModel');
const { ConflictError } = require('../errors/appErrors');

/**
 * 🔐 MILESTONE 8 & 9: Job Locking & Safe Allocation Engine
 * 
 * Prevents concurrent execution of critical system jobs:
 * - Monthly points reset
 * - Priority recalculation
 * - Smart allocation algorithm
 * 
 * Uses in-memory Set for lightweight lock management
 */

// In-memory lock registry for active jobs
const ACTIVE_JOBS = new Set();

// Job status enum
const JobStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * MILESTONE 8: Acquire job lock
 * Returns true if lock acquired, false if already running
 * @param {string} jobName - Unique job identifier
 * @param {Object} options - { maxDuration: ms, autoRelease: true }
 */
function acquireJobLock(jobName, options = {}) {
  const { maxDuration = 60 * 60 * 1000, autoRelease = true } = options; // 1 hour default

  if (ACTIVE_JOBS.has(jobName)) {
    return false; // Already running
  }

  // Add to active set
  ACTIVE_JOBS.add(jobName);

  // Auto-release after max duration (safety valve)
  if (autoRelease) {
    const timer = setTimeout(() => {
      if (ACTIVE_JOBS.has(jobName)) {
        console.warn(
          `[JobLock] Auto-releasing job ${jobName} after ${maxDuration}ms (timeout safety)`
        );
        ACTIVE_JOBS.delete(jobName);
      }
    }, maxDuration);

    // Avoid keeping event-loop alive for long safety timers.
    timer.unref?.();
  }

  return true;
}

/**
 * MILESTONE 8: Release job lock
 */
function releaseJobLock(jobName) {
  ACTIVE_JOBS.delete(jobName);
  return true;
}

/**
 * MILESTONE 8: Check if job is running
 */
function isJobRunning(jobName) {
  return ACTIVE_JOBS.has(jobName);
}

/**
 * MILESTONE 8: Get all running jobs
 */
function getRunningJobs() {
  return Array.from(ACTIVE_JOBS);
}

/**
 * MILESTONE 9: Safe execution wrapper for allocation engine
 * Ensures job-lock protection with automatic cleanup
 * @param {string} jobName - Job identifier
 * @param {Function} jobFn - Function to execute
 * @param {Object} options - { userId, executionContext }
 */
async function executeJobSafely(jobName, jobFn, options = {}) {
  const { userId = 'system', executionContext = {} } = options;

  // MILESTONE 8: Try to acquire lock
  if (!acquireJobLock(jobName)) {
    throw new ConflictError(
      `Job "${jobName}" is already running. Please wait for it to complete.`,
      {
        code: 'JOB_ALREADY_RUNNING',
        jobName,
        suggestion: 'Try again in a few moments',
      }
    );
  }

  const startTime = Date.now();
  let result = null;
  let error = null;
  let timeoutHandle = null;

  try {
    console.log(`[SafeJobExecution] Starting: ${jobName}`);

    // Log job start
    await SystemAuditLog.create({
      eventType: 'job_started',
      status: 'success',
      details: {
        jobName,
        startTime: new Date(),
        context: executionContext,
      },
      executedAt: new Date(),
    }).catch((err) => {
      console.warn('[SafeJobExecution] Audit log creation failed:', err.message);
    });

    // MILESTONE 9: Execute job with timeout protection
    result = await Promise.race([
      jobFn(),
      // Reject after 55 minutes (safety valve)
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error('Job execution timeout')),
          55 * 60 * 1000
        );
        timeoutHandle.unref?.();
      }),
    ]);

    const duration = Date.now() - startTime;

    // Log job completion
    await SystemAuditLog.create({
      eventType: 'job_completed',
      status: 'success',
      details: {
        jobName,
        userId,
        duration,
        resultSummary: typeof result === 'object' ? result : { status: 'completed' },
      },
      executedAt: new Date(),
    }).catch((err) => {
      console.warn('[SafeJobExecution] Audit log creation failed:', err.message);
    });

    console.log(`[SafeJobExecution] Completed: ${jobName} (${duration}ms)`);

    return result;
  } catch (err) {
    error = err;
    const duration = Date.now() - startTime;

    // Log job failure
    await SystemAuditLog.create({
      eventType: 'job_failed',
      status: 'failed',
      details: {
        jobName,
        userId,
        duration,
        error: err.message,
        code: err.code,
      },
      executedAt: new Date(),
    }).catch((errLog) => {
      console.warn('[SafeJobExecution] Audit log creation failed:', errLog.message);
    });

    console.error(`[SafeJobExecution] Failed: ${jobName}`, err.message);

    throw err;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    // MILESTONE 8: Always release lock
    releaseJobLock(jobName);
  }
}

/**
 * MILESTONE 9: Wrapper for allocation engine
 * Executes allocation with full safety: locking, auditing, error handling
 */
async function executeAllocationSafely(allocationFn, options = {}) {
  return executeJobSafely('ALLOCATION_ENGINE', allocationFn, {
    userId: options.userId || 'system',
    executionContext: {
      type: 'allocation',
      timestamp: new Date(),
      ...options.context,
    },
  });
}

/**
 * MILESTONE 9: Wrapper for monthly reset
 */
async function executeMonthlyResetSafely(resetFn, options = {}) {
  return executeJobSafely('MONTHLY_POINTS_RESET', resetFn, {
    userId: options.userId || 'system',
    executionContext: {
      type: 'monthly_reset',
      timestamp: new Date(),
      ...options.context,
    },
  });
}

/**
 * MILESTONE 9: Wrapper for priority recalculation
 */
async function executePriorityRecalcSafely(recalcFn, options = {}) {
  return executeJobSafely('PRIORITY_RECALCULATION', recalcFn, {
    userId: options.userId || 'system',
    executionContext: {
      type: 'priority_recalc',
      timestamp: new Date(),
      ...options.context,
    },
  });
}

/**
 * MILESTONE 13: Health check for system jobs
 * Returns status of all critical jobs
 */
async function getJobHealthStatus() {
  return {
    runningJobs: getRunningJobs(),
    timestamp: new Date(),
    systemHealthy: ACTIVE_JOBS.size < 3, // Alert if too many jobs queued
  };
}

module.exports = {
  // Job lock management
  acquireJobLock,
  releaseJobLock,
  isJobRunning,
  getRunningJobs,

  // Safe job execution
  executeJobSafely,
  executeAllocationSafely,
  executeMonthlyResetSafely,
  executePriorityRecalcSafely,

  // Health monitoring
  getJobHealthStatus,

  // Enums
  JobStatus,
};
