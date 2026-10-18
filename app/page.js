'use client';

import React, { useEffect, useMemo, useState } from 'react';

function LifeHQPage() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('today'); // today | tomorrow | beyond
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    category: '',
    priority: 'medium',
    due_date: '',
    entry_type: 'task',
  });

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    title: '',
    category: '',
    priority: 'medium',
    due_date: '',
    entry_type: 'task',
  });

  const hasSupabaseConfig = SUPABASE_URL && SUPABASE_ANON_KEY;

  const [todayStr, setTodayStr] = useState("");
  const [tomorrowStr, setTomorrowStr] = useState("");

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

      // Keep overdue status in sync each day
      await supabaseRequest('/rest/v1/rpc/normalize_overdue', {
        method: 'POST',
        body: JSON.stringify({}),
      });

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
    if (item.completed_at) return 'completed';
    if (item.due_date && item.due_date < todayStr) return 'overdue';
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

  const dueTodayItems = normalizedItems.filter((i) => {
    if (i.status === 'completed') return false;
    return i.due_date === todayStr || i.status === 'overdue';
  });

  const dueTomorrowItems = normalizedItems.filter(
    (i) => i.status !== 'completed' && i.due_date === tomorrowStr
  );

  const beyondTomorrowItems = normalizedItems.filter((i) => {
    if (i.status === 'completed') return false;
    if (!i.due_date) return false;
    return i.due_date > tomorrowStr;
  });

  const completedItems = normalizedItems.filter((i) => i.status === 'completed');

  const visibleItems =
    activeTab === 'today'
      ? dueTodayItems
      : activeTab === 'tomorrow'
      ? dueTomorrowItems
      : beyondTomorrowItems;

  const todayAll = normalizedItems.filter(
    (i) => i.due_date === todayStr || (i.status === 'overdue' && !i.completed_at)
  );
  const todayCompleted = todayAll.filter((i) => i.status === 'completed').length;
  const progress = todayAll.length ? Math.round((todayCompleted / todayAll.length) * 100) : 0;

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
            category: form.category.trim() || null,
            priority: form.priority,
            due_date: form.due_date || null,
            entry_type: form.entry_type,
            completed_at: null,
            status: 'open',
          },
        ]),
      });

      setForm({
        title: '',
        category: '',
        priority: 'medium',
        due_date: '',
        entry_type: 'task',
      });

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
      category: item.category || '',
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
          category: editForm.category.trim() || null,
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

  async function markCompleted(item) {
    try {
      setSaving(true);
      setError('');

      await supabaseRequest(`/rest/v1/tasks?id=eq.${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          completed_at: new Date().toISOString(),
          status: 'completed',
        }),
      });

      await loadItems();
    } catch (e) {
      setError(e.message || 'Failed to mark completed');
    } finally {
      setSaving(false);
    }
  }

  async function reopenItem(item) {
    try {
      setSaving(true);
      setError('');

      await supabaseRequest(`/rest/v1/tasks?id=eq.${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          completed_at: null,
          status: 'open',
        }),
      });

      await loadItems();
    } catch (e) {
      setError(e.message || 'Failed to reopen item');
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
  useEffect(() => {
    const now = new Date();
    setTodayStr(toDateInputValue(now));
    setTomorrowStr(toDateInputValue(addDays(now, 1)));
  }, []);


  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Rich&apos;s Life HQ</h1>
          <p className="mt-2 text-slate-300">
            “Small daily discipline compounds into a life you’re proud of.”
          </p>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">Add Entry</h2>
            <form onSubmit={addItem} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none ring-purple-500 focus:ring"
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
              <input
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none ring-purple-500 focus:ring"
                placeholder="Category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
              <select
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none ring-purple-500 focus:ring"
                value={form.entry_type}
                onChange={(e) => setForm((f) => ({ ...f, entry_type: e.target.value }))}
              >
                <option value="task">Task</option>
                <option value="event">Event</option>
                <option value="reminder">Reminder</option>
                <option value="appointment">Appointment</option>
              </select>
              <select
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none ring-purple-500 focus:ring"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="low">Priority: Low</option>
                <option value="medium">Priority: Medium</option>
                <option value="high">Priority: High</option>
              </select>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none ring-purple-500 focus:ring sm:col-span-1"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
              <button
                disabled={saving}
                className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition hover:bg-purple-500 disabled:opacity-50"
                type="submit"
              >
                {saving ? 'Saving...' : 'Add'}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-lg font-semibold">Today Progress</h2>
            <div className="flex items-center gap-4">
              <ProgressRing percent={progress} />
              <div>
                <p className="text-2xl font-bold">{progress}%</p>
                <p className="text-sm text-slate-300">
                  {todayCompleted}/{todayAll.length} completed
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <TabButton
              active={activeTab === 'today'}
              onClick={() => setActiveTab('today')}
              label="Due Today"
              count={dueTodayItems.length}
            />
            <TabButton
              active={activeTab === 'tomorrow'}
              onClick={() => setActiveTab('tomorrow')}
              label="Due Tomorrow"
              count={dueTomorrowItems.length}
            />
            <TabButton
              active={activeTab === 'beyond'}
              onClick={() => setActiveTab('beyond')}
              label="Beyond Tomorrow"
              count={beyondTomorrowItems.length}
            />
          </div>

          {loading ? (
            <p className="text-slate-300">Loading...</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-slate-300">No entries in this view.</p>
          ) : (
            <div className="space-y-3">
              {visibleItems.map((item) => {
                const isOverdue = item.status === 'overdue';
                const cardClass = isOverdue
                  ? 'border-red-700 bg-red-950/30'
                  : 'border-slate-800 bg-slate-950';
  useEffect(() => {
    const now = new Date();
    setTodayStr(toDateInputValue(now));
    setTomorrowStr(toDateInputValue(addDays(now, 1)));
  }, []);


                return (
                  <div key={item.id} className={`rounded-lg border p-3 ${cardClass}`}>
                    {editingId === item.id ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
                          value={editForm.title}
                          onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                        />
                        <input
                          className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
                          value={editForm.category}
                          onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                          placeholder="Category"
                        />
                        <select
                          className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
                          value={editForm.entry_type}
                          onChange={(e) => setEditForm((f) => ({ ...f, entry_type: e.target.value }))}
                        >
                          <option value="task">Task</option>
                          <option value="event">Event</option>
                          <option value="reminder">Reminder</option>
                          <option value="appointment">Appointment</option>
                        </select>
                        <select
                          className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
                          value={editForm.priority}
                          onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <input
                          type="date"
                          className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
                          value={editForm.due_date || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(item.id)}
                            className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded bg-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold">{item.title}</p>
                          <p className="text-sm text-slate-300">
                            {capitalize(item.entry_type)} • {item.category || 'No category'} •{' '}
                            {capitalize(item.priority)} priority • Due: {item.due_date || 'No date'}
                          </p>
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.status !== 'completed' ? (
                            <button
                              onClick={() => markCompleted(item)}
                              className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500"
                            >
                              Complete
                            </button>
                          ) : (
                            <button
                              onClick={() => reopenItem(item)}
                              className="rounded bg-amber-600 px-3 py-2 text-sm font-medium hover:bg-amber-500"
                            >
                              Reopen
                            </button>
                          )}
                          <button
                            onClick={() => startEdit(item)}
                            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="rounded bg-rose-700 px-3 py-2 text-sm font-medium hover:bg-rose-600"
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

        <section className="mb-6 rounded-xl border border-purple-800 bg-purple-950/30 p-4">
          <h2 className="mb-3 text-lg font-semibold text-purple-100">Completed</h2>
          {completedItems.length === 0 ? (
            <p className="text-purple-200/80">No completed entries yet.</p>
          ) : (
            <div className="space-y-2">
              {completedItems
                .slice()
                .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))
                .map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-purple-800 bg-purple-900/30 p-3"
                  >
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-purple-200/90">
                      {capitalize(item.entry_type)} • {item.category || 'No category'} • Completed:{' '}
                      {formatDateTime(item.completed_at)}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </section>

        {error ? (
          <div className="mb-4 rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-rose-100">
            {error}
          </div>
        ) : null}

        <footer className="pt-2 text-center text-sm text-slate-400">Created by Rich Ruiz</footer>
      </div>
    </main>
  );
}

function TabButton({ active = false, onClick = () => {}, label = '', count = 0 }) {
  useEffect(() => {
    const now = new Date();
    setTodayStr(toDateInputValue(now));
    setTomorrowStr(toDateInputValue(addDays(now, 1)));
  }, []);

  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
      }`}
      type="button"
    >
      {label} ({count})
    </button>
  );
}

function StatusBadge({ status = 'open' }) {
  const base = 'inline-block rounded-full px-2 py-1 text-xs font-semibold mt-2';
  if (status === 'completed') {
    return <span className={`${base} bg-emerald-900 text-emerald-200`}>Completed</span>;
  }
  if (status === 'overdue') {
    return <span className={`${base} bg-red-900 text-red-200`}>Overdue</span>;
  }
  return <span className={`${base} bg-slate-700 text-slate-200`}>Open</span>;
}

function ProgressRing({ percent = 0 }) {
  const radius = 30;
  const stroke = 8;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;
  useEffect(() => {
    const now = new Date();
    setTodayStr(toDateInputValue(now));
    setTomorrowStr(toDateInputValue(addDays(now, 1)));
  }, []);


  return (
    <svg height={radius * 2} width={radius * 2} className="shrink-0">
      <circle
        stroke="#334155"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke="#a855f7"
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

