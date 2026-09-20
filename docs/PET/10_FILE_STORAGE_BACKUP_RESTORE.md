# PET File Storage, Backup & Restore

## Storage Layout

Recommended:

\`\`\`text
PET/
├── data/
│   └── pet.db
├── uploads/
│   ├── students/
│   ├── schools/
│   ├── field-visits/
│   └── documents/
├── backups/
│   ├── daily/
│   └── weekly/
└── logs/
\`\`\`

## Database

Use SQLite online backup or a safe SQLite backup mechanism.

Do not simply copy the database file while it is actively being written unless the backup mechanism is safe for SQLite.

The repository already contains backup tooling; extend it for PET data.

## Backup Contents

Each backup set should contain:

- SQLite database
- uploads
- metadata needed to restore
- application version

Never put raw environment secrets into backups.

## Schedule

Recommended:

- daily database backup
- daily changed-file/upload backup
- weekly full backup
- periodic off-site backup

## Retention

Suggested starting policy:

- 14 daily backups
- 8 weekly backups
- 3 monthly backups

Adjust to Trust policy and available storage.

## Integrity

After creating a database backup:

1. open backup read-only
2. run SQLite integrity check
3. verify expected tables
4. record result
5. keep only verified backups

## Restore

Documented restore:

1. stop PET API
2. preserve the damaged/current database
3. restore selected verified backup
4. restore corresponding uploads
5. run integrity check
6. start API
7. run smoke tests
8. verify record counts
9. record recovery event

## Disaster Recovery

Keep at least one backup on a different physical/storage system.

The office PC must not be the only place where the Trust's records exist.

## Recovery Test

A backup is not considered reliable until the team has successfully performed a test restore.
