# System Implementation Summary

## 1) System Overview

- System Name: Charity System API
- Purpose: Manage donations, vetting, recipient aid requests, inventory, points, priorities, transactions, and system operations.
- Main Actors:
  - Donor
  - Recipient
  - Staff
  - Admin

## 2) Features Inventory (Grouped)

### Authentication and Security

- JWT authentication (access + refresh token flow)
- Role-based authorization and permission checks
- OTP system via email (send, verify, resend)
- Rate limiting (auth, OTP, recipient request limits)
- Input validation via JSON schema middleware

### User Management

- Registration and login
- Authenticated profile retrieval
- User listing, filtering, searching
- User update and delete with role/ownership checks

### Vetting System

- Vetting request submission
- Vetting review workflow (approve/reject)
- Pending and history endpoints
- One request per user guard (service/middleware rules)

### Donation System

- Donation request creation
- Donation lifecycle/status tracking
- Donor-specific donation listing
- Staff donation management workflows

### Item and Inventory System

- Item CRUD management
- Inventory CRUD and low-stock detection
- Inventory movement recording and tracking
- Inventory consistency enforcement during allocation/fulfillment

### Recipient System

- Recipient request creation
- Requested item submission
- Review workflow (approve/reject/fulfill)
- Recipient item availability and recommendation endpoints

### Priority System

- Priority score calculation engine
- Scoring inputs:
  - Income
  - Family size
  - Health status
  - Last aid date
- Recipient ranking and recalculation endpoints

### Points System

- Monthly points allocation/reset jobs
- Points consumption during approved aid workflows
- Points history tracking and retrieval APIs

### Financial Transactions

- Transaction creation and listing
- Donation/payment tracking endpoints
- Idempotency protection on critical write routes

### Messaging System

- Message generation for workflow updates
- Recipient/staff message listing
- Read/unread state management

### Background Jobs

- Monthly points reset
- Priority recalculation
- Allocation execution endpoints/jobs

## 3) Security Features

- JWT authentication middleware
- Role-based access control (RBAC) middleware
- OTP verification (email)
- Rate limiting middleware
- Input sanitization middleware
- Schema validation middleware
- Secure password hashing (auth service/model flow)
- Protected route middleware chain (auth + role + validators)
- Revoked token and token lifecycle handling

## 4) Database Collections and Structure

### Core Collections

- Users
- VettingRequests
- DonationRequests
- Items
- Inventory
- InventoryMovements
- Transactions
- RecipientRequests
- RequestedItems
- Messages
- RecipientPoints
- PointsTransactions
- RecipientPriority
- IdempotencyKeys
- Otp
- RevokedTokens
- SystemAuditLogs
- RecipientItemQuota

### Mapping Collections

- IncomeMapping
- FamilyMapping
- HealthMapping
- LastAidMapping

### Relationships (References)

- Requests reference user IDs (requestor/reviewer/staff)
- Requested items reference recipient requests and items
- Inventory movements reference items/inventory and actor user
- Transactions and points history reference user and workflow entities
- Priority records reference recipient/user

### Indexes and Performance

- Indexed hot query fields across auth, requests, inventory, transactions, messaging, and priority models
- Compound indexes for frequent filters/sorts
- TTL/index strategy for expirable operational data where applicable (for example OTP/idempotency lifecycles)

## 5) Core Business Logic

- Priority calculation and ranking logic
- Monthly points distribution/reset logic
- Allocation and aid matching logic
- Request approval/rejection/fulfillment workflow logic
- Inventory deduction/update and stock safety logic
- Transaction orchestration and consistency logic

## 6) Transaction and Concurrency Handling

- MongoDB transaction middleware for critical flows
- Atomic operations for points/inventory updates
- Idempotency middleware and key persistence
- Conflict handling for concurrent or duplicate processing
- Safe request approval utilities with locking patterns
- Job-safe execution wrappers for scheduled/manual system jobs
- Retry-safe behavior through idempotent design and transactional rollback

## 7) Validation and Error Handling

- JSON schema validation for request payloads
- ID validation middleware
- Global error handler middleware
- Standardized success/error response shaping
- Structured domain/business error mapping (validation, auth, conflict, not-found)

## 8) API Coverage Summary

- System APIs
- Auth and OTP APIs
- User APIs
- Vetting APIs
- Donation APIs
- Item APIs
- Inventory and Inventory Movement APIs
- Recipient and Requested Item APIs
- Transaction APIs
- Message APIs
- Points APIs
- Priority and Recipient Priority APIs
- Config and system job APIs
- Mapping APIs (income, family, health, last aid)

## 9) Infrastructure and Architecture

- Node.js runtime
- Express web framework
- MongoDB database
- Mongoose ODM
- Layered architecture:
  - Routes
  - Controllers
  - Services
  - Models
- Middleware-based request pipeline
- Centralized app-level health/status/system routing

## 10) Testing Coverage

- Integration testing suite
- API behavior and contract testing
- Concurrency and stress testing
- Idempotency and conflict scenario testing
- Edge-case and failure-path validation

## 11) Environment Configuration

- Environment-driven setup via .env
- Core secrets and connection config:
  - MONGO_URI
  - JWT_SECRET
  - REFRESH_TOKEN_SECRET
- Cloudinary integration config for uploads/media workflows
- Email/SMTP configuration for OTP delivery
- Runtime flags and service credentials managed through environment variables
