# PET Self-Hosted Architecture

## Goal

Run PET for approximately 30 employees without making a cloud database the primary dependency.

## Architecture

\`\`\`text
                    PET USERS
                       |
          +------------+------------+
          |                         |
      Main Admin               Employees
      Web/Desktop             Android/PWA
          |                         |
          +------------+------------+
                       |
                     HTTPS
                       |
                PET Express API
                       |
              JWT + Permissions
                       |
                Repository Layer
                       |
                 SQLite / WAL
                       |
                PET Office PC
          +------------+------------+
          |                         |
       pet.db                    uploads/
          |                         |
          +------------+------------+
                       |
                    backups/
\`\`\`

## Production Machine

Recommended:

- Windows 11 Pro or Linux
- SSD
- 8 GB+ RAM
- reliable power
- UPS if possible
- reliable internet
- automatic OS updates
- restricted local user accounts

A small dedicated mini-PC is preferable to an employee's everyday workstation.

## Network

Preferred private deployment:

Employee device
→ VPN
→ PET office PC
→ HTTPS API

A public HTTPS deployment can be used if VPN access is unsuitable.

Never expose the SQLite file itself over the network.

## Application Components

- React frontend
- Capacitor Android app
- Node.js API
- Express
- better-sqlite3
- JWT authentication
- rotating refresh tokens
- filesystem storage
- automated backup worker/script

## Data Ownership

The Trust controls:

- production computer
- database
- uploads
- backups
- environment secrets
- domain/VPN account where applicable

The Git repository contains application source code, not production records.

## Failure Model

If the server PC is unavailable:

- employees cannot synchronize new server-side operations
- offline-capable operations remain queued on devices
- service resumes when the server returns

Backups must make server hardware failure recoverable.

## Scaling Boundary

This architecture is intended for a small internal deployment.

If PET later grows substantially or requires many concurrent users across many offices, migrate the repository/data layer to PostgreSQL without changing the frontend business APIs.
