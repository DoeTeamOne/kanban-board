# Taskboard

A local Kanban task dashboard built with HTML, CSS, vanilla JavaScript, and Node.js. Tasks are stored in PostgreSQL; adding, removing, editing, or changing a task's status saves the updated task list to the database.

## Project Structure

```
kanban-board
├── index.html
├── server.js        # Local web server and PostgreSQL API
├── package.json     # Node.js dependencies
├── css/styles.css
├── js/app.js
└── README.md
```

## Getting Started

To set up and run the Kanban board, follow these steps:

1. Install [Node.js](https://nodejs.org/) and [PostgreSQL](https://www.postgresql.org/) if they are not already installed.
2. Create a PostgreSQL database for the board, for example `taskboard`.
3. Install the Node.js dependency:
   ```sh
   npm install
   ```
4. Set `DATABASE_URL` to the connection string for that database. For example:
   ```sh
   # macOS/Linux
   export DATABASE_URL="postgres://postgres:your-password@localhost:5432/taskboard"

   # Windows PowerShell
   $env:DATABASE_URL = "postgres://postgres:Covid19@localhost:5432/TaskManager"
   ```
5. Start the local server:
   ```sh
   npm start
   ```
6. Open `http://127.0.0.1:4173` in your browser. Keep the terminal running while you use the board.

The server creates the `tasks`, `release_catalog`, and `user_catalog` tables on startup and adds assignment support to existing task tables. If `tasks.json` exists and the database has no tasks, its data is imported once into PostgreSQL. After that, PostgreSQL is the source of truth.

## Features

- Three columns for task management:
  - **To Do**: Tasks that need to be completed.
  - **In Progress**: Tasks that are currently being worked on.
  - **Done**: Completed tasks.

- Drag-and-drop and status menus both update the task's saved status.
- Each task can be assigned to a release from the release selector, making it easy to group work by delivery milestone.
- Maintain the user list in PostgreSQL with **Manage users**, then assign users when creating, editing, or updating tasks. Removing a user automatically unassigns their tasks.
- Filter the board by assignee using the user filter next to the release filter.
- View the task distribution by assignee in the dashboard's **Tasks by user** pie chart.
- Search tasks by name with the search field or `/` shortcut.
- PostgreSQL-backed storage means tasks remain after closing or refreshing the browser.

The board includes a release picker for every task, and the release catalog is maintained in PostgreSQL through the `/api/releases` endpoint. The team user list is maintained through `/api/users`. Use **Manage releases** and **Manage users** in the board to update these lists.

## Technologies Used

- HTML, CSS, and vanilla JavaScript
- Node.js built-in HTTP server
- PostgreSQL via the `pg` Node.js package

## License

This project is open-source and available under the [MIT License](LICENSE).