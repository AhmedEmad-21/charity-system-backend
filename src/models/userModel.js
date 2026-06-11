const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/appConfig');

const userRoles = ['Donor', 'Recipient', 'Staff', 'Admin'];
const accountStatuses = ['active', 'suspended'];
const vettingStatuses = ['pending', 'approved', 'rejected'];

const userSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: userRoles,
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        passwordHash: {
            type: String,
            required: true,
            minlength: 8,
        },
        phoneNumber: {
            type: String,
            required: true,
            trim: true,
        },
        address: {
            type: String,
            required: true,
            trim: true,
        },
        accountStatus: {
            type: String,
            enum: accountStatuses,
            default: 'active',
        },
        vettingStatus: {
            type: String,
            enum: vettingStatuses,
            default: 'pending',
        },
        createdByAdminID: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        resetPasswordTokenHash: {
            type: String,
            default: null,
        },
        resetPasswordExpiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

userSchema.index({ role: 1, vettingStatus: 1 });
userSchema.index({ vettingStatus: 1, createdAt: -1 });

userSchema.pre('save', async function hashPassword() {
    if (!this.isModified('passwordHash')) {
        return;
    }

    this.passwordHash = await bcrypt.hash(this.passwordHash, config.securityConfig.bcryptSaltRounds);
});

userSchema.methods.comparePassword = function comparePassword(password) {
    return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);