# PET Deployment & Client Handover

> **Implemented runbook:** [`13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md`](./13_OFFICE_PC_CLOUDFLARE_TUNNEL_GOLIVE.md)
> — office PC + the Trust's own domain via a free Cloudflare Tunnel, including
> the exact commands, verification steps and troubleshooting. This document
> remains the source of truth for the ownership/layout requirements.

## Production Ownership

Production infrastructure belongs to Purvanchal Education Trust.

The developer maintains application source code separately.

## Server

Recommended office machine:

- dedicated Windows PC or Linux mini-PC
- SSD
- 8 GB+ RAM
- UPS where possible
- stable internet
- automatic backup destination

## Installation

Production layout:

\`\`\`text
C:\PET\
  app\
  data\
  uploads\
  backups\
  logs\
\`\`\`

Linux installations can use an equivalent directory layout.

## Environment

Production environment must define:

- DATABASE_PATH
- UPLOAD_DIR
- BACKUP_DIR
- JWT/access-token secret
- refresh/session secret
- HTTPS configuration
- allowed application origin

Never commit the environment file.

## Service

Run the PET API as a system service so it restarts automatically after a machine reboot.

## Network

Preferred private setup:

Employee device
→ VPN
→ PET server
→ HTTPS
→ API

If public access is required:

- use a real domain
- use HTTPS
- configure firewall
- restrict exposed ports
- use rate limiting
- monitor logs

## Employee Onboarding

Main Admin creates employee.

Employee receives secure initial access.

Employee logs in and completes password setup.

No shared employee accounts.

## Backup Handover

Document:

- backup schedule
- backup location
- restore procedure
- person responsible
- emergency contact
- last successful restore test

## Client Handover Checklist

- [ ] Trust owns production PC
- [ ] Trust controls production secrets
- [ ] Main Admin account created
- [ ] Employee accounts created
- [ ] Database path documented
- [ ] Upload path documented
- [ ] Backup schedule enabled
- [ ] Off-site backup configured
- [ ] Restore tested
- [ ] HTTPS/VPN tested
- [ ] Android app installed
- [ ] Admin web access tested
- [ ] Student registration tested
- [ ] Field visit tested
- [ ] Task/chat tested
- [ ] Attendance tested
- [ ] Test/enrollment tested
- [ ] Website form tested
