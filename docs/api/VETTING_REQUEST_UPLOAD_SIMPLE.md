# Vetting Request + Image Upload (Frontend Simple Guide)

This guide explains only the frontend-relevant part of creating a vetting request with document/image upload.

## 1) Endpoint

- Primary endpoint: `POST /api/vetting/request`
- Alias endpoint: `POST /api/vetting-requests/request`
- Auth: `Authorization: Bearer <accessToken>`

## 2) Middleware Flow (What Happens on Backend)

For `POST /api/vetting/request`, middleware order is:

1. `authMW` (user must be logged in)
2. `checkRoleMW(REQUEST_VETTING)` (recipient permission)
3. `vettingDocumentUploadMW` (parse files + upload to Cloudinary + inject `documentsURL`)
4. `transactionMW`
5. `validateSchema(vettingRequestValidate)`
6. `createVettingRequest`

Why this matters for frontend:

- You can send files in multipart form-data.
- If files are valid and uploaded, backend sets `documentsURL` automatically.
- `monthlyIncome` and `familyMembers` are converted to numbers by middleware.

## 3) File Fields Supported by Upload Middleware

You can use either field style:

- `documents` (up to 10 files)
- `document` (single file)

Both are accepted and merged by backend.

## 4) Upload Validation Rules

From backend config defaults:

- Max size per file: `5MB` (env: `MAX_FILE_SIZE`)
- Allowed MIME types (env: `ALLOWED_FILE_TYPES`):
  - `image/jpeg`
  - `image/png`
  - `image/webp`

If type is invalid, backend returns 400 with message similar to:

- `Unsupported file type. Allowed types are: image/jpeg, image/png, image/webp`

## 5) Required Business Fields

These fields are required for creating vetting request:

- `nationalID` (14 digits)
- `jobTitle`
- `monthlyIncome` (number >= 0)
- `familyMembers` (number >= 1)
- `healthStatus` in: `healthy`, `temporary`, `medium`, `chronic`
- `documentsURL` (array of URL) -> auto-filled by middleware when files are uploaded

Important:

- If you do not upload any file, then you must send `documentsURL` manually as an array of valid URLs.

## 6) Frontend Example (Axios + FormData)

```js
import axios from "axios";

async function submitVettingRequest(token, payload, files) {
  const formData = new FormData();

  formData.append("nationalID", payload.nationalID);
  formData.append("jobTitle", payload.jobTitle);
  formData.append("monthlyIncome", String(payload.monthlyIncome));
  formData.append("familyMembers", String(payload.familyMembers));
  formData.append("healthStatus", payload.healthStatus);

  // Option A: multiple files under "documents"
  for (const file of files) {
    formData.append("documents", file);
  }

  // Option B (single file field): formData.append("document", files[0]);

  const response = await axios.post("/api/vetting/request", formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      // Do not set Content-Type manually when using FormData in browser.
    },
  });

  return response.data;
}
```

## 7) Success and Error Shapes

Success (201):

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "recipientUserID": "...",
    "documentsURL": ["https://..."],
    "vettingStatus": "pending"
  }
}
```

Validation error (400):

```json
{
  "success": false,
  "message": "Validation failed",
  "source": "body",
  "errors": [{ "field": "/nationalID", "message": "must match pattern ..." }]
}
```

Auth/role errors:

- 401 -> missing/invalid token
- 403 -> user does not have `REQUEST_VETTING`
- 409 -> vetting request already exists

## 8) Frontend Checklist

- Send `multipart/form-data` when uploading files.
- Use `documents` for multiple files or `document` for one file.
- Always send all required non-file fields.
- Keep file types in (`jpeg`, `png`, `webp`) and size <= 5MB.
- Expect `documentsURL` in response data after successful upload.
