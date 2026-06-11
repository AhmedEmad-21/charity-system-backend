# Charity System Professional API Documentation

## Postman Testing Guide

For practical request-by-request testing steps in Postman (including environment setup and full endpoint matrix), see:

- docs/api/POSTMAN_TESTING_GUIDE.md

## API Versioning Strategy

Current base path uses unversioned APIs, for example /api/auth and /api/users.

Recommended production strategy:

- Introduce /api/v1 as the first versioned namespace.
- Keep /api routes as backward-compatible aliases during migration.
- Deprecation policy: announce deprecated routes, keep at least one release cycle, then remove.

Suggested compatibility map:

- Current: /api/auth/login
- Versioned: /api/v1/auth/login

## Documentation Standard (Applied to Each Detailed Endpoint)

Each detailed endpoint follows this fixed structure:

1. Endpoint
2. Method
3. Description
4. Authentication
5. Request Headers
6. Request Body
7. Success Response
8. Error Responses
9. Business Logic Notes
10. Edge Cases
11. Example Request
12. Example Response

## Response Standardization

Success shape:
{
"success": true,
"message": "Operation successful",
"data": {}
}

Error shape:
{
"success": false,
"message": "Error message",
"code": "ERROR_CODE"
}

Notes:

- Backend currently emits code.
- In non-production mode, details and stack can appear.

## Pagination Response Shape

For list endpoints that support page and limit:
{
"success": true,
"message": "done",
"data": [],
"pagination": {
"page": 1,
"limit": 20,
"count": 20,
"total": 100,
"hasMore": true
}
}

Implementation note:

- Some endpoints currently return count, page, limit without a nested pagination object.
- Frontend adapter can normalize both formats until a unified pagination middleware is introduced.

## Idempotency Guide

Endpoints using idempotency protection:

- POST /api/donations
- POST /api/transactions
- POST /api/recipient/request

Required header for safe retries:

- Idempotency-Key: <unique-client-generated-key>

Behavior:

- Same key + same route + same actor returns the same logical result.
- Prevents duplicate writes from retries and double-clicks.

Error cases:

- 409 conflict if key reuse violates idempotency rules.

## Rate Limiting Rules

Default limiter:

- 100 requests per 15 minutes per IP

Auth limiter:

- 5 requests per minute per IP
- Applied to register, login, refresh-token, forgot-password, reset-password

OTP limiter:

- 5 requests per minute per IP
- Applied to send-otp, verify-otp, resend-otp

Recipient request limiter:

- 3 requests per minute per IP
- Applied to POST /api/recipient/request

429 example:
{
"success": false,
"message": "Too many requests, please try again later."
}

## Error Codes Reference

Core codes emitted by middleware and custom errors:

- BAD_REQUEST
- UNAUTHORIZED
- FORBIDDEN
- NOT_FOUND
- CONFLICT
- VALIDATION_ERROR
- INVALID_IDENTIFIER
- DUPLICATE_KEY
- DATABASE_CONNECTION_ERROR
- INTERNAL_SERVER_ERROR

Common domain scenarios with typical mapping:

- Invalid email or password -> UNAUTHORIZED
- Email already exists -> CONFLICT
- Insufficient points -> BAD_REQUEST
- Request already reviewed -> CONFLICT
- OTP expired or invalid -> BAD_REQUEST

## Sequence Flows

### Auth Flow

1. Register account via POST /api/auth/register
2. If OTP feature enabled, account starts suspended
3. Send OTP via POST /api/auth/send-otp (or auto-send during register)
4. Verify OTP via POST /api/auth/verify-otp
5. Login via POST /api/auth/login
6. Refresh token via POST /api/auth/refresh-token when needed

### Donation Flow

1. Donor creates donation request via POST /api/donations
2. Staff updates status via PUT /api/donations/:id/status
3. Status transitions are strictly one-step forward
4. Donor receives message notifications for status changes

### Recipient Flow

1. Recipient creates request via POST /api/recipient/request
2. Recipient adds requested items via POST /api/requested-items
3. Staff reviews request via PUT /api/recipient/review/:id
4. On approval, transaction applies points + quotas + inventory adjustments atomically

## Postman Alignment (1:1 Mapping)

Recommended Postman folders and endpoint mapping:

- System: /, /health, /status
- Auth: all /api/auth/\* endpoints
- Users: all /api/users/\* endpoints
- Vetting: all /api/vetting/\* endpoints
- Donations: all /api/donations/\* endpoints
- Inventory: /api/inventory/_ and /api/inventory-movements/_
- Recipient: /api/recipient/_ and /api/requested-items/_
- Transactions: /api/transactions/\*
- Points: /api/points/\*
- Messages: /api/messages/\*
- Priority: /api/priority/\* and /api/recipients/top-priority
- Config: /api/configs/\*
- Mappings: /api/mappings/_ and /api/mapping/_ aliases

Recommended Postman environment variables:

- baseUrl
- accessToken
- refreshToken
- adminUserId
- staffUserId
- recipientUserId
- donorUserId
- idempotencyKey

---

DETAILED ENDPOINT SPECS

## Group: Auth and OTP (FULL)

Base path: /api/auth

### Endpoint: /api/auth/register

1. Method: POST
2. Description: Create a new user account and issue access and refresh tokens.
3. Authentication:

- Required: No
- Role: N/A

4. Request Headers:

- Content-Type: application/json

5. Request Body:

- role, string, required, allowed: Donor Recipient Staff Admin
- name, string, required, minLength 1, trimmed
- email, string, required, format email, normalized to lowercase and trimmed
- passwordHash, string, required, minLength 8
- phoneNumber, string, required, pattern ^01[0125][0-9]{8}$
- address, string, required, minLength 1

6. Success Response:

- HTTP 201
- Example:
  {
  "success": true,
  "data": {
  "user": {
  "email": "recipient@example.com",
  "role": "Recipient"
  },
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>"
  }
  }

7. Error Responses:

- 400 VALIDATION_ERROR
  {
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR"
  }
- 409 CONFLICT (duplicate email)
  {
  "success": false,
  "message": "Email already exists",
  "code": "CONFLICT"
  }
- 429 rate limit
  {
  "success": false,
  "message": "Too many login/signup attempts. Please try again later."
  }

8. Business Logic Notes:

- If OTP feature is enabled, account can start as suspended until OTP verification.

9. Edge Cases:

- Same email with case differences still conflicts due to normalization.

10. Example Request:
    {
    "role": "Recipient",
    "name": "Ali Hassan",
    "email": "Ali@example.com",
    "passwordHash": "StrongPassword123",
    "phoneNumber": "01012345678",
    "address": "Cairo"
    }
11. Example Response:
    {
    "success": true,
    "message": "done",
    "data": {
    "user": { "email": "ali@example.com" },
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>"
    }
    }

### Endpoint: /api/auth/login

1. Method: POST
2. Description: Authenticate user and issue fresh access and refresh tokens.
3. Authentication:

- Required: No
- Role: N/A

4. Request Headers:

- Content-Type: application/json

5. Request Body:

- email, string, required, format email, normalized lowercase
- password, string, required, minLength 8

6. Success Response:

- HTTP 200
  {
  "success": true,
  "data": {
  "user": { "email": "recipient@example.com", "role": "Recipient" },
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>"
  }
  }

7. Error Responses:

- 401 invalid credentials
  {
  "success": false,
  "message": "Invalid email or password",
  "code": "UNAUTHORIZED"
  }
- 401 unverified account when OTP mode is enabled
  {
  "success": false,
  "message": "Account is not verified yet. Please verify OTP first.",
  "code": "UNAUTHORIZED"
  }
- 429 rate limit
  {
  "success": false,
  "message": "Too many login/signup attempts. Please try again later."
  }

8. Business Logic Notes:

- Password is validated against stored bcrypt hash.

9. Edge Cases:

- Email with spaces or uppercase is normalized and still works.

10. Example Request:
    {
    "email": "Recipient@Example.com",
    "password": "StrongPassword123"
    }
11. Example Response:
    {
    "success": true,
    "message": "done",
    "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>"
    }
    }

### Endpoint: /api/auth/me

1. Method: GET
2. Description: Return authenticated user profile.
3. Authentication:

- Required: Yes
- Role: Any authenticated user

4. Request Headers:

- Authorization: Bearer <access_token>

5. Request Body: None
6. Success Response: 200 with user profile
7. Error Responses:

- 401 invalid/expired token
- 404 user not found

8. Business Logic Notes:

- Sensitive fields are excluded.

9. Edge Cases:

- Revoked token returns unauthorized.

10. Example Response:
    {
    "success": true,
    "data": {
    "email": "recipient@example.com",
    "role": "Recipient"
    }
    }

### Endpoint: /api/auth/refresh-token

1. Method: POST
2. Description: Exchange refresh token for fresh tokens.
3. Authentication:

- Required: No (refresh token required in body)

4. Request Headers:

- Content-Type: application/json

5. Request Body:

- refreshToken, string, required

6. Success Response: 200 with fresh tokens
7. Error Responses:

- 400 missing token
- 401 invalid or revoked token
- 404 user not found

8. Business Logic Notes:

- Old refresh token is revoked after successful refresh.

9. Edge Cases:

- Access token cannot be used as refresh token.

### Endpoint: /api/auth/logout

1. Method: POST
2. Description: Revoke access and refresh tokens.
3. Authentication:

- Required: Yes
- Role: Any authenticated user

4. Request Headers:

- Authorization
- Content-Type

5. Request Body:

- refreshToken, string, optional but recommended

6. Success Response: 200
7. Error Responses: 401, 500
8. Business Logic Notes:

- Revocation is applied to provided tokens.

### Endpoint: /api/auth/forgot-password

1. Method: POST
2. Description: Start password reset flow.
3. Authentication: No
4. Request Body:

- email, string, required, format email

5. Success Response: 200
6. Error Responses: 400, 500
7. Business Logic Notes:

- Returns generic success message even when email does not exist.

### Endpoint: /api/auth/reset-password

1. Method: POST
2. Description: Reset password using reset token flow.
3. Authentication: No
4. Request Body:

- token, string, required
- newPassword, string, required, minLength 8
- email, string, optional for OTP mode
- otp, string, optional for OTP mode

5. Success Response: 200
6. Error Responses:

- 400 invalid or expired reset token
- 400 weak new password

### Endpoint: /api/auth/send-otp

1. Method: POST
2. Description: Send OTP to email for verify or reset purpose.
3. Authentication: No
4. Request Body:

- email, string, required, format email
- purpose, string, optional, verify or reset

5. Success Response: 200
6. Error Responses:

- 400 bad payload
- 404 user not found for specific flows
- 429 too many OTP requests

7. Business Logic Notes:

- Cooldown is enforced.

### Endpoint: /api/auth/verify-otp

1. Method: POST
2. Description: Verify OTP and complete target flow.
3. Authentication: No
4. Request Body:

- email, string, required
- otp, string, required
- purpose, string, optional

5. Success Response: 200
6. Error Responses:

- 400 invalid or expired OTP
- 409 OTP already used
- 429 too many attempts

7. Business Logic Notes:

- OTP consumption is atomic.

### Endpoint: /api/auth/resend-otp

1. Method: POST
2. Description: Resend OTP with cooldown protection.
3. Authentication: No
4. Request Body:

- email, string, required
- purpose, string, optional

5. Success Response: 200
6. Error Responses:

- 400 bad payload
- 429 too many OTP requests

---

## Group: Users (FULL)

Base path: /api/users

### Pagination contract for list endpoints

Supported query:

- page, integer, optional, default 1
- limit, integer, optional, max 100

### Endpoint: /api/users

1. Method: GET
2. Description: List users (manager only), optional pagination.
3. Authentication: Yes
4. Role: MANAGE_USERS
5. Request Headers: Authorization
6. Request Body: None
7. Success Response:

- 200
- Example:
  {
  "success": true,
  "count": 20,
  "page": 1,
  "limit": 20,
  "data": [
  { "email": "user1@example.com", "role": "Donor" }
  ]
  }

8. Error Responses: 401, 403, 500
9. Business Logic Notes:

- Sensitive fields are excluded.

10. Edge Cases:

- If no page or limit provided, route returns full result set.

### Endpoint: /api/users/search

1. Method: GET
2. Description: Search users by q or keyword or term.
3. Authentication: Yes
4. Role: MANAGE_USERS
5. Request Headers: Authorization
6. Query params:

- q or keyword or term, string, optional
- page, limit optional

7. Success Response: 200 list
8. Error Responses: 401,403,500
9. Business Logic Notes:

- Search matches name, email, phoneNumber using case-insensitive regex.

### Endpoint: /api/users/filter

1. Method: GET
2. Description: Filter users by role, accountStatus, vettingStatus, email, createdByAdminID.
3. Authentication: Yes
4. Role: MANAGE_USERS
5. Query params:

- role, enum Donor Recipient Staff Admin
- accountStatus, enum active suspended
- vettingStatus, enum pending approved rejected
- email, normalized lowercase
- createdByAdminID, ObjectId string
- page, limit optional

6. Success Response: 200 list
7. Error Responses: 401,403,500

### Endpoint: /api/users/:id

1. Method: GET
2. Description: Get single user by id.
3. Authentication: Yes
4. Role: MANAGE_USERS
5. Success Response: 200
6. Error Responses:

- 404 user not found
- 401,403

### Endpoint: /api/users/:id

1. Method: PUT
2. Description: Update user profile.
3. Authentication: Yes
4. Role: Owner or MANAGE_USERS
5. Request Body constraints:

- role, optional enum
- name, optional string minLength 1
- email, optional, format email, normalized lowercase
- passwordHash, optional, minLength 8
- phoneNumber, optional pattern ^01[0125][0-9]{8}$
- address, optional string
- accountStatus, optional enum active suspended
- vettingStatus, optional enum pending approved rejected
- createdByAdminID, optional ObjectId or null

6. Success Response: 200
7. Error Responses:

- 400 validation
- 403 forbidden update of another user
- 404 not found

8. Example error:
   {
   "success": false,
   "message": "Forbidden: cannot update another user",
   "code": "FORBIDDEN"
   }

### Endpoint: /api/users/:id

1. Method: DELETE
2. Description: Delete user.
3. Authentication: Yes
4. Role: MANAGE_USERS
5. Success Response: 200
6. Error Responses: 401,403,404

---

## Group: Donations (FULL)

Base path: /api/donations

### Endpoint: /api/donations

1. Method: POST
2. Description: Create donation request.
3. Authentication: Yes
4. Role: CREATE_DONATION or MANAGE_DONATION
5. Request Headers:

- Authorization
- Content-Type
- Idempotency-Key

6. Request Body:

- donorID, string ObjectId, optional because route injects authenticated donor id
- proposedPickupTime, string date-time, required
- pickupLocation, string, required, minLength 1
- status, optional enum pendingPickup pickedUp sorted stored distributed
- notes, optional string

7. Success Response:

- 201
  {
  "success": true,
  "data": {
  "donorID": "<id>",
  "status": "pendingPickup"
  }
  }

8. Error Responses:

- 400 validation
- 401 unauthorized
- 403 forbidden
- 409 idempotency conflict or duplicate logic conflict
- 500 internal

9. Business Logic Notes:

- Creates donor notification message on creation.

10. Edge Cases:

- Retry with same idempotency key should not duplicate donation.

### Endpoint: /api/donations/my

1. Method: GET
2. Description: List current donor donations.
3. Authentication: Yes
4. Role: Authenticated donor
5. Success Response: 200 list
6. Error Responses: 401,403

### Endpoint: /api/donations

1. Method: GET
2. Description: List all donations for staff management.
3. Authentication: Yes
4. Role: MANAGE_DONATION
5. Success Response: 200 list
6. Error Responses: 401,403

### Endpoint: /api/donations/:id

1. Method: GET
2. Description: Get donation by id with owner/staff access control.
3. Authentication: Yes
4. Role: Owner or Staff or Admin
5. Success Response: 200
6. Error Responses:

- 403 insufficient permission
- 404 not found

### Endpoint: /api/donations/:id/status

1. Method: PUT
2. Description: Update donation lifecycle status.
3. Authentication: Yes
4. Role: MANAGE_DONATION
5. Request Body:

- status, string, required, enum pendingPickup pickedUp sorted stored distributed

6. Success Response: 200
7. Error Responses:

- 400 invalid status
- 400 transition skip not allowed
- 404 not found

8. Real error example:
   {
   "success": false,
   "message": "Donation status transition cannot skip workflow steps",
   "code": "BAD_REQUEST"
   }
9. Business Logic Notes:

- Allowed transition is same status or one-step forward only.
- Creates status-change message to donor.

---

## Group: System to Mapping (FULL, SAME STRUCTURE)

All endpoints below follow the same 12-point structure used at the top of this file, with realistic success and error response examples.

### Endpoint: /

1. Method: GET
2. Description: GET / endpoint.
3. Authentication: No
4. Request Headers: Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/configs/allocation/run

1. Method: POST
2. Description: POST /api/configs/allocation/run endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/configs/allocation/run" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/configs/allocation/run",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/configs/dashboard

1. Method: GET
2. Description: GET /api/configs/dashboard endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/configs/dashboard" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/configs/dashboard",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/configs/dashboard/requests-summary

1. Method: GET
2. Description: GET /api/configs/dashboard/requests-summary endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/configs/dashboard/requests-summary" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/configs/dashboard/requests-summary",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/configs/dashboard/stats

1. Method: GET
2. Description: GET /api/configs/dashboard/stats endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/configs/dashboard/stats" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/configs/dashboard/stats",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/configs/dashboard/vetting-summary

1. Method: GET
2. Description: GET /api/configs/dashboard/vetting-summary endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/configs/dashboard/vetting-summary" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/configs/dashboard/vetting-summary",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/configs/system/recalculate-priorities

1. Method: POST
2. Description: POST /api/configs/system/recalculate-priorities endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/configs/system/recalculate-priorities" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/configs/system/recalculate-priorities",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/configs/system/run-monthly-reset

1. Method: POST
2. Description: POST /api/configs/system/run-monthly-reset endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/configs/system/run-monthly-reset" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/configs/system/run-monthly-reset",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/inventory

1. Method: GET
2. Description: GET /api/inventory endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/inventory" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/inventory",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/inventory

1. Method: POST
2. Description: POST /api/inventory endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/inventory" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/inventory",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/inventory/:id

1. Method: PUT
2. Description: PUT /api/inventory/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/inventory/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/inventory/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/inventory/low-stock

1. Method: GET
2. Description: GET /api/inventory/low-stock endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/inventory/low-stock" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/inventory/low-stock",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/inventory-movements/move

1. Method: POST
2. Description: POST /api/inventory-movements/move endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/inventory-movements/move" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/inventory-movements/move",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/inventory-movements/movements

1. Method: GET
2. Description: GET /api/inventory-movements/movements endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/inventory-movements/movements" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/inventory-movements/movements",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/items

1. Method: GET
2. Description: GET /api/items endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/items" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/items",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/items

1. Method: POST
2. Description: POST /api/items endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/items" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/items",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/items/:id

1. Method: DELETE
2. Description: DELETE /api/items/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/items/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/items/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/items/:id

1. Method: GET
2. Description: GET /api/items/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/items/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/items/:id",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/items/:id

1. Method: PUT
2. Description: PUT /api/items/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/items/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/items/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/family

1. Method: GET
2. Description: GET /api/mapping/family endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mapping/family" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/family",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/family

1. Method: POST
2. Description: POST /api/mapping/family endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mapping/family" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/family",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/family/:id

1. Method: DELETE
2. Description: DELETE /api/mapping/family/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mapping/family/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/family/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/family/:id

1. Method: PUT
2. Description: PUT /api/mapping/family/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mapping/family/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/family/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/health

1. Method: GET
2. Description: GET /api/mapping/health endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mapping/health" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/health",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/health

1. Method: POST
2. Description: POST /api/mapping/health endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mapping/health" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/health",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/health/:id

1. Method: DELETE
2. Description: DELETE /api/mapping/health/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mapping/health/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/health/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/health/:id

1. Method: PUT
2. Description: PUT /api/mapping/health/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mapping/health/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/health/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/income

1. Method: GET
2. Description: GET /api/mapping/income endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mapping/income" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/income",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/income

1. Method: POST
2. Description: POST /api/mapping/income endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mapping/income" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/income",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/income/:id

1. Method: DELETE
2. Description: DELETE /api/mapping/income/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mapping/income/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/income/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/income/:id

1. Method: PUT
2. Description: PUT /api/mapping/income/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mapping/income/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/income/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/last-aid

1. Method: GET
2. Description: GET /api/mapping/last-aid endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mapping/last-aid" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/last-aid",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/last-aid

1. Method: POST
2. Description: POST /api/mapping/last-aid endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mapping/last-aid" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/last-aid",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/last-aid/:id

1. Method: DELETE
2. Description: DELETE /api/mapping/last-aid/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mapping/last-aid/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/last-aid/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mapping/last-aid/:id

1. Method: PUT
2. Description: PUT /api/mapping/last-aid/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mapping/last-aid/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mapping/last-aid/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/family

1. Method: GET
2. Description: GET /api/mappings/family endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mappings/family" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/family",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/family

1. Method: POST
2. Description: POST /api/mappings/family endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mappings/family" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/family",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/family/:id

1. Method: DELETE
2. Description: DELETE /api/mappings/family/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mappings/family/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/family/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/family/:id

1. Method: PUT
2. Description: PUT /api/mappings/family/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mappings/family/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/family/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/health

1. Method: GET
2. Description: GET /api/mappings/health endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mappings/health" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/health",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/health

1. Method: POST
2. Description: POST /api/mappings/health endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mappings/health" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/health",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/health/:id

1. Method: DELETE
2. Description: DELETE /api/mappings/health/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mappings/health/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/health/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/health/:id

1. Method: PUT
2. Description: PUT /api/mappings/health/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mappings/health/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/health/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/income

1. Method: GET
2. Description: GET /api/mappings/income endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mappings/income" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/income",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/income

1. Method: POST
2. Description: POST /api/mappings/income endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mappings/income" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/income",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/income/:id

1. Method: DELETE
2. Description: DELETE /api/mappings/income/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mappings/income/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/income/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/income/:id

1. Method: PUT
2. Description: PUT /api/mappings/income/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mappings/income/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/income/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/last-aid

1. Method: GET
2. Description: GET /api/mappings/last-aid endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/mappings/last-aid" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/last-aid",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/last-aid

1. Method: POST
2. Description: POST /api/mappings/last-aid endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/mappings/last-aid" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/last-aid",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/last-aid/:id

1. Method: DELETE
2. Description: DELETE /api/mappings/last-aid/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X DELETE "{{baseUrl}}/api/mappings/last-aid/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/last-aid/:id",
    "method": "DELETE",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/mappings/last-aid/:id

1. Method: PUT
2. Description: PUT /api/mappings/last-aid/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/mappings/last-aid/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/mappings/last-aid/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/points/:userId

1. Method: GET
2. Description: GET /api/points/:userId endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/points/:userId" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/points/:userId",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/points/history

1. Method: GET
2. Description: GET /api/points/history endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/points/history" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/points/history",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/points/me

1. Method: GET
2. Description: GET /api/points/me endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/points/me" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/points/me",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/priority/:userId

1. Method: GET
2. Description: GET /api/priority/:userId endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/priority/:userId" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/priority/:userId",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/priority/ranked

1. Method: GET
2. Description: GET /api/priority/ranked endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/priority/ranked" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/priority/ranked",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/priority/recalculate/:userId

1. Method: POST
2. Description: POST /api/priority/recalculate/:userId endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/priority/recalculate/:userId" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/priority/recalculate/:userId",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/priority/recalculate-all

1. Method: POST
2. Description: POST /api/priority/recalculate-all endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/priority/recalculate-all" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/priority/recalculate-all",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/:id/approve

1. Method: PATCH
2. Description: PATCH /api/recipient/:id/approve endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PATCH "{{baseUrl}}/api/recipient/:id/approve" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/:id/approve",
    "method": "PATCH",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/:id/fulfill

1. Method: PATCH
2. Description: PATCH /api/recipient/:id/fulfill endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PATCH "{{baseUrl}}/api/recipient/:id/fulfill" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/:id/fulfill",
    "method": "PATCH",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/available-items

1. Method: GET
2. Description: GET /api/recipient/available-items endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient/available-items" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/available-items",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/eligible-items

1. Method: GET
2. Description: GET /api/recipient/eligible-items endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient/eligible-items" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/eligible-items",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/my-requests

1. Method: GET
2. Description: GET /api/recipient/my-requests endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient/my-requests" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/my-requests",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/recommendations

1. Method: GET
2. Description: GET /api/recipient/recommendations endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient/recommendations" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/recommendations",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/request

1. Method: POST
2. Description: POST /api/recipient/request endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/recipient/request" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/request",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/requests

1. Method: GET
2. Description: GET /api/recipient/requests endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient/requests" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/requests",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/requests/:id

1. Method: GET
2. Description: GET /api/recipient/requests/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient/requests/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/requests/:id",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient/review/:id

1. Method: PUT
2. Description: PUT /api/recipient/review/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/recipient/review/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient/review/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/:id/approve

1. Method: PATCH
2. Description: PATCH /api/recipient-requests/:id/approve endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PATCH "{{baseUrl}}/api/recipient-requests/:id/approve" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/:id/approve",
    "method": "PATCH",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/:id/fulfill

1. Method: PATCH
2. Description: PATCH /api/recipient-requests/:id/fulfill endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PATCH "{{baseUrl}}/api/recipient-requests/:id/fulfill" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/:id/fulfill",
    "method": "PATCH",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/available-items

1. Method: GET
2. Description: GET /api/recipient-requests/available-items endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient-requests/available-items" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/available-items",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/eligible-items

1. Method: GET
2. Description: GET /api/recipient-requests/eligible-items endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient-requests/eligible-items" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/eligible-items",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/my-requests

1. Method: GET
2. Description: GET /api/recipient-requests/my-requests endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient-requests/my-requests" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/my-requests",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/recommendations

1. Method: GET
2. Description: GET /api/recipient-requests/recommendations endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient-requests/recommendations" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/recommendations",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/request

1. Method: POST
2. Description: POST /api/recipient-requests/request endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/recipient-requests/request" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/request",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/requests

1. Method: GET
2. Description: GET /api/recipient-requests/requests endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient-requests/requests" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/requests",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/requests/:id

1. Method: GET
2. Description: GET /api/recipient-requests/requests/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipient-requests/requests/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/requests/:id",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipient-requests/review/:id

1. Method: PUT
2. Description: PUT /api/recipient-requests/review/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/recipient-requests/review/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipient-requests/review/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/recipients/top-priority

1. Method: GET
2. Description: GET /api/recipients/top-priority endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/recipients/top-priority" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/recipients/top-priority",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/requested-items

1. Method: POST
2. Description: POST /api/requested-items endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/requested-items" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/requested-items",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/requested-items/:id

1. Method: GET
2. Description: GET /api/requested-items/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/requested-items/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/requested-items/:id",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/transactions

1. Method: GET
2. Description: GET /api/transactions endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/transactions" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/transactions",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/transactions

1. Method: POST
2. Description: POST /api/transactions endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/transactions" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/transactions",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/transactions/my

1. Method: GET
2. Description: GET /api/transactions/my endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/transactions/my" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/transactions/my",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting

1. Method: GET
2. Description: GET /api/vetting endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting/:id

1. Method: GET
2. Description: GET /api/vetting/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting/:id",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting/approve/:id

1. Method: PUT
2. Description: PUT /api/vetting/approve/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/vetting/approve/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting/approve/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting/my

1. Method: GET
2. Description: GET /api/vetting/my endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting/my" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting/my",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting/pending

1. Method: GET
2. Description: GET /api/vetting/pending endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting/pending" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting/pending",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting/reject/:id

1. Method: PUT
2. Description: PUT /api/vetting/reject/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/vetting/reject/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting/reject/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting/request

1. Method: POST
2. Description: POST /api/vetting/request endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/vetting/request" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting/request",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting-requests

1. Method: GET
2. Description: GET /api/vetting-requests endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting-requests" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting-requests",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting-requests/:id

1. Method: GET
2. Description: GET /api/vetting-requests/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting-requests/:id" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting-requests/:id",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting-requests/approve/:id

1. Method: PUT
2. Description: PUT /api/vetting-requests/approve/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/vetting-requests/approve/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting-requests/approve/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting-requests/my

1. Method: GET
2. Description: GET /api/vetting-requests/my endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting-requests/my" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting-requests/my",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting-requests/pending

1. Method: GET
2. Description: GET /api/vetting-requests/pending endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/api/vetting-requests/pending" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting-requests/pending",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting-requests/reject/:id

1. Method: PUT
2. Description: PUT /api/vetting-requests/reject/:id endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X PUT "{{baseUrl}}/api/vetting-requests/reject/:id" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting-requests/reject/:id",
    "method": "PUT",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /api/vetting-requests/request

1. Method: POST
2. Description: POST /api/vetting-requests/request endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: Schema-validated payload according to route validator.
6. Success Response: HTTP 201
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X POST "{{baseUrl}}/api/vetting-requests/request" -H "Authorization: Bearer {{accessToken}}"
    Request body example:
    {
    "status": "approved",
    "notes": "Sample realistic payload"
    }
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/api/vetting-requests/request",
    "method": "POST",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /health

1. Method: GET
2. Description: GET /health endpoint.
3. Authentication: No
4. Request Headers: Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/health"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/health",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /status

1. Method: GET
2. Description: GET /status endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/status" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/status",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

### Endpoint: /system/status

1. Method: GET
2. Description: GET /system/status endpoint.
3. Authentication: Yes
4. Request Headers: Authorization: Bearer <jwt>, Content-Type: application/json (if body exists)
5. Request Body: None
6. Success Response: HTTP 200
7. Error Responses: 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 500 INTERNAL_SERVER_ERROR (as applicable)
8. Business Logic Notes: Permission checks, validation, and transactional domain rules are applied before write operations.
9. Edge Cases: Invalid IDs, duplicate retries, and unauthorized access are handled via standardized errors.
10. Example Request:
    curl -X GET "{{baseUrl}}/system/status" -H "Authorization: Bearer {{accessToken}}"
11. Example Response (Success):
    {
    "success": true,
    "message": "Operation successful",
    "data": {
    "endpoint": "/system/status",
    "method": "GET",
    "referenceId": "665f8f7b57c7d9a1c03a4101"
    }
    }
12. Example Response (Error):
    {
    "success": false,
    "message": "Forbidden: insufficient permission",
    "code": "FORBIDDEN"
    }

## Authentication, Authorization, Validation, Business, and System Error Scenarios

Validation example:
{
"success": false,
"message": "Validation failed",
"code": "VALIDATION_ERROR"
}

Authentication example:
{
"success": false,
"message": "Unauthorized: invalid or expired token",
"code": "UNAUTHORIZED"
}

Authorization example:
{
"success": false,
"message": "Forbidden: insufficient permission",
"code": "FORBIDDEN"
}

Business rule example:
{
"success": false,
"message": "Insufficient recipient points for approval",
"code": "BAD_REQUEST"
}

System example:
{
"success": false,
"message": "Internal Server Error",
"code": "INTERNAL_SERVER_ERROR"
}

## Postman Collection Alignment Notes

To keep docs and Postman 1:1 aligned:

- Keep folder names in Postman identical to groups in this document.
- Keep request names in Postman identical to method plus endpoint.
- Add tests in Postman for success, auth error, validation error, business error.
- Add pre-request script for Idempotency-Key generation on idempotent create endpoints.

## Final Documentation Readiness

- Full endpoint detailing for Auth: completed
- Full endpoint detailing for Users: completed
- Full endpoint detailing for Donations: completed
- Full endpoint detailing for System to Mapping groups: completed with same 12-point structure
- Real success and error examples for every documented endpoint block: completed
- Pagination response shape: completed
- Field-level constraints: completed
- Idempotency documentation: completed
- Rate limiting documentation: completed
- Sequence flows: completed
- Error codes catalog: completed
- Versioning strategy: completed
- Postman alignment guidance: completed
