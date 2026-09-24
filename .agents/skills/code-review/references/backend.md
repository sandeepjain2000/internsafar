# Backend Review

Use this reference when reviewing backend files, APIs, services, controllers, middleware, database access, and server-side business logic.

## API Correctness

Check:

- HTTP method correctness
- Request validation
- Response structure
- Error handling
- Status code correctness
- Authentication enforcement
- Authorization enforcement
- Input handling
- Missing required fields
- Incorrect assumptions about request data
- Incorrect assumptions about database responses
- Inconsistent API behavior
- Duplicate or unreachable logic

## Validation

Check whether externally supplied input is appropriately validated.

Review:
- Request bodies
- Query parameters
- Route parameters
- Headers
- Uploaded files
- User-controlled identifiers

Look for:
- Missing validation
- Weak validation
- Incorrect type assumptions
- Validation performed too late
- Validation that can be bypassed

Do not assume validation exists merely because a type definition exists.

## Error Handling

Check:

- Errors are handled at appropriate boundaries.
- Internal errors are not exposed unnecessarily.
- Expected failures return appropriate responses.
- Unexpected failures do not silently succeed.
- Async errors are not lost.
- Errors do not leave partially completed operations in inconsistent states.

## Authentication

Check:

- Authentication is required where appropriate.
- Authentication tokens are validated correctly.
- Expiration is handled.
- Invalid credentials are rejected.
- Authentication configuration does not silently fall back to insecure behavior.

## Authorization

Check:

- Users can only access resources they are authorized to access.
- Object/resource identifiers are not trusted solely because they are supplied by the client.
- Role/permission checks occur at the server boundary.
- Privileged operations are protected.

## Database

Check:

- Queries are correctly parameterized.
- User input cannot alter query structure.
- Missing records are handled.
- Transactions are used where required for atomicity.
- Partial updates cannot leave inconsistent state.
- Database connections are handled correctly.
- N+1 or repeated queries exist where they create meaningful performance problems.
- Sensitive information is not unnecessarily retrieved or returned.

## Business Logic

Check for:

- Incorrect conditions
- Incorrect state transitions
- Duplicate operations
- Missing invariants
- Race conditions
- Incorrect calculations
- Incorrect assumptions about data
- Partial failure scenarios
- Time/date handling problems
- Inconsistent behavior between related endpoints

## Secrets and Configuration

Check:

- Hardcoded secrets
- Default credentials
- Insecure fallback secrets
- Sensitive values in source control
- Secrets exposed in responses or logs
- Unsafe production defaults

Configuration behavior must be verified from actual code.

Do not assume environment variables are secure merely because they are referenced.

## Logging

Check for:

- Sensitive data in logs
- Tokens/passwords/secrets in logs
- Missing useful context for important failures
- Excessive logging in sensitive paths

## Concurrency and Reliability

Where relevant, inspect:

- Race conditions
- Duplicate requests
- Idempotency
- Concurrent updates
- Retry behavior
- Transaction boundaries
- Resource cleanup
- Timeout handling

Only report a reliability problem when the implementation provides concrete evidence.