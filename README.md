# SoulMate — Complete Free Matrimonial Website

This version includes a real local backend and responsive UI for PC, tablet and mobile.

## Included
- User registration and login
- Secure password hashing with Node crypto
- HTTP-only session cookies
- Profile creation/editing
- Partner preferences
- Search and filters
- Favorites
- Send/accept/reject interests
- Automatic mutual matches
- Chat after mutual match
- Block and report
- Admin login
- Admin profile approval
- Admin block/unblock
- Admin reports dashboard
- Dark/light mode
- Mobile bottom navigation
- Playful stickers and match animation
- NO payment system at all

## Requirements
Node.js 18+.

## Start
Open this folder in VS Code, then run:

```powershell
npm.cmd install
npm.cmd start
```

Open:

http://localhost:3000

You can also double-click `start.bat` after Node.js is installed.

## Admin login
Email: admin@soulmate.local
Password: Admin@123

The homepage has an **Admin** button. It opens the administrator login directly.

## Demo user logins
Maya:
- Email: maya@soulmate.local
- Password: Password@123

Arjun:
- Email: arjun@soulmate.local
- Password: Password@123

## Admin workflow
1. A new user registers.
2. The user fills in a profile.
3. The profile appears as Pending in Admin.
4. Admin clicks **Approve**.
5. The profile becomes searchable.
6. A user sends an Interest.
7. The other user accepts it.
8. A mutual Match is created.
9. Chat is unlocked.

## Reset local demo data
Delete `data/db.json`, or double-click `reset-demo-data.bat`.

## Important for real public launch
This is a working MVP/learning setup using a local JSON data file so the project is easy to run. Before public deployment, use PostgreSQL/MySQL, HTTPS, secure production secrets, rate limiting, CSRF protection as appropriate, image/object storage, email/SMS verification, backups, audit logging, privacy/terms consent, and proper moderation procedures.


## Photo upload
Profile images can now be selected from the phone/PC. The browser resizes the image and saves it as a data URL in `data/db.json`. This is intentionally simple for the local MVP. For a public site, move images to object storage (e.g. S3/Cloudinary) instead of keeping them in JSON.

## Google sign-in
The Google button is included. To enable real Google sign-in:

1. Create a Google OAuth/Web client ID.
2. Add `http://localhost:3000` as an authorized JavaScript origin for local testing.
3. Start the server with `GOOGLE_CLIENT_ID` set to your client ID.

PowerShell example:

```powershell
$env:GOOGLE_CLIENT_ID="YOUR_CLIENT_ID.apps.googleusercontent.com"
npm.cmd start
```

For an online domain, add that HTTPS origin in Google Cloud too. Google requires a registered client ID/origin for the sign-in flow.
