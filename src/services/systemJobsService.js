const cron = require("node-cron");
const mongoose = require("mongoose");
const RecipientPoints = require("../models/recipientPointsModel");
const RecipientItemQuota = require("../models/recipientItemQuotaModel");
const SystemAuditLog = require("../models/systemAuditLogModel");
const RecipientRequest = require("../models/recipientRequestModel");
const RecipientPriority = require("../models/recipientPriorityModel");
const User = require("../models/userModel");
const config = require("../config/appConfig");
const { recalculateAllRecipientPriorities } = require("./priorityService");
const { cleanupExpiredOtps } = require("./otpService");

const jobLocks = new Set();
const scheduledTasks = new Set();

const withJobSafety = async (jobName, jobFn, { retries = 2 } = {}) => {
  if (jobLocks.has(jobName)) {
    await writeAuditLogSafely({
      eventType: `${jobName}_skipped`,
      status: "failed",
      details: { reason: "job already running" },
      executedAt: new Date(),
    });
    return { skipped: true, reason: "job already running" };
  }

  jobLocks.add(jobName);
  try {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await jobFn();
      } catch (error) {
        lastError = error;
        await writeAuditLogSafely({
          eventType: `${jobName}_attempt_failed`,
          status: "failed",
          details: { attempt: attempt + 1, message: error.message },
          executedAt: new Date(),
        });
      }
    }

    throw lastError;
  } finally {
    jobLocks.delete(jobName);
  }
};

const writeAuditLogSafely = async (payload) => {
  try {
    await SystemAuditLog.create(payload);
  } catch (error) {
    console.error("[Jobs] Audit logging failed:", error.message);
  }
};

const isDifferentMonth = (firstDate, secondDate) =>
  firstDate.getFullYear() !== secondDate.getFullYear() ||
  firstDate.getMonth() !== secondDate.getMonth();

const resetMonthlyPoints = async () => {
  const approvedRecipients = await User.find({
    role: "Recipient",
    vettingStatus: "approved",
  }).select("_id");

  const recipientIds = approvedRecipients.map((user) => user._id);
  const recipients = await RecipientPoints.find({
    recipientUserID: { $in: recipientIds },
  });
  const now = new Date();

  const updates = recipients
    .filter((entry) =>
      isDifferentMonth(entry.lastResetDate || new Date(0), now),
    )
    .map((entry) => {
      entry.currentPoints = entry.monthlyAllocation;
      entry.lastResetDate = now;
      return entry.save();
    });

  await Promise.all(updates);

  const quotaReset = await RecipientItemQuota.updateMany(
    {},
    { $set: { pastMonthlyTotal: 0 } },
  );

  await writeAuditLogSafely({
    eventType: "monthly_points_and_quota_reset",
    status: "success",
    details: {
      resetRecipientPointsCount: updates.length,
      clearedQuotaCount: quotaReset.modifiedCount,
    },
    executedAt: now,
  });
};

const runMonthlyPointsResetJob = async () => {
  return withJobSafety("monthly_points_reset", async () => {
    await resetMonthlyPoints();
    return {
      executed: true,
      job: "monthly_points_reset",
      executedAt: new Date(),
    };
  }).catch(async (error) => {
    await writeAuditLogSafely({
      eventType: "monthly_points_and_quota_reset",
      status: "failed",
      details: { message: error.message },
      executedAt: new Date(),
    });
    console.error("[Jobs] Monthly points reset failed:", error.message);
    return { executed: false, error: error.message };
  });
};

const runPriorityRecalculationJob = async () => {
  if (!config.features.enablePriority) {
    return { executed: false, skipped: true, reason: "ENABLE_PRIORITY=false" };
  }

  return withJobSafety("priority_recalculation", async () => {
    await recalculateAllRecipientPriorities();
    return {
      executed: true,
      job: "priority_recalculation",
      executedAt: new Date(),
    };
  }).catch((error) => {
    console.error("[Jobs] Priority recalculation failed:", error.message);
    return { executed: false, error: error.message };
  });
};

const resetPoints = async () => {
  await withJobSafety("manual_monthly_reset", async () => resetMonthlyPoints());
  return { executed: true, job: "monthly_reset", executedAt: new Date() };
};

const recalculateAll = async () => {
  if (!config.features.enablePriority) {
    return { executed: false, skipped: true, reason: "ENABLE_PRIORITY=false" };
  }

  await withJobSafety("manual_priority_recalculation", async () =>
    recalculateAllRecipientPriorities(),
  );

  await writeAuditLogSafely({
    eventType: "manual_priority_recalculation",
    status: "success",
    details: { message: "All recipient priorities recalculated" },
    executedAt: new Date(),
  });

  return {
    executed: true,
    job: "recalculate_priorities",
    executedAt: new Date(),
  };
};

const runSmartAllocation = async () => {
  if (!config.features.enableAllocation) {
    return {
      executed: false,
      skipped: true,
      reason: "ENABLE_ALLOCATION=false",
    };
  }

  return withJobSafety("smart_allocation", async () => {
    const approvedRequests = await RecipientRequest.find({ status: "approved" })
      .select("_id recipientUserID")
      .lean();

    if (!approvedRequests.length) {
      await writeAuditLogSafely({
        eventType: "smart_allocation_run",
        status: "success",
        details: { processed: 0, fulfilled: 0 },
        executedAt: new Date(),
      });

      return { processed: 0, fulfilled: 0, fulfilledRequestIds: [] };
    }

    const recipientIds = approvedRequests.map((entry) => entry.recipientUserID);
    const priorities = await RecipientPriority.find({
      recipientUserID: { $in: recipientIds },
    })
      .select("recipientUserID finalScore")
      .lean();

    const priorityMap = new Map(
      priorities.map((entry) => [
        String(entry.recipientUserID),
        Number(entry.finalScore || 0),
      ]),
    );

    const sorted = approvedRequests.sort(
      (left, right) =>
        (priorityMap.get(String(right.recipientUserID)) || 0) -
        (priorityMap.get(String(left.recipientUserID)) || 0),
    );

    const systemReviewerID = new mongoose.Types.ObjectId();
    const result = await RecipientRequest.updateMany(
      { _id: { $in: sorted.map((entry) => entry._id) }, status: "approved" },
      { $set: { status: "fulfilled", staffReviewerID: systemReviewerID } },
    );

    const fulfilledCount = Number(result.modifiedCount || 0);
    const fulfilledIds = sorted
      .slice(0, fulfilledCount)
      .map((entry) => String(entry._id));

    await writeAuditLogSafely({
      eventType: "smart_allocation_run",
      status: "success",
      details: {
        processed: sorted.length,
        fulfilled: fulfilledCount,
        fulfilledRequestIds: fulfilledIds,
      },
      executedAt: new Date(),
    });

    return {
      processed: sorted.length,
      fulfilled: fulfilledCount,
      fulfilledRequestIds: fulfilledIds,
    };
  });
};

const initializeSystemJobs = () => {
  // Run once on startup.
  runMonthlyPointsResetJob();
  if (config.features.enablePriority) {
    runPriorityRecalculationJob();
  }

  // 00:00 on day 1 of each month.
  scheduledTasks.add(
    cron.schedule("0 0 1 * *", runMonthlyPointsResetJob, {
      timezone: config.appConfig.timezone,
    }),
  );

  // Recalculate priority every 6 hours.
  if (config.features.enablePriority) {
    scheduledTasks.add(
      cron.schedule("0 */6 * * *", runPriorityRecalculationJob, {
        timezone: config.appConfig.timezone,
      }),
    );
  }

  // Cleanup expired OTPs every 10 minutes when OTP is enabled.
  if (config.features.enableOtpAuth) {
    scheduledTasks.add(
      cron.schedule(
        "*/10 * * * *",
        async () => {
          await withJobSafety("otp_cleanup", async () => {
            const deletedCount = await cleanupExpiredOtps();
            return { executed: true, deletedCount };
          });
        },
        {
          timezone: config.appConfig.timezone,
        },
      ),
    );
  }
};

const stopSystemJobs = () => {
  for (const task of scheduledTasks) {
    try {
      task.stop();
      task.destroy?.();
    } catch (error) {
      console.error("[Jobs] Failed to stop scheduled task:", error.message);
    }
  }

  scheduledTasks.clear();
};

module.exports = {
  initializeSystemJobs,
  resetMonthlyPoints,
  resetPoints,
  recalculateAll,
  runSmartAllocation,
  stopSystemJobs,
  cleanupExpiredOtps,
};
