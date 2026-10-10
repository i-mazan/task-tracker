# TaskFlow PWA

A standalone, offline-friendly task board with Supabase accounts, per-user cloud sync, a durable local queue, and JSON backup/restore.

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to configure Supabase and fill in `supabase-config.js`. No build step or custom server is required.

## Using the board

- **Add a task**: type in the input at the top of **All tasks**, pick Today / This week / Later, then press **Add task**.
- **Edit a task**: double-click anywhere on a task's card (not just its text) to make the text editable. Press **Enter** or click away to save, **Esc** to cancel.
- **Set a specific deadline**: click the small 📅 icon on a task to open a date picker.
- **Complete or bucket a task**: use the ✓ (complete) or × (move to Bucket) buttons on the card.
- **Move a task between Today / This week / Later**:
  - **Desktop**: click and drag a card into another column.
  - **Mobile**: press and hold a card briefly (about a third of a second) until it lifts, then drag it into another column. A quick tap without holding opens it for editing instead, and a normal swipe still scrolls the page.
- **Brain dump**: capture loose ideas one per line, then drag (press-and-hold-drag on mobile) an idea onto the Today / This week / Later summary column to turn it into a task.

## Backups and migration

The **Export** and **Import** buttons live at the bottom of the sidebar, under the navigation — always available, not tied to any single page. **Export** downloads tasks and Brain dump ideas as a JSON file. **Import** restores from that file and **replaces** existing tasks and ideas after a confirmation prompt. Download a backup first if you need to keep the current data.

After signing in, changes are saved to an account-specific localStorage cache and queue, then synchronized with Supabase. Live changes from other devices arrive through Supabase Realtime. Conflicts require a version choice; pending local changes are never silently replaced.

Offline use requires a previous online visit and login. Keep the app open to synchronize. Only one tab per browser profile is active at a time. Clearing site data can lose unsynced changes; use Export for backups.

Run synchronization logic tests with `node tests/sync-store.test.cjs`.
