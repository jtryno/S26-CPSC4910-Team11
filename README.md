# Good Driver Incentive Program
## Senior Computing Practicum | Spring 2026

I am using this branch to continue work on this project after the project was due for fun.

## What I changed from main

### Email Integration (Resend)
- 2FA codes and password reset links are now sent by email instead of being returned in the API response
- Using Resend with a verified custom domain (puttininmile.com)
- If the email fails to send, the code/token gets invalidated immediately so it can't be used

### Security Fixes
- Password reset tokens are now hashed with SHA-256 before being stored in the DB (same as 2FA codes were already doing)
- Password reset URL no longer falls back to the request Origin header. APP_BASE_URL is required in production so an attacker can't inject their own domain into the reset email
- Added input validation on the reset token and 2FA code fields so bad requests get rejected before hitting the database

### Deployment
- Set up an AWS EC2 instance (t3.micro) to host the app
- Domain pointed to the instance through Cloudflare (puttininmile.com)
- GitHub Actions deploys automatically on push using AWS SSM instead of SSH so port 22 doesn't need to be open
- Aiven MySQL for the database with SSL

## Environment Variables
See `.env.example` for the full list. You'll need:
- `RESEND_API_KEY` — get one from resend.com
- `RESEND_FROM` — must be an address on a domain you've verified in Resend
- `APP_BASE_URL` — the full URL of the frontend (e.g. https://puttininmile.com)
- DB credentials for your MySQL instance