const mongoose = require("mongoose");

module.exports = async function transactionMW(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();

  req.mongoSession = session;

  const finalize = async (shouldCommit) => {
    if (session.inTransaction()) {
      if (shouldCommit) {
        await session.commitTransaction();
      } else {
        await session.abortTransaction();
      }
    }

    await session.endSession();
  };

  let finalized = false;

  const finalizeOnce = async (shouldCommit) => {
    if (finalized) {
      return;
    }

    finalized = true;
    await finalize(shouldCommit);
  };

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = async (body) => {
    await finalizeOnce(res.statusCode < 400);
    return originalJson(body);
  };

  res.send = async (body) => {
    await finalizeOnce(res.statusCode < 400);
    return originalSend(body);
  };

  res.on("finish", () => {
    finalizeOnce(res.statusCode < 400).catch((error) => {
      console.error("[TransactionMW]", error.message);
    });
  });

  res.on("close", () => {
    finalizeOnce(false).catch((error) => {
      console.error("[TransactionMW]", error.message);
    });
  });

  next();
};
