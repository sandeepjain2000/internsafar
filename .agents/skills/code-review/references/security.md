# Security Review

Use this reference for security-sensitive analysis.

## Security Principles

Review actual implementation rather than assuming framework defaults are correctly configured.

Prioritize concrete security vulnerabilities and insecure behavior.

## Authentication

Check:

- Token generation
- Token verification
- Token expiration
- Secret/key configuration
- Password handling
- Session handling
- Authentication middleware
- Authentication bypass paths
- Insecure fallback credentials/secrets

A fallback secret or default credential is a security issue when the implementation can operate with it in a security-sensitive environment.

## Authorization

Check:

- Resource ownership
- Role checks
- Permission checks
- Privileged endpoints
- Administrative operations
- Object-level authorization

Do not assume that authentication implies authorization.

## Input Security

Check:

- SQL injection
- NoSQL injection
- Command injection
- Path traversal
- Unsafe file handling
- Unsafe deserialization
- Server-side template injection
- Cross-site scripting where applicable
- Header injection
- Unvalidated redirects

Only report vulnerabilities supported by the actual implementation.

## Secrets

Check for:

- Hardcoded secrets
- API keys
- Passwords
- Tokens
- Private credentials
- Default secrets
- Weak fallback secrets
- Secrets exposed through logs
- Secrets returned through APIs

Do not reproduce sensitive credentials in the final report.

## Sensitive Data

Check whether sensitive information is:

- Logged
- Returned unnecessarily
- Stored insecurely
- Exposed to unauthorized users
- Sent over inappropriate boundaries

## Cryptography

Check for:

- Weak algorithms
- Hardcoded cryptographic keys
- Incorrect password hashing
- Insecure token signing
- Predictable security values
- Improper verification

Do not classify a cryptographic implementation as insecure merely because it is custom; inspect the actual implementation.

## Web Security

Where applicable, check:

- CORS
- CSRF
- Security headers
- Cookie flags
- HTTPS assumptions
- Rate limiting
- Request size limits
- File upload restrictions
- SSRF risks

Only report when the implementation provides concrete evidence.

## Dependency and Configuration Risk

Check:

- Dangerous defaults
- Insecure configuration
- Unrestricted debug behavior
- Exposed development endpoints
- Dependency usage that creates an observable security issue

Do not report a dependency vulnerability solely because a dependency exists. A concrete version or usage-based issue must be established where possible.

## Severity

Security severity must reflect actual impact and exploitability.

Consider:

- Can an attacker reach the vulnerable code?
- What privilege is required?
- What data or functionality is exposed?
- Is exploitation remote/local?
- Is authentication required?
- Is the issue systemic?
- What is the realistic impact?

Do not automatically assign critical severity to every security finding.