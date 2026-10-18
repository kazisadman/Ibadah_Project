# Ibadah Dashboard

Tracks daily durood, istighfar and the five prayers. Node.js + Express + MongoDB, with a single-page dashboard.

## Run on your computer
1. Install Node.js 18+.
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` and fill in:
   - `MONGODB_URI`: your MongoDB connection string (username and password go here, only in this file)
   - `APP_PASSWORD`: the password you will type to open the dashboard
4. `npm start`, then open http://localhost:3000

MongoDB Atlas: under Network Access, allow your IP (or 0.0.0.0/0 when hosting). If your password has special characters (@ : / ?), URL-encode them in the URI.

## Open it on your phone (free hosting, e.g. Render)
1. Push this folder to a private GitHub repo (`.env` is git-ignored, so your credentials stay out).
2. On render.com: New > Web Service > pick the repo. Build command `npm install`, start command `npm start`.
3. Add `MONGODB_URI`, `APP_PASSWORD` and `DB_NAME` under Environment.
4. Open the Render URL on your phone and use "Add to Home Screen".

## Notes
- Data lives in the `entries` and `settings` collections of the `ibadah` database.
- Use Export regularly for a JSON backup; Import restores it.
- Use HTTPS (Render provides it) since the password travels in a request header.
