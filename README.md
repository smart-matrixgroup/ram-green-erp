<<<<<<< HEAD
# Ram Green Solar Energy ERP (React + Firebase)

Modules: Dashboard, Customers, Projects (kW + stages), Inventory (low-stock alerts), Invoices, and per-client budgets.

## Client budget and profit
New customers get the next code (`RG-C001`, `RG-C002`, …) stored as `code`. A client also has a project name, budget (planned cost limit), project value (what the client pays), and project status (Ongoing or Completed).

Expenses pick a client and store `clientId`, `clientCode`, and `clientName`. Older expenses with no client stay as unassigned general costs and are not mixed into a client. Spent, remaining, and profit/loss are calculated from the live customers and expenses lists (`project value − spent`, `budget − spent`), not saved as totals. Open a customer to see that client's budget bar, expenses, and final profit or loss. The dashboard lists every client's profitability and counts projects that are over budget.

## Setup
1. `npm install`
2. Firebase Console: create project → enable **Authentication → Email/Password** (add a user) and **Firestore**.
3. Copy `.env.example` to `.env`, paste your web-app config values.
4. Paste `firestore.rules` into Firestore → Rules.
5. `npm run dev`

## Roles
Delete is admin-only. Make yourself admin: Firestore → create `users/<your-auth-uid>` with field `role: "admin"`. Everyone else = staff.

## GitHub Pages
Pages must publish the built `dist` folder, not the source on `main`. The workflow in `.github/workflows/pages.yml` builds the app and deploys it. Serving `index.html` from the repository root loads `/src/main.jsx`, which the browser cannot run, so the page stays white.

## Demo mode (no Firebase)
Leave `.env` empty/missing: app runs with browser storage. Login: admin@ramgreen.com / admin123.
Add Firebase keys to `.env` later and it switches to Firebase automatically.
=======
# ram-green-erp
☀️ Ram Green Solar Energy ERP: a React + Firebase system for managing clients, projects, inventory, invoices, quotations, purchase orders, expenses, employees and per-client profit/loss tracking.
>>>>>>> d5a94173fcf2a05d5856e7c1c21c3a19424cb579
