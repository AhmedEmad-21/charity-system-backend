const SystemAuditLog = require('../models/systemAuditLogModel');

const serializeError = (error) => ({
  name: error?.name,
  message: error?.message,
  status: error?.status,
});

module.exports = function auditLoggerMW(req, res, next) {
  const persistAudit = async () => {
    const auditEntry = res.locals.auditEntry;
    if (!auditEntry) {
      return;
    }

    try {
      await SystemAuditLog.create({
        eventType: auditEntry.eventType,
        status: auditEntry.status || (res.statusCode < 400 ? 'success' : 'failed'),
        details: {
          actorUserID: req.user?.id || req.user?._id || req.user?.userId || null,
          method: req.method,
          path: req.originalUrl || req.url,
          before: auditEntry.before ?? null,
          after: auditEntry.after ?? null,
          metadata: auditEntry.metadata ?? {},
          error: auditEntry.error ? serializeError(auditEntry.error) : null,
        },
        executedAt: new Date(),
      });
    } catch (error) {
      console.error('[AuditLoggerMW]', error.message);
    }
  };

  res.on('finish', () => {
    persistAudit().catch((error) => {
      console.error('[AuditLoggerMW]', error.message);
    });
  });

  next();
};