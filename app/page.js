'use client';

import React, { useEffect, useMemo, useState } from 'react';

const CATEGORIES = [
  'Personal',
  'Personal Growth',
  'Home',
  'Work / Production',
  'Drone / Gear',
  'Broadcast',
  'Family',
  'Finance',
];

function LifeHQPage() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Navigation & Filtering State
  const [viewMode, setViewMode] = useState('today'); // 'today' | 'archive'
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'tomorrow' | 'beyond'
  const [categoryFilter, setCategoryFilter] = useState('All Categories');

  // Date Strings
  const [todayStr, setTodayStr] = useState('');
  const [tomorrowStr, setTomorrowStr] = useState('');

  // Add Task Form State
  const [form, setForm] = useState({
    title: '',
    category: 'Personal',
    priority: 'medium',
    due_date: '',
    entry_type: 'task',
  });

  // Inline Edit Form State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    category: 'Personal',
    priority: 'medium',
    due_date: '',
    entry_type: 'task',
  });

  // Initialize Local Dates Once on Mount
  useEffect(() => {
    const now = new Date();
    const tStr = toDateInputValue(now);
    const tmStr = toDateInputValue(addDays(now, 1));
    setTodayStr(tStr);
    setTomorrowStr(tmStr);
    setForm((f) => ({ ...f, due_date: tStr }));
  }, []);

  // Load Tasks from Supabase
  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function supabaseRequest(path, options = {}) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || 'Request failed');
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return null;
  }

  async function loadItems() {
    if (!hasSupabaseConfig) {
      setError('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Sync overdue status via RPC if available
      try {
        await supabaseRequest('/rest/v1/rpc/normalize_overdue', {
          method: 'POST',
          body: JSON.stringify({}),
        });
      } catch {
        // Ignore if RPC doesn't exist yet; client-side deriveStatus handles it
      }

      const data = await supabaseRequest(
        '/rest/v1/tasks?select=id,title,category,priority,due_date,entry_type,status,created_at,completed_at&order=due_date.asc.nullslast,created_at.desc'
      );

      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Failed to load items');
    } finally {
      setLoading(false);
    }
  }

  function deriveStatus(item) {
    if (item.completed_at || item.status === 'completed') return 'completed';
    if (todayStr && item.due_date && item.due_date < todayStr) return 'overdue';
    return 'open';
  }

  const normalizedItems = useMemo(
    () =>
      items.map((i) => ({
        ...i,
        status: deriveStatus(i),
      })),
    [items, todayStr]
  );

  // Dynamic list of all categories present in DB + defaults
  const availableCategories = useMemo(() => {
    const set = new Set(CATEGORIES);
    normalizedItems.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [normalizedItems]);

  // Filtered Open Buckets
  const matchesCategory = (item) =>
    categoryFilter === 'All Categories' || item.category === categoryFilter;

  const dueTodayItems = normalizedItems.filter((i) => {
    if (i.status === 'completed' || !matchesCategory(i)) return false;
    return !i.due_date || i.due_date === todayStr || i.status === 'overdue';
  });

  const dueTomorrowItems = normalizedItems.filter(
    (i) => i.status !== 'completed' && matchesCategory(i) && i.due_date === tomorrowStr
  );

  const beyondTomorrowItems = normalizedItems.filter((i) => {
    if (i.status === 'completed' || !matchesCategory(i)) return false;
    return i.due_date && i.due_date > tomorrowStr;
  });

  // Completed Today vs 14-Day Archive
  const completedTodayItems = normalizedItems.filter((i) => {
    if (i.status !== 'completed' || !matchesCategory(i)) return false;
    if (!i.completed_at) return true;
    return toDateInputValue(i.completed_at) === todayStr;
  });

  const archive14dItems = useMemo(() => {
    if (!todayStr) return [];
    const cutoff = toDateInputValue(addDays(new Date(), -14));
    return normalizedItems
      .filter((i) => {
        if (i.status !== 'completed' || !matchesCategory(i)) return false;
        if (!i.completed_at) return true;
        return toDateInputValue(i.completed_at) >= cutoff;
      })
      .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1));
  }, [normalizedItems, todayStr, categoryFilter]);

  const visibleItems =
    activeTab === 'today'
      ? dueTodayItems
      : activeTab === 'tomorrow'
      ? dueTomorrowItems
      : beyondTomorrowItems;

  // Daily Progress Calculation
  const todayTotalCount = dueTodayItems.length + completedTodayItems.length;
  const todayDoneCount = completedTodayItems.length;
  const todayLeftCount = dueTodayItems.length;
  const progress = todayTotalCount ? Math.round((todayDoneCount / todayTotalCount) * 100) : 0;

  async function addItem(e) {
    e.preventDefault();
    if (!form.title.trim()) return;

    try {
      setSaving(true);
      setError('');

      await supabaseRequest('/rest/v1/tasks', {
        method: 'POST',
        body: JSON.stringify([
          {
            title: form.title.trim(),
            category: form.category || 'Personal',
            priority: form.priority,
            due_date: form.due_date || todayStr || null,
            entry_type: form.entry_type || 'task',
            completed_at: null,
            status: 'open',
          },
        ]),
      });

      setForm((f) => ({
        ...f,
        title: '',
      }));

      await loadItems();
    } catch (e2) {
      setError(e2.message || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({
      title: item.title || '',
      category: item.category || 'Personal',
      priority: item.priority || 'medium',
      due_date: item.due_date || '',
      entry_type: item.entry_type || 'task',
    });
  }

  async function saveEdit(id) {
    try {
      setSaving(true);
      setError('');

      await supabaseRequest(`/rest/v1/tasks?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title.trim(),
          category: editForm.category || null,
          priority: editForm.priority,
          due_date: editForm.due_date || null,
          entry_type: editForm.entry_type,
        }),
      });

      setEditingId(null);
      await loadItems();
    } catch (e) {
      setError(e.message || 'Failed to update item');
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompleted(item) {
    try {
      setSaving(true);
      setError('');

      const isCompleting = item.status !== 'completed';
      await supabaseRequest(`/rest/v1/tasks?id=eq.${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          completed_at: isCompleting ? new Date().toISOString() : null,
          status: isCompleting ? 'completed' : 'open',
        }),
      });

      await loadItems();
    } catch (e) {
      setError(e.message || 'Failed to update task status');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id) {
    try {
      setSaving(true);
      setError('');

      await supabaseRequest(`/rest/v1/tasks?id=eq.${id}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });

      await loadItems();
    } catch (e) {
      setError(e.message || 'Failed to delete item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-emerald-400">
              Rich&apos;s Life HQ
            </h1>
            <p className="mt-1 text-sm italic text-emerald-500/80">
              &ldquo;Focus on progress, not perfection.&rdquo;
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setViewMode('today')}
              className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
                viewMode === 'today'
                  ? 'bg-emerald-500 text-black'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setViewMode('archive')}
              className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
                viewMode === 'archive'
                  ? 'bg-emerald-500 text-black'
                  : 'border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Archive (14d)
            </button>
          </div>
        </header>

        {viewMode === 'archive' ? (
          /* 14-Day Archive View */
          <section className="rounded-xl border border-purple-900/60 bg-purple-950/15 p-5">
            <h2 className="mb-4 text-base font-semibold text-purple-200">
              Completed Archive (Last 14 Days)
            </h2>
            {archive14dItems.length === 0 ? (
              <p className="text-sm text-zinc-400">No archived tasks in the last 14 days.</p>
            ) : (
              <div className="space-y-2.5">
                {archive14dItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-purple-900/40 bg-zinc-950/80 p-3"
                  >
                    <div>
                      <p className="font-medium text-zinc-200 line-through">{item.title}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-400">
                        <span>{item.category || 'Personal'}</span>
                        <span>•</span>
                        <span>Completed: {formatDateTime(item.completed_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleCompleted(item)}
                      className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                    >
                      Reopen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* Daily Progress Card */}
            <section className="mb-5 rounded-xl border border-emerald-950 bg-zinc-950/90 p-5 shadow-[0_0_25px_rgba(16,185,129,0.05)]">
              <div className="flex items-center gap-5">
                <ProgressRing
                  percent={progress}
                  done={todayDoneCount}
                  total={todayTotalCount}
                />
                <div>
                  <p className="text-xs font-medium text-emerald-400">
                    Daily Progress (Due Today)
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-white">
                    {todayDoneCount} done, {todayLeftCount} left
                  </p>
                </div>
              </div>
            </section>

            {/* Single-Row Add Task Bar */}
            <section className="mb-5 rounded-xl border border-emerald-950 bg-zinc-950/90 p-3.5">
              <form
                onSubmit={addItem}
                className="grid grid-cols-1 gap-2.5 sm:grid-cols-12"
              >
                <input
                  className="rounded-md border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-500 sm:col-span-4"
                  placeholder="Add a task..."
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
                <select
                  className="rounded-md border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 sm:col-span-3"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 sm:col-span-2"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <input
                  type="date"
                  className="rounded-md border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 sm:col-span-2"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
                <button
                  disabled={saving}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50 sm:col-span-1"
                  type="submit"
                >
                  {saving ? '...' : 'Add'}
                </button>
              </form>
            </section>

            {/* Tabs & Category Filter Row */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <TabButton
                  active={activeTab === 'today'}
                  onClick={() => setActiveTab('today')}
                  label="Due Today"
                />
                <TabButton
                  active={activeTab === 'tomorrow'}
                  onClick={() => setActiveTab('tomorrow')}
                  label="Due Tomorrow"
                />
                <TabButton
                  active={activeTab === 'beyond'}
                  onClick={() => setActiveTab('beyond')}
                  label="Beyond Tomorrow"
                />
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-emerald-500">Filter:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500"
                >
                  <option value="All Categories">All Categories</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Open Tasks Container */}
            <section className="mb-6 rounded-xl border border-emerald-950 bg-zinc-950/90">
              <div className="border-b border-emerald-950/80 px-4 py-3">
                <h2 className="text-sm font-semibold text-emerald-400">Open Tasks</h2>
              </div>

              {loading ? (
                <p className="p-4 text-sm text-zinc-400">Loading tasks...</p>
              ) : visibleItems.length === 0 ? (
                <p className="p-4 text-sm text-zinc-400">No open tasks in this view.</p>
              ) : (
                <div className="divide-y divide-emerald-950/60">
                  {visibleItems.map((item) => {
                    const isOverdue = item.status === 'overdue';

                    return (
                      <div key={item.id} className="p-4">
                        {editingId === item.id ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                            <input
                              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm sm:col-span-2"
                              value={editForm.title}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, title: e.target.value }))
                              }
                            />
                            <select
                              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
                              value={editForm.category}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, category: e.target.value }))
                              }
                            >
                              {availableCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                            <select
                              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
                              value={editForm.priority}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, priority: e.target.value }))
                              }
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                            <input
                              type="date"
                              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
                              value={editForm.due_date || ''}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, due_date: e.target.value }))
                              }
                            />
                            <div className="flex gap-2 sm:col-span-5">
                              <button
                                onClick={() => saveEdit(item.id)}
                                className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-black hover:bg-emerald-400"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={item.status === 'completed'}
                                onChange={() => toggleCompleted(item)}
                                className="mt-1 h-4 w-4 cursor-pointer rounded border-zinc-700 accent-emerald-500"
                              />
                              <div>
                                <p className="font-medium text-zinc-100">{item.title}</p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="rounded border border-emerald-800/80 bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300">
                                    {item.category || 'Personal'}
                                  </span>
                                  <PriorityBadge priority={item.priority} />
                                  <span
                                    className={`rounded border px-2 py-0.5 text-xs ${
                                      isOverdue
                                        ? 'border-red-800 bg-red-950/60 text-red-300'
                                        : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                                    }`}
                                  >
                                    Due: {item.due_date || 'No date'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 gap-1.5">
                              <button
                                onClick={() => startEdit(item)}
                                className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteItem(item.id)}
                                className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:border-red-800 hover:bg-red-950/50 hover:text-red-200"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Completed Today Section */}
            <section className="mb-6 rounded-xl border border-purple-900/70 bg-purple-950/15">
              <div className="border-b border-purple-900/50 px-4 py-3">
                <h2 className="text-sm font-semibold text-purple-200">Completed Today</h2>
              </div>
              <div className="p-4">
                {completedTodayItems.length === 0 ? (
                  <p className="text-sm text-zinc-400">No completed tasks yet.</p>
                ) : (
                  <div className="space-y-2">
                    {completedTodayItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border border-purple-900/40 bg-purple-950/20 px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked
                            onChange={() => toggleCompleted(item)}
                            className="h-4 w-4 cursor-pointer accent-purple-500"
                          />
                          <span className="text-sm text-purple-200 line-through">
                            {item.title}
                          </span>
                        </div>
                        <span className="text-xs text-purple-300/70">
                          {item.category || 'Personal'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {error ? (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <footer className="border-t border-zinc-900 pt-4 text-center text-xs text-emerald-500/80">
          Created by Rich Ruiz
        </footer>
      </div>
    </main>
  );
}

function TabButton({ active = false, onClick = () => {}, label = '' }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? 'bg-emerald-500 text-black font-semibold'
          : 'border border-zinc-800 bg-zinc-900 text-emerald-400 hover:bg-zinc-800'
      }`}
      type="button"
    >
      {label}
    </button>
  );
}

function PriorityBadge({ priority = 'medium' }) {
  const styles = {
    high: 'border-red-900/80 bg-red-950/60 text-red-300',
    medium: 'border-amber-900/80 bg-amber-950/60 text-amber-300',
    low: 'border-zinc-700 bg-zinc-800 text-zinc-300',
  };
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs ${
        styles[priority] || styles.medium
      }`}
    >
      {capitalize(priority)}
    </span>
  );
}

function ProgressRing({ percent = 0, done = 0, total = 0 }) {
  const radius = 38;
  const stroke = 6;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="shrink-0">
        <circle
          stroke="#18181b"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="#10b981"
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          transform={`rotate(-90 ${radius} ${radius})`}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-sm font-bold text-emerald-400">{percent}%</span>
        <span className="text-[10px] text-emerald-500/80">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

function toDateInputValue(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}

export default LifeHQPage;