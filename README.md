# Charity System API

Charity System API is a Node.js and Express backend for managing donations, inventory, recipient requests, vetting, points, messages, and system operations.

## Architecture

- Routes handle HTTP routing only.
- Controllers handle request and response shaping.
- Services contain business logic and transaction boundaries.
- Models define persistence and indexes.

## Documentation System

Professional API documentation is available under `docs/api`:

- `docs/api/API_REFERENCE.md` - full grouped endpoint reference.
- `docs/api/ENDPOINT_CATALOG.md` - complete endpoint inventory and status/auth mapping.
- `docs/api/POSTMAN_TESTING_GUIDE.md` - practical Postman setup and endpoint-by-endpoint testing guide.
- `docs/api/VETTING_REQUEST_UPLOAD_FRONTEND_SIMPLE.md` - simple frontend guide for vetting request with image/document upload middleware.
- `docs/api/SYSTEM_IMPLEMENTATION_SUMMARY.md` - concise milestone-based implementation inventory.
- `docs/api/Charity_System_API.postman_collection.json` - ready-to-import Postman collection.
- `docs/api/Charity_Local.postman_environment.json` - ready-to-import Postman environment.
- `docs/api/MASTER_PROMPT_TEMPLATE.md` - reusable prompt template for endpoint documentation generation.
- `docs/api/REVIEW_CHECKLIST.md` - quality checklist before publishing docs.

## Key Endpoints

- `GET /` - service metadata.
- `GET /health` - public operational health snapshot.
- `GET /status` - protected system snapshot for staff/admin roles.
- `GET /api/auth/me` - authenticated profile lookup.
- `POST /api/dev/managed-accounts` - developer-only testing endpoint for Staff/Admin creation using `X-Developer-Key`.
- `POST /api/users/managed-accounts` - admin-only creation of Staff/Admin accounts.
- `GET /api/points/me` - current recipient points.
- `GET /api/configs/dashboard/stats` - dashboard statistics.

## Response Shape

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "error"
}
```

## Configuration

Copy `.env.example` to `.env` and provide the required values:

- `MONGO_URI`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `DEVELOPER_API_KEY` for the developer testing endpoint
- Cloudinary values for production
- Email/OTP values when OTP auth is enabled

## Background Jobs

- Monthly points reset.
- Priority recalculation.
- Expired OTP cleanup.

## Testing

Run the full integration suite with:

```bash
npm test
```
