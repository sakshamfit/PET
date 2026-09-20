# PET Offline Field Sync Specification

## Why

Employees work in schools where mobile connectivity may be unreliable.

The application must prevent data loss during short network outages.

## Client State

The mobile client maintains:

- local cached read data
- pending mutation queue
- upload queue
- sync status

## Queue Item

Each operation should contain:

- idempotency key
- operation type
- entity type
- entity ID
- payload
- created timestamp
- retry count
- last error
- sync status

## Example

\`\`\`text
Student registration
↓
Local save
↓
QUEUE-7f91...
↓
Network returns
↓
POST /api/sync
↓
Server checks idempotency key
↓
SQLite transaction
↓
SUCCESS
↓
Queue item marked synced
\`\`\`

## Idempotency

The server must recognize a previously processed idempotency key.

If the same request is sent twice:

- do not create a second student
- do not create a second attendance record
- do not create a second visit
- return the original operation result where practical

## Conflict Handling

For records edited by multiple people:

- server timestamps determine ordering
- destructive conflicts require explicit handling
- never silently overwrite newer data
- keep audit history

## Photos

Photo upload should be retryable.

If metadata reaches the server before the binary upload completes, the record must remain in a pending-upload state.

## User Experience

Show:

- Synced
- Syncing
- Pending
- Failed — Tap to retry

Never hide unsynced data.

## Limits

Offline mode should support the field workflows, not attempt to mirror the entire server database locally.
