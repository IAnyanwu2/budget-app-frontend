# Saavy — Budget App (Frontend)

Concise quick-start for running the frontend locally and demoing changes.

Prerequisites
- Node.js 18+ and npm
- Angular CLI (optional for global) or use the npm scripts
- .NET 10 SDK / backend running at `http://localhost:5231`
- Ollama installed locally for model-generated insights

Quick start (dev)
1. Clone the repo:

   git clone <your-repo-url>
   cd budget-app-frontend

2. Install dependencies:

   npm install

3. Start the Angular dev server (PowerShell):

   npm start

   - Opens at http://localhost:4200 by default.

4. Start the backend and Ollama separately:

    - Start the backend with `bash scripts/start-local-backend.sh`. It loads the whitelisted Plaid/Ollama settings from the ignored root `.env`.

    - Ollama is usually already running as a background service. If not, start it with `ollama serve`. The default model is `mistral:7b`; change it with `Ollama__Model` in `.env`.

Notes
- The app reads/writes per-category budgets and goal to localStorage keys: `categoryBudget` and `budgetGoal`.
- AI requests go through the authenticated backend. If Ollama is unavailable, the app labels deterministic results as offline guidance.
- For production deployment, consider containerizing (Docker) and/or hosting the frontend statically (Netlify/Vercel) while hosting the API and LLM infra separately.

Ollama / Model notes
- The backend calls local Ollama at `http://localhost:11434` by default. Override with `Ollama__BaseUrl` and `Ollama__Model` in the root `.env`.

Local Ollama quick install
1. Install Ollama (https://ollama.ai) on your machine following their docs for your OS.
2. Ensure the Ollama daemon is running and install the configured model if needed: `ollama pull mistral:7b`.

Cloud model option
- Hosted-model support is not configured. AI prompts currently go only to the server-side Ollama URL and model configured in `.env`.

Health checks
- Verify backend: `curl http://localhost:5231/api/health`
- Verify Ollama: `curl http://localhost:11434/api/tags`

Plaid Sandbox verification
- Keep `Plaid__ClientID`, `Plaid__Secret`, and `Plaid__Environment=sandbox` in the ignored root `.env`; do not commit or share the secret.
- Run `bash scripts/verify-plaid-sandbox.sh` as a required integration acceptance gate. It starts the backend in-process, registers and authenticates a test user, requests a Link token, creates a Sandbox public token, then verifies the app's exchange, sync, and user-scoped transaction read endpoints against Plaid Sandbox.
- The automated gate uses Plaid's Sandbox-only public-token endpoint to avoid interactive bank selection. Also click **Connect Bank** in the Angular app with the backend and Sandbox credentials running to verify the hosted Plaid Link widget itself.
- Run deterministic sync regression tests with `dotnet test budget-app-backend.Tests/budget-app-backend.Tests.csproj`.

Ollama verification
- Run `bash scripts/verify-ollama.sh` to test the authenticated AI endpoint against the configured local model using isolated SQLite data.

Test coverage and latest results
- `dotnet test budget-app-backend.Tests/budget-app-backend.Tests.csproj`: 6 deterministic tests passed. Covers Plaid sync import/cursor persistence, duplicate upserts, pending-to-posted replacement, per-user isolation, existing SQLite schema upgrade, and Ollama prompt/model/user-data scoping with fake HTTP responses.
- `bash scripts/verify-plaid-sandbox.sh`: 1 live Plaid Sandbox E2E passed. Starts the ASP.NET app with temporary SQLite, registers/authenticates a test user, creates a Link token, creates/exchanges a Sandbox Item, seeds a Sandbox transaction, syncs it, and reads it through the authenticated transaction API. Requires the Plaid settings in root `.env` and internet access.
- `bash scripts/verify-ollama.sh`: 1 live Ollama E2E passed. Confirms the configured model is installed, starts the app with temporary SQLite, authenticates a test user with seeded transactions, calls `/api/ai-insights`, and validates the JSON result. Requires the local Ollama service/model; inference took around 90 seconds on this macOS M1 machine and will vary with model, quantization, and workload.
- `npm test -- --watch=false --browsers=ChromeHeadless`: 8 Angular component/service tests passed. These use test HTTP/router providers and verify goal calculations; they are not browser-driven application E2E tests.
- `npm run build -- --configuration production`: passed. Angular reports an initial bundle of about 511 KB against the 500 KB warning threshold; this is a warning, not a build failure.

The live Sandbox and Ollama tests use temporary databases and synthetic test users. Their transactions do not appear in the database used by the interactive app, and the tests do not launch a browser or assert rendered UI state.

Manual UI integration check
1. Start the backend with `bash scripts/start-local-backend.sh`; keep the local Ollama service running.
2. Start Angular with `npm start` and open `http://localhost:4200`.
3. Register or log in to a local app account, then choose **Connect Bank** and complete Plaid Link in Sandbox. Plaid test credentials can be used in Link; `user_transactions_dynamic` is useful for transaction testing.
4. After Link completes, the client exchanges the public token and runs an initial sync. **Sync & Refresh** runs Plaid `/sync` again, reloads dashboard totals/recent transactions, and regenerates Ollama insights. Reports reads that user's stored rows for the selected year and month.
5. Confirm the imported transaction is in Recent Transactions, appears in the appropriate month/category in Reports, and the insight panel shows either **Ollama analysis** or **Offline guidance**. Ollama analysis can take about 90 seconds on this machine.

Plaid webhooks and automatic alerts
- Webhook delivery is not implemented yet. The Link token currently has no webhook URL, there is no public webhook receiver, and new bank activity is not automatically synced after the initial/manual sync.
- True update-driven refresh needs a publicly reachable HTTPS webhook endpoint, Plaid webhook verification, processing for `SYNC_UPDATES_AVAILABLE`, and a background sync job using each Item's stored cursor. Plaid Sandbox webhooks can then be fired to verify the path. This is separate from the passing Sandbox API E2E above.
- Spending-deviation alerts are also not implemented. The current AI analysis runs on dashboard load or refresh; it is not a continuous monitor and does not generate push/email alerts.

Build for production

1. Build the app:

   npm run build -- --configuration production

2. Serve the `dist/` output using any static server or integrate into your backend.

Committing & pushing

Run these commands to commit and push your changes (you must have the remote configured and credentials):

   git add .
   git commit -m "Add inline Tools category editor and README"
   git push origin main

If your default branch is `master` or another name, replace `main` with that branch.
