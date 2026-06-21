const Inventory = require("../models/inventoryModel");
const InventoryMovement = require("../models/inventoryMovementModel");
const createCrudService = require("./crudServiceFactory");
const { BadRequestError } = require("../errors/appErrors");
const { parsePagination } = require("../utils/pagination");

const baseService = createCrudService(Inventory);

const createMovement = async ({
  inventoryID,
  staffID,
  movementType,
  quantityChange,
  notes = "",
  session = null,
}) => {
  if (!staffID)
    throw new BadRequestError(
      "staffID is required for inventory movement tracking",
    );

  await InventoryMovement.create(
    [
      {
        inventoryID,
        staffID,
        movementType,
        quantityChange,
        timestamp: new Date(),
        notes,
      },
    ],
    { session },
  );
};

const defaultStorageLocation = "المخزن الرئيسي بالفيوم";

module.exports = {
  ...baseService,

  async fetchInventory(filter = {}, options = {}) {
    const pagination = parsePagination(options, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    return baseService.list(this.buildInventoryFilter(filter), {
      ...options,
      ...pagination,
      select:
        "sourceItemID itemName category quantity itemCondition storageLocation monthlyLimit itemPointsCost lastMovementDate createdAt updatedAt",
    });
  },

  // الدالة الجديدة للخصم من المخزون عند التوزيع
  async deductItem(inventoryID, quantity, { staffID, notes, session = null } = {}) {
    const item = await Inventory.findById(inventoryID).session(session);
    if (!item) throw new BadRequestError("Item not found in inventory");

    if (item.quantity < quantity) {
      throw new BadRequestError(`Insufficient quantity. Available: ${item.quantity}`);
    }

    item.quantity -= Number(quantity);
    item.lastMovementDate = new Date();
    await item.save({ session });

    await createMovement({
      inventoryID,
      staffID: staffID || "6a37054540db9112518c1f9a", // ID افتراضي للـ staff إذا لم يمرر
      movementType: "distribute",
      quantityChange: -Number(quantity),
      notes: notes || `Distributed ${quantity} units`,
      session,
    });

    return item;
  },

  async upsertFromSortedItem(item, { staffID, session = null } = {}) {
    const filter = { itemName: item.name, category: item.category || "" };
    let inventory = await Inventory.findOne(filter).session(session);

    console.log(
      `[InventoryService] Updating: ${item.name} | Set Quantity to: ${item.quantity}`,
    );

    if (!inventory) {
      const created = await Inventory.create(
        [
          {
            sourceItemID: item._id,
            itemName: item.name,
            category: item.category || "",
            quantity: Number(item.quantity),
            itemCondition: "new",
            storageLocation: defaultStorageLocation,
            lastMovementDate: new Date(),
          },
        ],
        { session },
      );
      inventory = created[0];
    } else {
      inventory.quantity = Number(item.quantity);
      inventory.lastMovementDate = new Date();
      await inventory.save({ session });
    }

    await createMovement({
      inventoryID: inventory._id,
      staffID,
      movementType: "adjust",
      quantityChange: Number(item.quantity),
      notes: `Donation stored/updated from source: ${item._id}`,
      session,
    });

    return inventory;
  },

  buildInventoryFilter(filter = {}) {
    const query = {};
    if (filter.category) query.category = String(filter.category).trim();
    if (filter.itemName)
      query.itemName = {
        $regex: String(filter.itemName).trim(),
        $options: "i",
      };
    return query;
  },

  create: async (data, options = {}) => baseService.create(data, options),
  updateById: async (id, data, options = {}) =>
    baseService.updateById(id, data, options),
};
