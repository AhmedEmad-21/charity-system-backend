const { UnauthorizedError, ForbiddenError, BadRequestError } = require('../errors/appErrors');
const { ROLES } = require('../config/constants');

const PERMISSIONS = Object.freeze({
    CREATE_DONATION: 'CREATE_DONATION',
    VIEW_DONATION: 'VIEW_DONATION',
    MANAGE_DONATION: 'MANAGE_DONATION',
    VIEW_CONFIG: 'VIEW_CONFIG',
    UPDATE_CONFIG: 'UPDATE_CONFIG',
    MANAGE_CONFIG: 'MANAGE_CONFIG',
    VIEW_DASHBOARD: 'VIEW_DASHBOARD',
    MANAGE_USERS: 'MANAGE_USERS',
    MANAGE_ITEMS: 'MANAGE_ITEMS',
    MANAGE_INVENTORY: 'MANAGE_INVENTORY',
    MANAGE_INVENTORY_MOVEMENTS: 'MANAGE_INVENTORY_MOVEMENTS',
    MANAGE_MESSAGES: 'MANAGE_MESSAGES',
    VIEW_MESSAGES: 'VIEW_MESSAGES',
    REQUEST_AID: 'REQUEST_AID',
    APPROVE_RECIPIENT_REQUEST: 'APPROVE_RECIPIENT_REQUEST',
    FULFILL_RECIPIENT_REQUEST: 'FULFILL_RECIPIENT_REQUEST',
    MANAGE_REQUESTED_ITEMS: 'MANAGE_REQUESTED_ITEMS',
    REQUEST_VETTING: 'REQUEST_VETTING',
    MANAGE_VETTING: 'MANAGE_VETTING',
    MANAGE_MAPPING_RULES: 'MANAGE_MAPPING_RULES',
    MANAGE_TRANSACTIONS: 'MANAGE_TRANSACTIONS',
    VIEW_TRANSACTIONS: 'VIEW_TRANSACTIONS',
});

const ROLE_PERMISSIONS = Object.freeze({
    [ROLES.DONOR]: new Set([PERMISSIONS.CREATE_DONATION, PERMISSIONS.VIEW_DONATION, PERMISSIONS.VIEW_MESSAGES, PERMISSIONS.VIEW_TRANSACTIONS]),
    [ROLES.RECIPIENT]: new Set([PERMISSIONS.REQUEST_AID, PERMISSIONS.REQUEST_VETTING, PERMISSIONS.VIEW_MESSAGES, PERMISSIONS.VIEW_TRANSACTIONS]),
    [ROLES.STAFF]: new Set([
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.MANAGE_DONATION,
        PERMISSIONS.MANAGE_ITEMS,
        PERMISSIONS.MANAGE_INVENTORY,
        PERMISSIONS.MANAGE_INVENTORY_MOVEMENTS,
        PERMISSIONS.MANAGE_MESSAGES,
        PERMISSIONS.APPROVE_RECIPIENT_REQUEST,
        PERMISSIONS.FULFILL_RECIPIENT_REQUEST,
        PERMISSIONS.MANAGE_REQUESTED_ITEMS,
        PERMISSIONS.MANAGE_VETTING,
        PERMISSIONS.MANAGE_MAPPING_RULES,
        PERMISSIONS.VIEW_CONFIG,
        PERMISSIONS.VIEW_TRANSACTIONS,
        PERMISSIONS.MANAGE_TRANSACTIONS,
        PERMISSIONS.VIEW_MESSAGES,
    ]),
    [ROLES.ADMIN]: new Set(['*']),
});

const legacyRoles = new Set(['DONOR', 'RECIPIENT', 'STAFF', 'ADMIN']);

const normalize = (value) => String(value || '').trim().toUpperCase();

const normalizeRoleKey = (role) => {
    const roleName = String(role || '').trim();
    return Object.keys(ROLE_PERMISSIONS).find((key) => key.toLowerCase() === roleName.toLowerCase()) || roleName;
};

const hasPermission = (role, permission) => {
    // حماية إضافية: لو الـ role مش موجود، مفيش صلاحية
    if (!role) return false;
    const permissions = ROLE_PERMISSIONS[normalizeRoleKey(role)];
    if (!permissions) {
        return false;
    }
    return permissions.has('*') || permissions.has(permission);
};

const checkRoleMW = (...required) => {
    const permissionsOrRoles = Array.isArray(required[0]) ? required[0] : required;
    if (!permissionsOrRoles || permissionsOrRoles.length === 0) {
        throw new BadRequestError('checkRoleMW requires at least one permission or role');
    }

    const requiredPermissions = permissionsOrRoles.map(normalize);

    return (req, res, next) => {
        const user = req.user;

        // 1. التأكد إن الـ user والـ role موجودين قبل أي فحص
        if (!user || !user.role) {
            return next(new UnauthorizedError('Unauthorized: user not authenticated or role missing'));
        }

        const userRole = String(user.role);
        const normalizedRole = normalize(userRole);

        // 2. التحقق من الـ Legacy Roles
        if (legacyRoles.has(normalizedRole) && requiredPermissions.some((item) => item === normalizedRole)) {
            return next();
        }

        // 3. التحقق من الصلاحيات مع حماية إضافية (السطر اللي كان بيعمل الـ crash)
        if (requiredPermissions.some((permission) => hasPermission(userRole, permission))) {
            return next();
        }

        return next(new ForbiddenError('Forbidden: insufficient permission'));
    };
};

module.exports = checkRoleMW;
module.exports.PERMISSIONS = PERMISSIONS;
module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
module.exports.hasPermission = hasPermission;
