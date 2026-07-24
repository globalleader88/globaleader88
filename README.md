# 🚀 Command Center

**A personal business operations dashboard — one place to keep up with everything running in your business.**

Command Center gives a solo founder or small-business owner a single screen for the things that
actually run the operation: your clients and leads, active projects, the tasks due this week, the
money coming in (and the money you're still owed), and the goals you're working toward.

It runs **100% in the browser** — no build step, no server, no API keys, no accounts. Data is saved
locally in your browser (`localStorage`) and can be exported/imported as JSON.

---

## What's inside

| Tab | What it does for you |
| --- | --- |
| **Overview** | The morning glance — recurring revenue, outstanding & overdue cash, open projects, and tasks due. A **Needs Attention** feed surfaces overdue invoices, blocked projects, and late tasks, plus a 7-day focus list and live project-progress bars. |
| **Clients** | Every client and lead with status (Lead → Active → Paused → Churned), monthly value, start date, and how much open work each has. |
| **Projects** | Card view of all projects with a live progress bar, budget, deadline countdown, and status — sorted so blocked and urgent work floats to the top. |
| **Tasks** | A drag-and-drop board (To Do → In Progress → Done). Each card shows its project and priority, with a deadline countdown. |
| **Finances** | Invoices with status (Draft / Sent / Paid / Overdue) plus KPIs for collected, outstanding, overdue, and recurring revenue. |
| **Goals** | Track business goals (revenue, client count, cash reserve, anything) as progress toward a target with a deadline. |
| **Playbook** | A short set of operating principles for running a healthy small business, mapped to the tabs above. |

Everything is editable in place: click any client, project, task, invoice, or goal to edit or delete
it, and use the **＋ New** button (top right) to create anything.

---

## Getting started

Just open `index.html` in any modern browser:

```bash
# from the project root
open index.html          # macOS
xdg-open index.html      # Linux
# or serve it:
python3 -m http.server 8000   # then visit http://localhost:8000
```

The app loads with a realistic sample dataset so you can explore immediately. Use **Reset demo** in
the sidebar to restore it at any time.

## Usage tips

- **Create anything:** click **＋ New** (top right) and pick a type.
- **Move a task:** drag its card between columns on the **Tasks** board.
- **Edit anything:** click a card or a table row to open its editor.
- **Search:** the top-bar search filters clients, projects, tasks, and invoices on the active tab.
- **Back up / move machines:** **Export** downloads a JSON file; **Import** restores it.

## Project structure

```
index.html        # markup + generic entity modal
css/styles.css    # styling (light/dark aware, responsive)
js/data.js        # seed dataset + playbook content
js/app.js         # state, views, CRUD, drag-and-drop, persistence
```

## Tech & privacy

- Vanilla HTML/CSS/JavaScript — zero dependencies.
- All data stays in your browser's `localStorage`; nothing is transmitted anywhere.
- This is an organizational aid — always confirm figures against your accounting records of truth.
