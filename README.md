# ARcodm Panel + Subscription (Render)

One Render web service serves the panel, API, and `/sub/:id` subscription endpoint. PostgreSQL stores subscriptions persistently.

## Deploy
1. Push this folder to GitHub.
2. Create a Render Blueprint from `render.yaml` (or create the web service and Postgres manually).
3. Set `ADMIN_KEY` to a strong secret.
4. If the Render URL differs from the value in `PUBLIC_BASE_URL`, change that variable to the real URL.
5. Open `/` for the panel.

The panel is configured to use `window.location.origin`, so panel and subscription use the same host.
