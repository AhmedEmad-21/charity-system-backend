const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
    // settingName: اسم المتغير (مثال: MONTHLY_LIMIT)
    settingName: {
        type: String,
        required: [true, 'يجب تحديد اسم الإعداد.'],
        unique: true, // لضمان وجود إعداد واحد فقط لكل اسم
        trim: true,
        uppercase: true 
    },
    
    // settingValue: القيمة المرتبطة (قد تكون رقم، نص، أو منطقي)
    settingValue: {
        // نستخدم Mixed للسماح بتخزين أنواع مختلفة (رقم للحد الأقصى، نص لإعداد آخر)
        type: mongoose.Schema.Types.Mixed, 
        required: [true, 'يجب إدخال قيمة الإعداد.'],
    },
    
    description: {
        type: String,
        trim: true
    },
    
    // ربط بمن قام بتحديث الإعداد (للمراجعة)
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('Config', configSchema);