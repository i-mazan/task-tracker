(function (root) {
'use strict';
const copy = value => JSON.parse(JSON.stringify(value));
const key = row => JSON.stringify([row.kind, row.id]);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
class SyncStore {
  constructor(storage, userId, uuid = () => crypto.randomUUID()) {
    this.storage = storage;
    this.storageKey = 'taskflow.account.v1.' + userId;
    this.uuid = uuid;
    const saved = storage.getItem(this.storageKey);
    this.state = saved ? JSON.parse(saved) : {rows:{}, queue:[], migrated:false};
    this.state.cleanup ||= [];
  }
  persist() { this.storage.setItem(this.storageKey, JSON.stringify(this.state)); }
  visibleRows() {
    const rows = copy(this.state.rows);
    for (const batch of this.state.queue) for (const change of batch.changes) {
      rows[key(change)] = {...change, version:change.base + 1};
    }
    return rows;
  }
  board() {
    const rows = Object.values(this.visibleRows()).filter(row => !row.deleted);
    rows.sort((a,b) => a.position - b.position || a.id.localeCompare(b.id));
    return Object.fromEntries(['tasks','ideas'].map(kind => [kind,rows.filter(row => row.kind === kind).map(row => ({...row.payload,id:row.id}))]));
  }
  capture(board, before = this.visibleRows()) {
    const desired = {};
    for (const kind of ['tasks','ideas']) board[kind].forEach((payload, position) => {
      const row = {kind,id:String(payload.id),payload:copy(payload),position,deleted:false};
      desired[key(row)] = row;
    });
    const changes = [];
    for (const [id,row] of Object.entries(desired)) {
      const old = before[id];
      if (!old || old.deleted || old.position !== row.position || !same(old.payload,row.payload)) changes.push({...row,base:old?.version || 0});
    }
    for (const [id,row] of Object.entries(before)) if (!row.deleted && !desired[id]) {
      changes.push({kind:row.kind,id:row.id,payload:row.payload,position:row.position,deleted:true,base:row.version});
    }
    if (!changes.length) return;
    const previous = copy(this.state);
    this.state.queue.push({id:this.uuid(),changes});
    try { this.persist(); } catch (error) { this.state = previous; throw error; }
    return changes;
  }
  applyRows(rows) {
    for (const row of rows) {
      const old = this.state.rows[key(row)];
      if (!old || row.version >= old.version) this.state.rows[key(row)] = copy(row);
    }
  }
  merge(rows) {
    const previous = copy(this.state);
    try { this.applyRows(rows); this.persist(); }
    catch (error) { this.state = previous; throw error; }
  }
  acknowledge(id, rows) {
    if (this.state.queue[0]?.id !== id) return;
    const previous = copy(this.state);
    try { this.applyRows(rows); this.state.queue.shift(); this.state.cleanup.push(id); this.persist(); }
    catch (error) { this.state = previous; throw error; }
  }
  cleanupComplete(ids) {
    const previous = copy(this.state);
    const completed = new Set(ids);
    try { this.state.cleanup = this.state.cleanup.filter(id => !completed.has(id)); this.persist(); }
    catch (error) { this.state = previous; throw error; }
  }
  resolve(conflicts, keepLocal) {
    const batch = this.state.queue[0];
    if (!batch) return;
    const previous = copy(this.state);
    try {
    for (const conflict of conflicts) {
      const id = key(conflict), server = conflict.server;
      if (server) this.state.rows[id] = copy(server); else delete this.state.rows[id];
      if (keepLocal) {
        // Rebase this and later local operations; a deleted item becomes a new item.
        let base = server?.deleted ? 0 : server?.version || 0;
        let replacement = server?.deleted ? this.uuid() : conflict.id;
        for (const pending of this.state.queue) for (const change of pending.changes) if (key(change) === id) {
          change.id = replacement;
          change.payload.id = replacement;
          change.base = base;
          base = change.base + 1;
        }
      } else {
        for (const pending of this.state.queue) pending.changes = pending.changes.filter(change => key(change) !== id);
      }
    }
    this.state.queue = this.state.queue.filter(batch => batch.changes.length);
    for (const pending of this.state.queue) pending.id = this.uuid();
    this.persist();
    } catch (error) { this.state = previous; throw error; }
  }
}
root.TaskflowSyncStore = SyncStore;
if (typeof module !== 'undefined') module.exports = SyncStore;
})(typeof window === 'undefined' ? globalThis : window);
