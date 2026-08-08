/**
 * cPanel/Passenger-compatible entry point.
 *
 * GoDaddy's "Setup Node.js App" (Phusion Passenger) expects a plain Node.js
 * script as the "Application startup file" — it does not run `npm start`
 * or `next start` directly. Passenger injects the port to listen on via
 * `process.env.PORT`; this wraps Next.js's programmatic server API so it
 * listens there instead of the default 3000.
 *
 * This is only used on Passenger-based hosting (see DEPLOYMENT_GUIDE.md).
 * Local development and any non-Passenger host should keep using
 * `npm run dev` / `npm run build` + `npm run start` as normal — this file
 * changes nothing about those.
 */
const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`Seera Sales & Distribution OS server listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
