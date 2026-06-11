# 🔐 Concurrency & Transaction Safety Implementation Guide

## Complete Architecture Overview

This guide implements 14 interconnected safety milestones for the Charity System API to handle concurrent requests, prevent data corruption, and ensure robust transaction integrity.

---

## 📋 Implementation Checklist

### MILESTONE 1: Idempotency System ✅

**Status**: Ready to integrate
**Files**:

- `src/models/idempotencyKeyModel.js` - New model
- `src/middlewares/idempotencyMW.js` - New middleware

**Integration Steps**:

```javascript
// In src/app.js or relevant routes
const idempotencyMW = require("./middlewares/idempotencyMW");

// Add to routes requiring idempotency protection
router.post("/transactions", idempotencyMW, transactionController.create);
router.post(
  "/recipient/request",
  idempotencyMW,
  recipientController.createRequest,
);
router.post("/donations", idempotencyMW, donationController.create);
```

**How it works**:

- Stores `Idempotency-Key` header from client
- Returns cached response on retry with same key
- Prevents duplicate database writes
- Auto-expires records after 24 hours via MongoDB TTL

---

### MILESTONE 2: Atomic Operations ✅

**Status**: Ready to integrate
**Files**:

- `src/utils/atomicOperations.js` - New utility module

**Core Functions**:

```javascript
// Safely decrease inventory with quantity check
atomicDecreaseInventory(inventoryID, quantity, { session, reason });

// Safely decrease points with balance check
atomicDecreasePoints(recipientUserID, amount, { session, reason });

// MongoDB-level atomic conditional updates
// Only decrements if condition met (e.g., quantity >= needed)
```

**Integration**:

```javascript
// In approval workflow
try {
  await atomicDecreasePoints(recipientID, pointsCost, { session });
  await atomicDecreaseInventory(inventoryID, quantity, { session });
} catch (err) {
  if (err.code === "POINTS_INSUFFICIENT") {
    // Return 409 Conflict with clear message
  }
}
```

---

### MILESTONE 3: DB Transactions ✅

**Status**: Already implemented in transactionMW.js
**Enhancement**: Ensure all operations use `session` parameter

**Usage**:

```javascript
// transactionMW automatically provides session
// Pass to all model operations
RecipientRequest.findByIdAndUpdate(id, updates, { session });
RecipientPoints.findOneAndUpdate(query, updates, { session });
```

---

### MILESTONE 4: Priority-based Locking ✅

**Status**: Ready to integrate
**Files**:

- `src/utils/concurrencyManager.js` - Priority queue logic

**Integration**:

```javascript
const {
  getPendingRequestsSortedByPriority,
  processPriorityQueueSafely,
} = require("./utils/concurrencyManager");

// In allocation service
const sorted = await getPendingRequestsSortedByPriority(100);

// Process one by one (prevents race conditions)
const results = await processPriorityQueueSafely(
  async (request, { session }) => {
    // Approval logic here
  },
  { maxRetries: 3 },
);
```

---

### MILESTONE 5: Last Item Conflict Resolution ✅

**Status**: Ready to integrate

**Multi-Level Sort Implementation**:

```javascript
// Sort requests by:
// 1. Final Priority DESC
// 2. Request Date ASC (first-come)
// 3. Random (request ID for ties)

requests.sort((a, b) => {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (a.requestDate !== b.requestDate) return a.requestDate - b.requestDate;
  return a._id.toString().localeCompare(b._id.toString());
});
```

---

### MILESTONE 6: Request Locking ✅

**Status**: Ready to integrate
**Files**:

- `src/utils/safeRequestApproval.js` - Safe approval logic
- Modified `src/models/recipientRequestModel.js` - Added locking fields

**Integration**:

```javascript
const {
  safeApproveRequest,
  safeRejectRequest,
} = require("./utils/safeRequestApproval");

// In recipientController.js
router.put("/review/:id", async (req, res, next) => {
  try {
    const result = await safeApproveRequest(req.params.id, req.body, {
      session: req.mongoSession,
      staffID: req.user._id,
    });
    res.json({ success: true, payload: { data: result } });
  } catch (err) {
    next(err);
  }
});
```

**Status Fields**:

- `processingStarted` - Timestamp when approval started
- `processingExpiresAt` - Lock timeout (30 min default)
- `reviewedAt` - When approval/rejection finished

---

### MILESTONE 7: Payment Protection ✅

**Status**: Covered by Milestones 1 + 2

- Idempotency prevents double charges
- Atomic operations prevent points/inventory conflicts

---

### MILESTONE 8: Distributed Lock ✅

**Status**: Ready to integrate
**Files**:

- `src/utils/atomicOperations.js` - Lock functions
- `src/utils/jobSafeExecution.js` - Job-level locking

**Usage**:

```javascript
// Low-level distributed lock
acquireDistributedLock(Model, documentId, { session });
releaseDistributedLock(Model, documentId, { session });

// High-level job lock
acquireJobLock("ALLOCATION_ENGINE"); // Returns true/false
releaseJobLock("ALLOCATION_ENGINE");
```

---

### MILESTONE 9: Safe Allocation Engine ✅

**Status**: Ready to integrate
**Files**:

- `src/utils/jobSafeExecution.js` - Job execution wrapper

**Integration**:

```javascript
const {
  executeAllocationSafely,
  executeMonthlyResetSafely,
} = require("./utils/jobSafeExecution");

// In configController.js
router.post("/allocation/run", async (req, res, next) => {
  try {
    const result = await executeAllocationSafely(
      async () => {
        // Your allocation logic here
        return { processed: 100 };
      },
      { userId: req.user._id },
    );

    res.json({ success: true, payload: { data: result } });
  } catch (err) {
    next(err); // Will catch "job already running" error
  }
});
```

---

### MILESTONE 10: Retry Protection ✅

**Status**: Covered by Milestones 1 + 3

- Idempotency middleware catches retries
- DB transactions ensure all-or-nothing semantics

---

### MILESTONE 11: Data Consistency Guards ✅

**Status**: Ready to integrate
**Files**:

- `src/utils/dataIntegrityGuards.js` - Validation functions

**Usage**:

```javascript
const {
  validateNeverNegative,
  validateSufficientBalance,
} = require("./utils/dataIntegrityGuards");

// Before any deduction
validateSufficientBalance(currentBalance, requiredAmount, "Points");

// Will throw ConflictError if insufficient
// Returns true if valid
```

---

### MILESTONE 12: Conflict Response Strategy ✅

**Status**: Ready to integrate
**Files**:

- `src/utils/dataIntegrityGuards.js` - Response builders

**Usage**:

```javascript
const { buildConflictResponse } = require("./utils/dataIntegrityGuards");

try {
  // ... approval logic
} catch (err) {
  if (err.code === "POINTS_INSUFFICIENT") {
    const response = buildConflictResponse("POINTS", "POINTS_INSUFFICIENT", {
      available: currentBalance,
      required: neededAmount,
    });

    return res.status(409).json({
      success: false,
      payload: response,
    });
  }
}

// Response includes:
// - Clear message in user's language
// - Error code for frontend handling
// - Actionable suggestion
// - Relevant data (available amount, required, etc.)
```

---

### MILESTONE 13: Audit Everything ✅

**Status**: Ready to integrate - uses SystemAuditLog model
**Files**:

- `src/utils/safeRequestApproval.js` - Creates audit logs automatically
- `src/utils/jobSafeExecution.js` - Job audit logs

**Automatic Logging**:

- Request approval started ✓
- Points deducted ✓
- Inventory decreased ✓
- Request approval completed ✓
- Job execution started/completed/failed ✓

**Usage**:

```javascript
// Automatically included in safeApproveRequest
await SystemAuditLog.create({
  action: "REQUEST_APPROVED",
  targetModel: "RecipientRequest",
  targetID: requestId,
  changes: {
    previousStatus: "pending",
    newStatus: "approved",
    pointsDeducted: 100,
  },
  performedByID: staffUserId,
  ipAddress: req.ip,
  timestamp: new Date(),
});
```

---

### MILESTONE 14: Stress Testing ✅

**Status**: Comprehensive test suite ready
**Files**:

- `src/tests/concurrency-stress.test.js` - 15+ stress tests

**Run Tests**:

```bash
node --test src/tests/concurrency-stress.test.js
```

**Test Coverage**:

- ✅ 10 users requesting 1 item (oversell prevention)
- ✅ 5 concurrent payments (deduplication)
- ✅ Job concurrency lock
- ✅ Negative inventory/points prevention
- ✅ Last-item conflict resolution
- ✅ Request locking
- ✅ Idempotency key replay
- ✅ Audit trail completeness
- ✅ Conflict response clarity
- ✅ Data integrity guards

---

## 🚀 Full Integration Example

### Update src/controllers/recipientRequestController.js

```javascript
const {
  safeApproveRequest,
  safeRejectRequest,
} = require("../utils/safeRequestApproval");

module.exports = {
  // ... existing methods

  async reviewRequest(req, res, next) {
    try {
      const { status, notes } = req.body;
      const requestId = req.params.id;

      // Validate input
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          success: false,
          payload: { message: "Invalid status" },
        });
      }

      let result;

      if (status === "approved") {
        result = await safeApproveRequest(
          requestId,
          { ...req.body },
          {
            session: req.mongoSession, // From transactionMW
            staffID: req.user._id,
          },
        );
      } else {
        result = await safeRejectRequest(
          requestId,
          { reason: notes, ipAddress: req.ip },
          {
            session: req.mongoSession,
            staffID: req.user._id,
          },
        );
      }

      res.json({
        success: true,
        payload: { data: result },
      });
    } catch (err) {
      next(err); // Error handler will format response
    }
  },
};
```

### Update src/routes/recipientRoutes.js

```javascript
const express = require("express");
const authMW = require("../middlewares/authMW");
const checkRoleMW = require("../middlewares/checkRoleMW");
const transactionMW = require("../middlewares/transactionMW");
const idempotencyMW = require("../middlewares/idempotencyMW");
const recipientController = require("../controllers/recipientRequestController");

const router = express.Router();

// Idempotency + Transaction protection for critical operations
router.post(
  "/request",
  authMW,
  idempotencyMW,
  transactionMW,
  recipientController.createRequest,
);

router.put(
  "/review/:id",
  authMW,
  checkRoleMW("MANAGE_REQUESTS"),
  transactionMW, // Already provides session
  recipientController.reviewRequest,
);

module.exports = router;
```

### Update src/routes/configRoutes.js

```javascript
const { executeAllocationSafely } = require("../utils/jobSafeExecution");

router.post(
  "/allocation/run",
  authMW,
  checkRoleMW("MANAGE_CONFIG"),
  async (req, res, next) => {
    try {
      const result = await executeAllocationSafely(
        async () => {
          // Your existing allocation logic
          return configController.runAllocation();
        },
        { userId: req.user._id },
      );

      res.json({ success: true, payload: { data: result } });
    } catch (err) {
      next(err);
    }
  },
);
```

---

## 🔍 Error Handling Integration

Update src/middlewares/errorHandlerMW.js to use conflict responses:

```javascript
const { buildConflictResponse } = require("../utils/dataIntegrityGuards");

module.exports = function errorHandler(err, req, res, next) {
  // ... existing error handling

  if (err.code === "POINTS_INSUFFICIENT") {
    const response = buildConflictResponse(
      "POINTS",
      "POINTS_INSUFFICIENT",
      err.details,
    );
    return res.status(409).json({
      success: false,
      payload: response,
    });
  }

  if (err.code === "INVENTORY_INSUFFICIENT") {
    const response = buildConflictResponse(
      "INVENTORY",
      "ITEM_EXHAUSTED",
      err.details,
    );
    return res.status(409).json({
      success: false,
      payload: response,
    });
  }

  if (err.code === "REQUEST_PROCESSING_LOCKED") {
    return res.status(409).json({
      success: false,
      payload: {
        message: err.message,
        code: err.code,
        suggestion: err.details?.suggestion,
      },
    });
  }

  // ... rest of error handling
};
```

---

## 📊 Database Indexes

Ensure these indexes are created for performance:

```javascript
// In migration/setup script
db.idempotencykeys.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
db.idempotencykeys.createIndex({ idempotencyKey: 1 }, { unique: true });
db.idempotencykeys.createIndex({ userId: 1 });
db.idempotencykeys.createIndex({ endpoint: 1, method: 1 });

db.recipientrequests.createIndex({ status: 1 });
db.recipientrequests.createIndex({ processingStarted: 1 });
db.recipientrequests.createIndex({ requestDate: 1 });

db.systemauditlogs.createIndex({ action: 1 });
db.systemauditlogs.createIndex({ targetModel: 1, targetID: 1 });
db.systemauditlogs.createIndex({ performedByID: 1 });
```

---

## 🧪 Testing Strategy

1. **Unit Tests**: Test each atomic operation independently
2. **Integration Tests**: Test workflows with idempotency + transactions
3. **Stress Tests**: Run concurrency-stress.test.js with 10+ concurrent users
4. **Load Tests**: Simulate real-world traffic patterns

```bash
# Run stress tests
npm test -- src/tests/concurrency-stress.test.js

# Run with detailed output
NODE_DEBUG=* npm test -- src/tests/concurrency-stress.test.js
```

---

## 🎯 Performance Considerations

1. **Idempotency Key Expiry**: 24 hours default (configurable)
2. **Request Lock Timeout**: 30 minutes default (prevents deadlocks)
3. **Job Lock Timeout**: 55 minutes (with auto-release safety valve)
4. **Session Timeout**: Inherited from MongoDB settings
5. **Retry Strategy**: Exponential backoff recommended (100ms, 200ms, 400ms)

---

## 🛡️ Security Notes

1. **Idempotency Key Validation**: Prevents unauthorized replays
2. **Request Hash**: Ensures payload integrity
3. **User Isolation**: Each user's idempotency keys are separate
4. **Audit Trail**: All critical operations are logged
5. **Lock Timeouts**: Prevent indefinite locks from crashed processes

---

## 📈 Monitoring

Track these metrics:

```javascript
// Request metrics
- Idempotency cache hits
- Atomic operation conflicts
- Request lock wait times
- Job execution duration
- Audit log volume

// Error metrics
- POINTS_INSUFFICIENT errors
- INVENTORY_INSUFFICIENT errors
- REQUEST_PROCESSING_LOCKED errors
- JOB_ALREADY_RUNNING errors
```

---

## 🔄 Rollback Plan

If issues occur:

1. Disable idempotency middleware (set header check to false)
2. Increase request lock timeout
3. Disable job safety checks (remove executeJobSafely wrapper)
4. Clear expired idempotency keys: `db.idempotencykeys.deleteMany({ expiresAt: { $lt: new Date() } })`

---

## ✅ Pre-Production Checklist

- [ ] All 14 milestones integrated
- [ ] Database indexes created
- [ ] Stress tests passing (20+ concurrent operations)
- [ ] Error handling tested for all conflict scenarios
- [ ] Audit logs verified
- [ ] Monitoring dashboards set up
- [ ] Backup strategy in place
- [ ] Rollback procedures documented
- [ ] Load tests at 2x expected traffic
- [ ] Cross-browser and client testing

---

## 📞 Support

For questions about implementation:

1. Check test file: `src/tests/concurrency-stress.test.js`
2. Review utility modules in `src/utils/`
3. Check integration examples above
