const DonationReq = require("../models/donationReqModel");
const messageService = require("./messageService");
const createCrudService = require("./crudServiceFactory");
const { BadRequestError } = require("../errors/appErrors");
const inventoryService = require("./inventoryService");

const baseService = createCrudService(DonationReq);

const donationMessageByStatus = {
  pendingPickup: "Your donation request has been received and is pending pickup.",
  pickedUp: "Your donation has been picked up by our team.",
  sorted: "Your donation has been sorted.",
  stored: "Your donation items are now stored in inventory.",
  distributed: "Your donation has been distributed to recipients in need.",
};

const messageTypeByStatus = {
  pendingPickup: "donation_received",
  pickedUp: "donation_received",
  sorted: "donation_sorted",
  stored: "inventory_added",
  distributed: "donation_distributed",
};

module.exports = {
  ...baseService,

  async fetchAllDonations(filter, options = {}) {
    return baseService.list(filter, options);
  },

  async fetchDonationById(id, options = {}) {
    return baseService.getById(id, options);
  },

  async createDonationRequest(data, options = {}) {
    const created = await baseService.create(data, options);
    await messageService.create({
      userID: created.donorID,
      relatedDonationID: created._id,
      messageType: "donation_received",
      content: donationMessageByStatus.pendingPickup,
    });
    return created;
  },

  async updateStatus(id, data, options = {}) {
    // 1. تحديث البيانات مباشرة في قاعدة البيانات لضمان حفظ الـ quantity والبيانات الجديدة
    // استخدام baseService.updateById يضمن تشغيل الـ Schema Validation والحفظ في الـ DB
    const updatedDonation = await baseService.updateById(id, data, options);

    if (!updatedDonation) return null;

    // 2. التحقق من تغيير الحالة وإرسال الرسائل وتحديث المخزون
    // نعتمد على الحالة الجديدة القادمة من الـ updatedDonation
    if (data?.status) {
      await messageService.create({
        userID: updatedDonation.donorID,
        relatedDonationID: updatedDonation._id,
        messageType: messageTypeByStatus[data.status],
        content: donationMessageByStatus[data.status] || `Your donation status changed to ${data.status}.`,
      });

      // 3. تحديث المخزون فقط عند الوصول لحالة 'stored'
      if (data.status === "stored") {

        // نأخذ القيم من الـ updatedDonation المحدثة فعلياً من الـ DB
        const finalQuantity = Number(updatedDonation.quantity) ?? 0;
        const finalName = updatedDonation.itemName ?? "ملابس شتوية";
        const finalCategory = updatedDonation.category ?? "Clothes";

        console.log(`[DonationService] Syncing Inventory: Item=${finalName}, Qty=${finalQuantity}`);

        await inventoryService.upsertFromSortedItem(
          {
            _id: updatedDonation._id,
            name: finalName,
            category: finalCategory,
            quantity: finalQuantity,
          },
          {
            staffID: data.staffID || "6a37054540db9112518c1f9a",
          }
        );
      }
    }
    return updatedDonation;
  },

  create: async (data, options = {}) => module.exports.createDonationRequest(data, options),
  updateById: async (id, data, options = {}) => module.exports.updateStatus(id, data, options),
};
