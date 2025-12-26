# Saavy — Budget App (Frontend)

Concise quick-start for running the frontend locally and demoing changes.

Prerequisites
- Node.js 18+ and npm
- Angular CLI (optional for global) or use the npm scripts
- (Optional) .NET SDK / backend running at `http://localhost:5231` — the frontend expects the API there
- (Optional) Ollama proxy (local) if you use local LLM proxy: `server/ollama-proxy.js`

Quick start (dev)
1. Clone the repo:

   git clone <your-repo-url>
   cd budget-app-frontend

2. Install dependencies:

   npm install

3. Start the Angular dev server (PowerShell):

   npm start

   - Opens at http://localhost:4200 by default.

4. Start backend and proxy (if applicable) — these are separate processes and must run for full functionality:

   - Start backend (ASP.NET Core) so transactions API is available at `http://localhost:5231`.
     Example (from backend repo):

     dotnet run --project path/to/backend/Project.csproj

   - Start the Ollama proxy (if you use the local LLM proxy):

     node server/ollama-proxy.js

Notes
- The app reads/writes per-category budgets and goal to localStorage keys: `categoryBudget` and `budgetGoal`.
- If the backend AI endpoint is unavailable (404), the frontend will try `http://localhost:5232` (local Ollama proxy) as a fallback.
- For production deployment, consider containerizing (Docker) and/or hosting the frontend statically (Netlify/Vercel) while hosting the API and LLM infra separately.

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

If you want, I can prepare a `Dockerfile`, `docker-compose.yml`, or GitHub Actions workflow next.

---
Concise: this README focuses on how to run the app locally for demoing. Tell me if you want a one-command script or CI/CD next.
# BudgetAppFrontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.16.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
