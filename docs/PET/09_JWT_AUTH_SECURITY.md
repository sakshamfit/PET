# PET JWT Authentication & Security

## Authentication

Use:

- password hashing on the server
- short-lived JWT access token
- rotating refresh token
- server-side session record

## Login

\`\`\`text
Credentials
 ↓
Rate limit
 ↓
Find user
 ↓
Verify password hash
 ↓
Check account status
 ↓
Create session
 ↓
Issue access JWT
 ↓
Issue refresh token
\`\`\`

Never reveal whether an email/employee ID exists through login error wording.

## Access JWT

Claims should contain only operational identity information such as:

- subject/user ID
- session ID
- role
- token type
- expiry

Never put:

- password
- password hash
- sensitive student data
- private documents
- large permissions objects

## Refresh Token

Refresh tokens must:

- be cryptographically random
- be stored as hashes server-side
- rotate on refresh
- detect replay
- be revocable
- have expiry

The existing token implementation already follows this pattern and should be reused.

## Authorization

Every request:

JWT
→ session
→ active user
→ current role
→ permission
→ resource ownership
→ operation

Do not rely on frontend route guards as security.

## Employee Deactivation

When an employee is disabled:

1. mark user inactive
2. revoke active sessions
3. reject future requests
4. preserve historical records

Do not delete the employee if their historical actions must remain auditable.

## Password Reset

Main Admin can initiate reset.

The server must never display an existing password.

Prefer:

- one-time reset token
- forced password change
- immediate session revocation

## Browser Storage

Do not store refresh tokens in localStorage.

For web, prefer secure HttpOnly cookies where the architecture permits.

For Android/desktop, use the platform secure credential store.

## Brute Force Protection

Protect login and refresh endpoints with:

- rate limiting
- failed-login tracking
- temporary lockout
- audit events

## Transport

Production API traffic must use HTTPS.

If using a private VPN, HTTPS should still be used for the application API.

## Secrets

Never commit:

- JWT secrets
- password reset secrets
- encryption keys
- database credentials
- VPN secrets

Use server environment variables or an OS secret-management mechanism.
