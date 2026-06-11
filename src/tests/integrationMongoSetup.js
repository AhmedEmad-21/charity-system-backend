const mongoose = require("mongoose");
const { isSetupComplete } = require("./globalSetup");

const ensureCollectionsAndIndexesReady = async () => {
  const modelNames = mongoose.modelNames();

  for (const modelName of modelNames) {
    const Model = mongoose.model(modelName);
    try {
      await Model.createCollection();
    } catch (error) {
      // Collection already exists; safe to ignore.
      if (error?.codeName !== "NamespaceExists") {
        throw error;
      }
    }
  }

  for (const modelName of modelNames) {
    const Model = mongoose.model(modelName);
    await Model.init();
  }
};

const resetIntegrationMongo = async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  await ensureCollectionsAndIndexesReady();
};

const supportsTransactions = () =>
  isSetupComplete() && mongoose.connection.readyState === 1;

module.exports = {
  resetIntegrationMongo,
  supportsTransactions,
};
