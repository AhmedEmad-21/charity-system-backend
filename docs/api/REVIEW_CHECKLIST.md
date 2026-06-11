# API Documentation Review Checklist

## Coverage

- [ ] Every route in `src/routes` is documented.
- [ ] Endpoint aliases are documented (if any).
- [ ] All groups are covered: Auth, Users, Vetting, Donations, Inventory, Recipient, Transactions, OTP, Config, Mappings, System.
- [ ] No endpoint is summary-only; each endpoint has a full breakdown section.

## Endpoint Quality

- [ ] Each endpoint has: endpoint, method, description.
- [ ] Authentication requirement is clear.
- [ ] Required role/permission is clear.
- [ ] Request headers are documented.
- [ ] Request body fields are documented with type and required/optional.
- [ ] Field-level constraints are documented (format, regex, min/max, enum, normalization).
- [ ] Idempotency is documented for idempotent endpoints.
- [ ] Rate limiting is documented for protected or abuse-prone endpoints.

## Responses and Errors

- [ ] Success response includes HTTP status + JSON example.
- [ ] Error scenarios include validation/auth/authz/business/system errors.
- [ ] Status codes are mapped correctly: 200/201/400/401/403/404/409/500.
- [ ] Error examples are realistic and consistent.
- [ ] Pagination response shape is documented for list endpoints.
- [ ] Error codes reference catalog is included and up to date.

## Business and Edge Cases

- [ ] Business rules are documented.
- [ ] Edge cases are documented.
- [ ] Frontend-impacting behavior is explicit.
- [ ] Sequence flows are documented (Auth, Donation, Recipient).

## Final Readiness

- [ ] Formatting is consistent.
- [ ] Language is clear and unambiguous.
- [ ] Documentation is frontend-ready.
- [ ] Versioning strategy is documented.
- [ ] Postman collection alignment is documented.
