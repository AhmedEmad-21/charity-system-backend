# Endpoint Catalog (Complete Coverage)

This catalog lists all route-level endpoints currently exposed by the backend.

Columns:

- Auth: `No` or `JWT`
- Permission/Role: middleware requirement summary
- Body Schema: validator file or inline schema
- Success: primary success codes
- Errors: common error codes

| Group              | Endpoint                                   | Method        | Auth | Permission/Role                                 | Body Schema                                | Success | Errors                  |
| ------------------ | ------------------------------------------ | ------------- | ---- | ----------------------------------------------- | ------------------------------------------ | ------- | ----------------------- |
| System             | /                                          | GET           | No   | Public                                          | None                                       | 200     | 500                     |
| System             | /health                                    | GET           | No   | Public                                          | None                                       | 200     | 500                     |
| System             | /status                                    | GET           | JWT  | MANAGE_CONFIG or VIEW_DASHBOARD                 | None                                       | 200     | 401,403,500             |
| System             | /system/status                             | GET           | JWT  | MANAGE_CONFIG or VIEW_DASHBOARD                 | None                                       | 200     | 401,403,500             |
| Auth               | /api/auth/register                         | POST          | No   | Public                                          | authRegisterValidate                       | 201     | 400,409,500             |
| Auth               | /api/auth/login                            | POST          | No   | Public                                          | authLoginValidate                          | 200     | 400,401,500             |
| Auth               | /api/auth/me                               | GET           | JWT  | Authenticated                                   | None                                       | 200     | 401,500                 |
| Auth               | /api/auth/refresh-token                    | POST          | No   | Public                                          | Inline/service validation                  | 200     | 401,400,500             |
| Auth               | /api/auth/logout                           | POST          | JWT  | Authenticated                                   | None                                       | 200     | 401,500                 |
| Auth               | /api/auth/forgot-password                  | POST          | No   | Public                                          | Inline/service validation                  | 200     | 400,404,500             |
| Auth               | /api/auth/reset-password                   | POST          | No   | Public                                          | Inline/service validation                  | 200     | 400,404,500             |
| OTP                | /api/auth/send-otp                         | POST          | No   | Public + otp limiter                            | otpPayloadSchema (inline)                  | 200     | 400,404,429,500         |
| OTP                | /api/auth/verify-otp                       | POST          | No   | Public + otp limiter                            | verifyOtpPayloadSchema (inline)            | 200     | 400,404,409,429,500     |
| OTP                | /api/auth/resend-otp                       | POST          | No   | Public + otp limiter                            | otpPayloadSchema (inline)                  | 200     | 400,404,429,500         |
| Users              | /api/users/search                          | GET           | JWT  | MANAGE_USERS                                    | Query params                               | 200     | 401,403,500             |
| Users              | /api/users/filter                          | GET           | JWT  | MANAGE_USERS                                    | Query params                               | 200     | 401,403,500             |
| Users              | /api/users                                 | GET           | JWT  | MANAGE_USERS                                    | Query params                               | 200     | 401,403,500             |
| Users              | /api/users/:id                             | GET           | JWT  | MANAGE_USERS                                    | None                                       | 200     | 401,403,404,500         |
| Users              | /api/users/:id                             | PUT           | JWT  | Owner or MANAGE_USERS                           | userValidate                               | 200     | 400,401,403,404,500     |
| Users              | /api/users/:id                             | DELETE        | JWT  | MANAGE_USERS                                    | None                                       | 200     | 401,403,404,500         |
| Vetting            | /api/vetting/request                       | POST          | JWT  | REQUEST_VETTING                                 | vettingRequestValidate + upload middleware | 201     | 400,401,403,409,500     |
| Vetting            | /api/vetting/my                            | GET           | JWT  | REQUEST_VETTING or MANAGE_VETTING               | None                                       | 200     | 401,403,404,500         |
| Vetting            | /api/vetting/pending                       | GET           | JWT  | MANAGE_VETTING                                  | None                                       | 200     | 401,403,500             |
| Vetting            | /api/vetting                               | GET           | JWT  | MANAGE_VETTING                                  | Query status                               | 200     | 401,403,500             |
| Vetting            | /api/vetting/:id                           | GET           | JWT  | REQUEST_VETTING or MANAGE_VETTING               | None                                       | 200     | 401,403,404,500         |
| Vetting            | /api/vetting/approve/:id                   | PUT           | JWT  | MANAGE_VETTING                                  | Service-level status handling              | 200     | 401,403,404,409,500     |
| Vetting            | /api/vetting/reject/:id                    | PUT           | JWT  | MANAGE_VETTING                                  | Service-level status handling              | 200     | 401,403,404,409,500     |
| Vetting Alias      | /api/vetting-requests/\*                   | Same as above | JWT  | Same as above                                   | Same as above                              | Same    | Same                    |
| Donations          | /api/donations                             | POST          | JWT  | CREATE_DONATION or MANAGE_DONATION              | donationReqValidate + idempotency          | 201     | 400,401,403,409,500     |
| Donations          | /api/donations/my                          | GET           | JWT  | Authenticated donor                             | None                                       | 200     | 401,403,500             |
| Donations          | /api/donations                             | GET           | JWT  | MANAGE_DONATION                                 | Query params                               | 200     | 401,403,500             |
| Donations          | /api/donations/:id                         | GET           | JWT  | Owner/staff access rules                        | None                                       | 200     | 401,403,404,500         |
| Donations          | /api/donations/:id/status                  | PUT           | JWT  | MANAGE_DONATION                                 | status body (service rules)                | 200     | 400,401,403,404,409,500 |
| Items              | /api/items                                 | POST          | JWT  | MANAGE_ITEMS (route middleware stack)           | itemValidate                               | 201     | 400,401,403,500         |
| Items              | /api/items                                 | GET           | JWT  | MANAGE_ITEMS                                    | Query params                               | 200     | 401,403,500             |
| Items              | /api/items/:id                             | GET           | JWT  | MANAGE_ITEMS                                    | None                                       | 200     | 401,403,404,500         |
| Items              | /api/items/:id                             | PUT           | JWT  | MANAGE_ITEMS                                    | itemValidate                               | 200     | 400,401,403,404,500     |
| Items              | /api/items/:id                             | DELETE        | JWT  | MANAGE_ITEMS                                    | None                                       | 200     | 401,403,404,500         |
| Inventory          | /api/inventory/low-stock                   | GET           | JWT  | MANAGE_INVENTORY                                | None                                       | 200     | 401,403,500             |
| Inventory          | /api/inventory                             | GET           | JWT  | MANAGE_INVENTORY                                | Query filters (+optional pagination)       | 200     | 401,403,500             |
| Inventory          | /api/inventory                             | POST          | JWT  | MANAGE_INVENTORY                                | inventoryValidate                          | 201     | 400,401,403,500         |
| Inventory          | /api/inventory/:id                         | PUT           | JWT  | MANAGE_INVENTORY                                | inventoryValidate                          | 200     | 400,401,403,404,500     |
| Inventory Move     | /api/inventory-movements/move              | POST          | JWT  | MANAGE_INVENTORY                                | inventoryMovementValidate                  | 201     | 400,401,403,404,500     |
| Inventory Move     | /api/inventory-movements/movements         | GET           | JWT  | MANAGE_INVENTORY                                | Query params                               | 200     | 401,403,500             |
| Recipient          | /api/recipient/request                     | POST          | JWT  | REQUEST_AID + approved vetting                  | recipientRequestValidate + idempotency     | 201     | 400,401,403,409,500     |
| Recipient          | /api/recipient/my-requests                 | GET           | JWT  | REQUEST_AID + approved vetting                  | Query pagination optional                  | 200     | 401,403,500             |
| Recipient          | /api/recipient/requests/:id                | GET           | JWT  | REQUEST_AID or APPROVE/FULFILL permissions      | None                                       | 200     | 401,403,404,500         |
| Recipient          | /api/recipient/requests                    | GET           | JWT  | APPROVE/FULFILL permissions                     | Query pagination optional                  | 200     | 401,403,500             |
| Recipient          | /api/recipient/review/:id                  | PUT           | JWT  | APPROVE/FULFILL permissions                     | reviewSchema inline                        | 200     | 400,401,403,404,409,500 |
| Recipient          | /api/recipient/available-items             | GET           | JWT  | REQUEST_AID + approved vetting                  | None                                       | 200     | 401,403,500             |
| Recipient          | /api/recipient/eligible-items              | GET           | JWT  | REQUEST_AID + approved vetting                  | None                                       | 200     | 401,403,500             |
| Recipient          | /api/recipient/recommendations             | GET           | JWT  | REQUEST_AID + approved vetting                  | None                                       | 200     | 401,403,500             |
| Recipient Alias    | /api/recipient/:id/approve                 | PATCH         | JWT  | APPROVE/FULFILL permissions                     | reviewSchema inline                        | 200     | 400,401,403,404,409,500 |
| Recipient Alias    | /api/recipient/:id/fulfill                 | PATCH         | JWT  | APPROVE/FULFILL permissions                     | reviewSchema inline                        | 200     | 400,401,403,404,409,500 |
| Recipient Alias    | /api/recipient-requests/\*                 | Same as above | JWT  | Same as above                                   | Same as above                              | Same    | Same                    |
| Requested Items    | /api/requested-items                       | POST          | JWT  | REQUEST_AID or MANAGE_REQUESTED_ITEMS + vetting | requestedItemValidate                      | 201     | 400,401,403,404,409,500 |
| Requested Items    | /api/requested-items/:id                   | GET           | JWT  | REQUEST_AID or MANAGE_REQUESTED_ITEMS + vetting | None                                       | 200     | 401,403,404,500         |
| Transactions       | /api/transactions                          | POST          | JWT  | CREATE_DONATION or MANAGE_TRANSACTIONS          | transactionCreateSchema inline             | 201     | 400,401,403,409,500     |
| Transactions       | /api/transactions/my                       | GET           | JWT  | CREATE_DONATION or VIEW/MANAGE_TRANSACTIONS     | Query params                               | 200     | 401,403,500             |
| Transactions       | /api/transactions                          | GET           | JWT  | MANAGE_TRANSACTIONS                             | Query params                               | 200     | 401,403,500             |
| Messages           | /api/messages/me                           | GET           | JWT  | VIEW_MESSAGES or MANAGE_MESSAGES                | Query pagination optional                  | 200     | 401,403,500             |
| Messages           | /api/messages                              | GET           | JWT  | MANAGE_MESSAGES                                 | Query pagination optional                  | 200     | 401,403,500             |
| Messages           | /api/messages/read/:id                     | PUT           | JWT  | VIEW_MESSAGES or MANAGE_MESSAGES                | None                                       | 200     | 400,401,403,404,500     |
| Points             | /api/points/me                             | GET           | JWT  | REQUEST_AID or VIEW/MANAGE_TRANSACTIONS         | None                                       | 200     | 401,403,404,500         |
| Points             | /api/points/history                        | GET           | JWT  | REQUEST_AID or VIEW/MANAGE_TRANSACTIONS         | Query (`page`, `limit`)                    | 200     | 401,403,500             |
| Points             | /api/points/:userId                        | GET           | JWT  | VIEW/MANAGE_TRANSACTIONS                        | None                                       | 200     | 401,403,404,500         |
| Priority           | /api/priority/ranked                       | GET           | JWT  | MANAGE_VETTING                                  | Query params                               | 200     | 401,403,500             |
| Priority           | /api/priority/:userId                      | GET           | JWT  | Authenticated                                   | None                                       | 200     | 401,403,404,500         |
| Priority           | /api/priority/recalculate/:userId          | POST          | JWT  | MANAGE_VETTING                                  | None                                       | 200     | 401,403,404,500         |
| Priority           | /api/priority/recalculate-all              | POST          | JWT  | MANAGE_VETTING                                  | None                                       | 200     | 401,403,500             |
| Recipient Priority | /api/recipients/top-priority               | GET           | JWT  | MANAGE_VETTING                                  | Query params                               | 200     | 401,403,500             |
| Config Dashboard   | /api/configs/dashboard                     | GET           | JWT  | VIEW_DASHBOARD                                  | None                                       | 200     | 401,403,500             |
| Config Dashboard   | /api/configs/dashboard/stats               | GET           | JWT  | VIEW_DASHBOARD                                  | None                                       | 200     | 401,403,500             |
| Config Dashboard   | /api/configs/dashboard/vetting-summary     | GET           | JWT  | VIEW_DASHBOARD                                  | None                                       | 200     | 401,403,500             |
| Config Dashboard   | /api/configs/dashboard/requests-summary    | GET           | JWT  | VIEW_DASHBOARD                                  | None                                       | 200     | 401,403,500             |
| Config Jobs        | /api/configs/system/run-monthly-reset      | POST          | JWT  | MANAGE_CONFIG                                   | None                                       | 200     | 401,403,500             |
| Config Jobs        | /api/configs/system/recalculate-priorities | POST          | JWT  | MANAGE_CONFIG                                   | None                                       | 200     | 401,403,500             |
| Config Jobs        | /api/configs/allocation/run                | POST          | JWT  | MANAGE_CONFIG                                   | None                                       | 200     | 401,403,500             |
| Config CRUD        | /api/configs                               | POST          | JWT  | MANAGE_CONFIG                                   | configValidate                             | 201     | 400,401,403,500         |
| Config CRUD        | /api/configs                               | GET           | JWT  | MANAGE_CONFIG                                   | None                                       | 200     | 401,403,500             |
| Config CRUD        | /api/configs/:id                           | GET           | JWT  | MANAGE_CONFIG                                   | None                                       | 200     | 401,403,404,500         |
| Config CRUD        | /api/configs/:id                           | PUT           | JWT  | MANAGE_CONFIG                                   | configValidate                             | 200     | 400,401,403,404,500     |
| Config CRUD        | /api/configs/:id                           | DELETE        | JWT  | MANAGE_CONFIG                                   | None                                       | 200     | 401,403,404,500         |
| Income Mapping     | /api/mappings/income                       | POST          | JWT  | Route-level auth rules                          | incomeScoreMappingValidate                 | 201     | 400,401,403,500         |
| Income Mapping     | /api/mappings/income                       | GET           | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,500             |
| Income Mapping     | /api/mappings/income/:id                   | PUT           | JWT  | Route-level auth rules                          | incomeScoreMappingValidate                 | 200     | 400,401,403,404,500     |
| Income Mapping     | /api/mappings/income/:id                   | DELETE        | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,404,500         |
| Family Mapping     | /api/mappings/family                       | POST          | JWT  | Route-level auth rules                          | familyScoreMappingValidate                 | 201     | 400,401,403,500         |
| Family Mapping     | /api/mappings/family                       | GET           | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,500             |
| Family Mapping     | /api/mappings/family/:id                   | PUT           | JWT  | Route-level auth rules                          | familyScoreMappingValidate                 | 200     | 400,401,403,404,500     |
| Family Mapping     | /api/mappings/family/:id                   | DELETE        | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,404,500         |
| Health Mapping     | /api/mappings/health                       | POST          | JWT  | Route-level auth rules                          | healthScoreMappingValidate                 | 201     | 400,401,403,500         |
| Health Mapping     | /api/mappings/health                       | GET           | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,500             |
| Health Mapping     | /api/mappings/health/:id                   | PUT           | JWT  | Route-level auth rules                          | healthScoreMappingValidate                 | 200     | 400,401,403,404,500     |
| Health Mapping     | /api/mappings/health/:id                   | DELETE        | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,404,500         |
| Last-Aid Mapping   | /api/mappings/last-aid                     | POST          | JWT  | Route-level auth rules                          | lastAidScoreMappingValidate                | 201     | 400,401,403,500         |
| Last-Aid Mapping   | /api/mappings/last-aid                     | GET           | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,500             |
| Last-Aid Mapping   | /api/mappings/last-aid/:id                 | PUT           | JWT  | Route-level auth rules                          | lastAidScoreMappingValidate                | 200     | 400,401,403,404,500     |
| Last-Aid Mapping   | /api/mappings/last-aid/:id                 | DELETE        | JWT  | Route-level auth rules                          | None                                       | 200     | 401,403,404,500         |
| Mapping Aliases    | /api/mapping/\*                            | Same          | Same | Same                                            | Same                                       | Same    | Same                    |

## Notes

- Some CRUD endpoints are generated by route factories; behavior is documented as explicit endpoints here.
- This file is the quickest audit artifact for “all APIs documented” requirement.
- Use this with `API_REFERENCE.md` for detailed business logic and examples.
