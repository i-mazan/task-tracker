# TaskFlow PWA

A standalone, offline-friendly task board with browser-local storage and JSON backup/restore.

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

The browser stores data locally via `localStorage`; no account, cloud sync or automatic external backup is provided. Clearing site data or switching devices can lose data unless you exported a backup.
