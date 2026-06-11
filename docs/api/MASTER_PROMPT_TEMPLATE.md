# MASTER PROMPT TEMPLATE

You are a Senior Backend Engineer and API Documentation Specialist.

Generate professional API documentation for the following endpoint.

Follow this exact structure:

1. Endpoint:
2. Method:
3. Description:
4. Authentication:
   - Required (Yes/No)
   - Role (if any)

5. Request Headers:
   - Content-Type
   - Authorization (if needed)

6. Request Body:
   - List all fields with:
     - name
     - type
     - required/optional
     - description

7. Success Response:
   - HTTP Status Code
   - JSON example

8. Error Responses:
   - List all possible errors:
     - Validation errors
     - Authentication errors
     - Authorization errors
     - Business logic errors
   - Provide example JSON for each

9. Business Logic Notes:
   - Explain how the system processes this request

10. Edge Cases:

- List important edge cases and system behavior

11. Pagination (if list endpoint):

- Query params (`page`, `limit`, or cursor)
- Response pagination shape example

12. Field-Level Constraints:

- format, min/max length, regex, normalization, allowed enum values

13. Idempotency (if applicable):

- `Idempotency-Key` header behavior and conflict cases

14. Rate Limiting:

- Mention `429` behavior and endpoint-specific limits

15. API Versioning Note:

- Current route and target versioned route (`/api/v1/...`)

16. Postman Mapping:

- Folder name and request name (1:1 mapping)

17. Example Request:

- JSON

18. Example Response:

- JSON

19. Error Code Mapping:

- Include concrete error codes used by backend for each error scenario

Make the documentation clear, professional, and suitable for frontend developers.
Use consistent formatting and clean English.
