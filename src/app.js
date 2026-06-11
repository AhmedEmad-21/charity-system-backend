process.env.TZ = process.env.APP_TIMEZONE || "Africa/Cairo";

// src/app.js

const express = require("express");
const fs = require("fs");
const https = require("https");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const hpp = require("hpp");
const config = require("./config/appConfig");
const requestLogger = require("./middlewares/requestLoggerMW");
const inputSanitizerMW = require("./middlewares/inputSanitizerMW");
const idValidatorMW = require("./middlewares/idValidatorMW");
const responseTimeMW = require("./middlewares/responseTimeMW");
const auditLoggerMW = require("./middlewares/auditLoggerMW");
const responseStandardizerMW = require("./middlewares/responseStandardizerMW");
const errorHandler = require("./middlewares/errorHandlerMW");
const { defaultLimiter } = require("./middlewares/rateLimiterMW");
const {
  initializeSystemJobs,
  stopSystemJobs,
} = require("./services/systemJobsService");

const appRoutes = require("./routes/appRoutes");

const authRoutes = require("./routes/authRoutes");
const devRoutes = require("./routes/devRoutes");
const userRoutes = require("./routes/userRoutes");
const configRoutes = require("./routes/configRoutes");
const donationRoutes = require("./routes/donationRoutes");
const itemRoutes = require("./routes/itemRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const inventoryMovementRoutes = require("./routes/inventoryMovementRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const recipientRoutes = require("./routes/recipientRoutes");
const requestedItemRoutes = require("./routes/requestedItemRoutes");
const notificationRoutes = require("./routes/messageRoutes");
const vettingRoutes = require("./routes/vettingRoutes");
const incomeScoreMappingRoutes = require("./routes/incomeScoreMappingRoutes");
const familyScoreMappingRoutes = require("./routes/familyScoreMappingRoutes");
const healthScoreMappingRoutes = require("./routes/healthScoreMappingRoutes");
const lastAidScoreMappingRoutes = require("./routes/lastAidScoreMappingRoutes");
const priorityRoutes = require("./routes/priorityRoutes");
const recipientPriorityRoutes = require("./routes/recipientPriorityRoutes");
const pointsRoutes = require("./routes/pointsRoutes");

const app = express();
let dbConnectionPromise = null;

app.disable("x-powered-by");
if (config.appConfig.trustProxy) {
  app.set("trust proxy", 1);
}

app.locals.cookieOptions = config.appConfig.cookie;

const isOriginAllowed = (origin) => {
  const trusted = config.securityConfig.trustedOrigins;
  if (trusted.includes("*")) {
    return true;
  }

  if (!origin) {
    return true;
  }

  return trusted.includes(origin);
};

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  }),
);
app.use(
  helmet({
    hsts: config.isProduction,
  }),
);
app.use(express.json());
app.use(inputSanitizerMW);
app.use(hpp());
app.use(responseTimeMW);
app.use(morgan(config.isProduction ? "combined" : "dev"));
app.use(requestLogger);
app.use(auditLoggerMW);
app.use(responseStandardizerMW);
app.use(defaultLimiter);
app.use(idValidatorMW());

const connectDB = async ({ exitOnFailure = false } = {}) => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!dbConnectionPromise) {
    dbConnectionPromise = mongoose
      .connect(config.mongoUri)
      .then((connection) => {
        console.log("MongoDB connected successfully");
        return connection;
      })
      .catch((error) => {
        console.error("MongoDB connection failed:", error.message);
        if (exitOnFailure) {
          process.exit(1);
        }
        throw error;
      })
      .finally(() => {
        dbConnectionPromise = null;
      });
  }

  return dbConnectionPromise;
};

const ensureDatabaseConnectionMW = (req, res, next) => {
  connectDB()
    .then(() => next())
    .catch((error) => next(error));
};

app.use(ensureDatabaseConnectionMW);

app.use("/", appRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/dev", devRoutes);
app.use("/api/users", userRoutes);
app.use("/api/configs", configRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/inventory-movements", inventoryMovementRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/recipient", recipientRoutes);
app.use("/api/recipient-requests", recipientRoutes);
app.use("/api/requested-items", requestedItemRoutes);
app.use("/api/messages", notificationRoutes);
app.use("/api/vetting", vettingRoutes);
app.use("/api/vetting-requests", vettingRoutes);
app.use("/api/mappings/income", incomeScoreMappingRoutes);
app.use("/api/mappings/family", familyScoreMappingRoutes);
app.use("/api/mappings/health", healthScoreMappingRoutes);
app.use("/api/mappings/last-aid", lastAidScoreMappingRoutes);

app.use("/api/mapping/income", incomeScoreMappingRoutes);
app.use("/api/mapping/family", familyScoreMappingRoutes);
app.use("/api/mapping/health", healthScoreMappingRoutes);
app.use("/api/mapping/last-aid", lastAidScoreMappingRoutes);

app.use("/api/priority", priorityRoutes);
app.use("/api/recipients", recipientPriorityRoutes);
app.use("/api/points", pointsRoutes);

app.use(errorHandler);

let server = null;

const shouldInitializeSystemJobs = () => !config.appConfig.serverless;

const startServer = async () => {
  await connectDB({ exitOnFailure: true });

  if (shouldInitializeSystemJobs()) {
    initializeSystemJobs();
  }

  if (
    config.appConfig.https.enabled &&
    config.appConfig.https.keyPath &&
    config.appConfig.https.certPath
  ) {
    const key = fs.readFileSync(config.appConfig.https.keyPath, "utf8");
    const cert = fs.readFileSync(config.appConfig.https.certPath, "utf8");
    server = https.createServer({ key, cert }, app).listen(config.port, () => {
      console.log(
        `HTTPS server is running on port ${config.port} in ${config.env} mode`,
      );
    });
  } else {
    server = app.listen(config.port, () => {
      console.log(
        `Server is running on port ${config.port} in ${config.env} mode`,
      );
    });
  }

  return server;
};

const shutdown = async (signal) => {
  try {
    console.log(
      `[Shutdown] Received ${signal}. Closing server and stopping jobs...`,
    );
    stopSystemJobs();

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    await mongoose.connection.close();
    console.log("[Shutdown] Completed gracefully");
    process.exit(0);
  } catch (error) {
    console.error("[Shutdown] Failed:", error.message);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
