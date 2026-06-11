# Postman Testing Guide (All Endpoints)

This guide explains exactly how to use and test all API endpoints in Postman.

It is designed for QA, frontend, and backend engineers who need consistent and repeatable API checks.

## 0) Ready-To-Import Files

You can import these files directly into Postman and start testing immediately:

- `docs/api/Charity_System_API.postman_collection.json`
- `docs/api/Charity_Local.postman_environment.json`

Import order:

1. Import environment file first.
2. Import collection file.
3. Select `Charity Local` as active environment.
4. Run login request to auto-fill `accessToken` and `refreshToken`.

## 1) Prerequisites

- Backend is running locally or on a reachable server.
- You have at least one user account for each role you need to test (Admin, Staff, Donor, Recipient).
- Postman desktop app installed.

## 2) Create Postman Environment

Create one environment named `Charity Local` with these variables:

- `baseUrl` = `http://localhost:3000`
- `accessToken` = ``
- `refreshToken` = ``
- `adminUserId` = ``
- `staffUserId` = ``
- `recipientUserId` = ``
- `donorUserId` = ``
- `requestId` = ``
- `donationId` = ``
- `vettingRequestId` = ``
- `itemId` = ``
- `inventoryId` = ``
- `idempotencyKey` = ``

## 3) Collection Structure (Recommended)

Create one collection: `Charity System API`.

Create folders (1:1 with backend groups):

- System
- Auth
- OTP
- Users
- Vetting
- Donations
- Items
- Inventory
- Inventory Movements
- Recipient
- Requested Items
- Transactions
- Messages
- Points
- Priority
- Config
- Mappings

## 4) Default Headers

For JSON endpoints:

- `Content-Type: application/json`

For protected endpoints:

- `Authorization: Bearer {{accessToken}}`

For idempotent write endpoints:

- `Idempotency-Key: {{idempotencyKey}}`

## 5) Helpful Scripts

### Collection Pre-request Script

Use this to auto-generate idempotency key before each request:

```javascript
if (!pm.environment.get("idempotencyKey")) {
  pm.environment.set("idempotencyKey", crypto.randomUUID());
} else {
  pm.environment.set("idempotencyKey", crypto.randomUUID());
}
```

### Login Request Tests Script

Save login tokens automatically:

```javascript
const res = pm.response.json();
if (res?.data?.accessToken) {
  pm.environment.set("accessToken", res.data.accessToken);
}
if (res?.data?.refreshToken) {
  pm.environment.set("refreshToken", res.data.refreshToken);
}
if (res?.data?.user?._id) {
  pm.environment.set("recipientUserId", res.data.user._id);
}
pm.test("status is 200", () => pm.response.to.have.status(200));
```

### Generic Success Assertion

```javascript
pm.test("response has success field", () => {
  const body = pm.response.json();
  pm.expect(body).to.have.property("success");
});
```

## 6) Golden Test Order (Run This First)

Run requests in this sequence to avoid dependency failures:

1. `GET {{baseUrl}}/health`
2. `POST {{baseUrl}}/api/auth/register`
3. `POST {{baseUrl}}/api/auth/login`
4. `GET {{baseUrl}}/api/auth/me`
5. `GET {{baseUrl}}/api/users` (admin/staff token)
6. Continue group-by-group from the matrix below.

## 7) Request Body Templates

Use these templates for fast testing.

### Register

```json
{
  "role": "Recipient",
  "name": "Ali Hassan",
  "email": "ali.recipient@example.com",
  "passwordHash": "StrongPassword123",
  "phoneNumber": "01012345678",
  "address": "Cairo"
}
```

### Login

```json
{
  "email": "ali.recipient@example.com",
  "password": "StrongPassword123"
}
```

### Donation Create

```json
{
  "title": "Monthly Food Donation",
  "description": "Boxes of dry food",
  "category": "Food",
  "amount": 1500
}
```

### Vetting Request

```json
{
  "income": 2500,
  "familyMembers": 5,
  "healthCondition": "chronic",
  "lastAidDate": "2026-03-10"
}
```

### Recipient Request

```json
{
  "category": "Food",
  "urgency": "high",
  "note": "Family support needed"
}
```

### Requested Item Create

```json
{
  "requestId": "{{requestId}}",
  "itemId": "{{itemId}}",
  "quantity": 2
}
```

## 8) Full Endpoint Matrix (How To Test Every Endpoint)

Read each row as:

- Create request with the same method and path.
- Add headers based on `Auth`.
- If method is `POST/PUT/PATCH`, send body from matching template or endpoint schema.
- Verify status code is one of `Expected` values.

| Group               | Endpoint                                   | Method | Auth                  | Expected                |
| ------------------- | ------------------------------------------ | ------ | --------------------- | ----------------------- |
| System              | /                                          | GET    | No                    | 200                     |
| System              | /health                                    | GET    | No                    | 200                     |
| System              | /status                                    | GET    | JWT                   | 200,401,403             |
| System              | /system/status                             | GET    | JWT                   | 200,401,403             |
| Auth                | /api/auth/register                         | POST   | No                    | 201,400,409             |
| Auth                | /api/auth/login                            | POST   | No                    | 200,400,401             |
| Auth                | /api/auth/me                               | GET    | JWT                   | 200,401                 |
| Auth                | /api/auth/refresh-token                    | POST   | No                    | 200,400,401             |
| Auth                | /api/auth/logout                           | POST   | JWT                   | 200,401                 |
| Auth                | /api/auth/forgot-password                  | POST   | No                    | 200,400,404             |
| Auth                | /api/auth/reset-password                   | POST   | No                    | 200,400,404             |
| OTP                 | /api/auth/send-otp                         | POST   | No                    | 200,400,404,429         |
| OTP                 | /api/auth/verify-otp                       | POST   | No                    | 200,400,404,409,429     |
| OTP                 | /api/auth/resend-otp                       | POST   | No                    | 200,400,404,429         |
| Users               | /api/users/search                          | GET    | JWT                   | 200,401,403             |
| Users               | /api/users/filter                          | GET    | JWT                   | 200,401,403             |
| Users               | /api/users                                 | GET    | JWT                   | 200,401,403             |
| Users               | /api/users/:id                             | GET    | JWT                   | 200,401,403,404         |
| Users               | /api/users/:id                             | PUT    | JWT                   | 200,400,401,403,404     |
| Users               | /api/users/:id                             | DELETE | JWT                   | 200,401,403,404         |
| Vetting             | /api/vetting/request                       | POST   | JWT                   | 201,400,401,403,409     |
| Vetting             | /api/vetting/my                            | GET    | JWT                   | 200,401,403,404         |
| Vetting             | /api/vetting/pending                       | GET    | JWT                   | 200,401,403             |
| Vetting             | /api/vetting                               | GET    | JWT                   | 200,401,403             |
| Vetting             | /api/vetting/:id                           | GET    | JWT                   | 200,401,403,404         |
| Vetting             | /api/vetting/approve/:id                   | PUT    | JWT                   | 200,401,403,404,409     |
| Vetting             | /api/vetting/reject/:id                    | PUT    | JWT                   | 200,401,403,404,409     |
| Vetting Alias       | /api/vetting-requests/\*                   | Same   | JWT                   | Same                    |
| Donations           | /api/donations                             | POST   | JWT + Idempotency-Key | 201,400,401,403,409     |
| Donations           | /api/donations/my                          | GET    | JWT                   | 200,401,403             |
| Donations           | /api/donations                             | GET    | JWT                   | 200,401,403             |
| Donations           | /api/donations/:id                         | GET    | JWT                   | 200,401,403,404         |
| Donations           | /api/donations/:id/status                  | PUT    | JWT                   | 200,400,401,403,404,409 |
| Items               | /api/items                                 | POST   | JWT                   | 201,400,401,403         |
| Items               | /api/items                                 | GET    | JWT                   | 200,401,403             |
| Items               | /api/items/:id                             | GET    | JWT                   | 200,401,403,404         |
| Items               | /api/items/:id                             | PUT    | JWT                   | 200,400,401,403,404     |
| Items               | /api/items/:id                             | DELETE | JWT                   | 200,401,403,404         |
| Inventory           | /api/inventory/low-stock                   | GET    | JWT                   | 200,401,403             |
| Inventory           | /api/inventory                             | GET    | JWT                   | 200,401,403             |
| Inventory           | /api/inventory                             | POST   | JWT                   | 201,400,401,403         |
| Inventory           | /api/inventory/:id                         | PUT    | JWT                   | 200,400,401,403,404     |
| Inventory Movements | /api/inventory-movements/move              | POST   | JWT                   | 201,400,401,403,404     |
| Inventory Movements | /api/inventory-movements/movements         | GET    | JWT                   | 200,401,403             |
| Recipient           | /api/recipient/request                     | POST   | JWT + Idempotency-Key | 201,400,401,403,409     |
| Recipient           | /api/recipient/my-requests                 | GET    | JWT                   | 200,401,403             |
| Recipient           | /api/recipient/requests/:id                | GET    | JWT                   | 200,401,403,404         |
| Recipient           | /api/recipient/requests                    | GET    | JWT                   | 200,401,403             |
| Recipient           | /api/recipient/review/:id                  | PUT    | JWT                   | 200,400,401,403,404,409 |
| Recipient           | /api/recipient/available-items             | GET    | JWT                   | 200,401,403             |
| Recipient           | /api/recipient/eligible-items              | GET    | JWT                   | 200,401,403             |
| Recipient           | /api/recipient/recommendations             | GET    | JWT                   | 200,401,403             |
| Recipient Alias     | /api/recipient/:id/approve                 | PATCH  | JWT                   | 200,400,401,403,404,409 |
| Recipient Alias     | /api/recipient/:id/fulfill                 | PATCH  | JWT                   | 200,400,401,403,404,409 |
| Recipient Alias     | /api/recipient-requests/\*                 | Same   | JWT                   | Same                    |
| Requested Items     | /api/requested-items                       | POST   | JWT                   | 201,400,401,403,404,409 |
| Requested Items     | /api/requested-items/:id                   | GET    | JWT                   | 200,401,403,404         |
| Transactions        | /api/transactions                          | POST   | JWT + Idempotency-Key | 201,400,401,403,409     |
| Transactions        | /api/transactions/my                       | GET    | JWT                   | 200,401,403             |
| Transactions        | /api/transactions                          | GET    | JWT                   | 200,401,403             |
| Messages            | /api/messages/me                           | GET    | JWT                   | 200,401,403             |
| Messages            | /api/messages                              | GET    | JWT                   | 200,401,403             |
| Messages            | /api/messages/read/:id                     | PUT    | JWT                   | 200,400,401,403,404     |
| Points              | /api/points/me                             | GET    | JWT                   | 200,401,403,404         |
| Points              | /api/points/history                        | GET    | JWT                   | 200,401,403             |
| Points              | /api/points/:userId                        | GET    | JWT                   | 200,401,403,404         |
| Priority            | /api/priority/ranked                       | GET    | JWT                   | 200,401,403             |
| Priority            | /api/priority/:userId                      | GET    | JWT                   | 200,401,403,404         |
| Priority            | /api/priority/recalculate/:userId          | POST   | JWT                   | 200,401,403,404         |
| Priority            | /api/priority/recalculate-all              | POST   | JWT                   | 200,401,403             |
| Recipient Priority  | /api/recipients/top-priority               | GET    | JWT                   | 200,401,403             |
| Config              | /api/configs/dashboard                     | GET    | JWT                   | 200,401,403             |
| Config              | /api/configs/dashboard/stats               | GET    | JWT                   | 200,401,403             |
| Config              | /api/configs/dashboard/vetting-summary     | GET    | JWT                   | 200,401,403             |
| Config              | /api/configs/dashboard/requests-summary    | GET    | JWT                   | 200,401,403             |
| Config              | /api/configs/system/run-monthly-reset      | POST   | JWT                   | 200,401,403             |
| Config              | /api/configs/system/recalculate-priorities | POST   | JWT                   | 200,401,403             |
| Config              | /api/configs/allocation/run                | POST   | JWT                   | 200,401,403             |
| Config CRUD         | /api/configs                               | POST   | JWT                   | 201,400,401,403         |
| Config CRUD         | /api/configs                               | GET    | JWT                   | 200,401,403             |
| Config CRUD         | /api/configs/:id                           | GET    | JWT                   | 200,401,403,404         |
| Config CRUD         | /api/configs/:id                           | PUT    | JWT                   | 200,400,401,403,404     |
| Config CRUD         | /api/configs/:id                           | DELETE | JWT                   | 200,401,403,404         |
| Income Mapping      | /api/mappings/income                       | POST   | JWT                   | 201,400,401,403         |
| Income Mapping      | /api/mappings/income                       | GET    | JWT                   | 200,401,403             |
| Income Mapping      | /api/mappings/income/:id                   | PUT    | JWT                   | 200,400,401,403,404     |
| Income Mapping      | /api/mappings/income/:id                   | DELETE | JWT                   | 200,401,403,404         |
| Family Mapping      | /api/mappings/family                       | POST   | JWT                   | 201,400,401,403         |
| Family Mapping      | /api/mappings/family                       | GET    | JWT                   | 200,401,403             |
| Family Mapping      | /api/mappings/family/:id                   | PUT    | JWT                   | 200,400,401,403,404     |
| Family Mapping      | /api/mappings/family/:id                   | DELETE | JWT                   | 200,401,403,404         |
| Health Mapping      | /api/mappings/health                       | POST   | JWT                   | 201,400,401,403         |
| Health Mapping      | /api/mappings/health                       | GET    | JWT                   | 200,401,403             |
| Health Mapping      | /api/mappings/health/:id                   | PUT    | JWT                   | 200,400,401,403,404     |
| Health Mapping      | /api/mappings/health/:id                   | DELETE | JWT                   | 200,401,403,404         |
| Last-Aid Mapping    | /api/mappings/last-aid                     | POST   | JWT                   | 201,400,401,403         |
| Last-Aid Mapping    | /api/mappings/last-aid                     | GET    | JWT                   | 200,401,403             |
| Last-Aid Mapping    | /api/mappings/last-aid/:id                 | PUT    | JWT                   | 200,400,401,403,404     |
| Last-Aid Mapping    | /api/mappings/last-aid/:id                 | DELETE | JWT                   | 200,401,403,404         |
| Mapping Aliases     | /api/mapping/\*                            | Same   | Same                  | Same                    |

## 9) Negative Testing Checklist (Important)

For each protected endpoint, run at least these 3 checks:

1. Without token -> expect `401`.
2. With wrong role -> expect `403`.
3. With invalid body -> expect `400`.

For idempotent endpoints:

1. Send same request with same `Idempotency-Key` twice.
2. Confirm second response does not create duplicate data.

For rate-limited endpoints:

1. Send repeated requests quickly.
2. Confirm `429` is returned.

## 10) Collection Runner (Regression)

- Add all requests to the collection in the same order as section 6.
- Use Postman Collection Runner.
- Keep a small data file for IDs if needed.
- Fail the run if any response has status outside the matrix expected values.

## 11) Troubleshooting

- `No local config detected` in Prettier logs:
  Confirm project root is opened and local config files exist at root.
- `401 Unauthorized`:
  Re-run login and verify `accessToken` environment variable is populated.
- `403 Forbidden`:
  Use account with correct permission/role for that endpoint.
- `404 Not Found`:
  Check `baseUrl`, route path, and id variable values.

## 12) Cross References

- Endpoint inventory: `docs/api/ENDPOINT_CATALOG.md`
- Detailed endpoint behavior and examples: `docs/api/API_REFERENCE.md`
- Documentation quality gate: `docs/api/REVIEW_CHECKLIST.md`
