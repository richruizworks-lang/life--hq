'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = "lifehq:tasks:v1";

function safeLoadTasks() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysToKey(key, days) {
  const base = parseDateKey(key);
  base.setDate(base.getDate() + days);
  return localDateKey(base);
}

function fourteenDaysAgoISO() {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
}

function quoteForDay(dayKey) {
  const quotes = [
    'Small wins stack into big victories.',
    'Discipline beats motivation when motivation fades.',
    'Do it tired. Do it messy. Just do it.',
    'Momentum is built one completed task at a time.',
    'Focus on progress, not perfection.',
    'Your future is hidden in your daily routine.',
    'Consistency is the real superpower.',
    'Start where you are. Use what you have.',
    'Hard days build strong habits.',
    'The goal is not to feel good first — act first.',
  ];
  const seed = (dayKey || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return quotes[seed % quotes.length];
}

export default function Page() {
  const [tab, setTab] = useState('today');
  const [dueTab, setDueTab] = useState('today');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [currentDay, setCurrentDay] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newCategory, setNewCategory] = useState('Personal');
  const [newPriority, setNewPriority] = useState('Medium');
  const [newDueDate, setNewDueDate] = useState('');

  const [tasks, setTasks] = useState(() => safeLoadTasks());
  const [archiveTasks, setArchiveTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editCategory, setEditCategory] = useState('Personal');
  const [editPriority, setEditPriority] = useState('Medium');
  const [editDueDate, setEditDueDate] = useState('');

  // IMPORTANT: no new Date() in render path
  const todayKey = currentDay;
  const tomorrowKey = currentDay ? addDaysToKey(currentDay, 1) : '';

  async function runRollover() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const { error } = await supabase.rpc('archive_rollover', { p_tz: tz });
    if (error) throw error;
  }

  async function loadTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .in('status', ['open', 'done'])
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    setTasks(data || []);
  }

  async function loadArchive() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'archived')
      .gte('archived_at', fourteenDaysAgoISO())
      .order('archived_at', { ascending: false });

    if (error) throw error;
    setArchiveTasks(data || []);
  }

  async function refreshAll() {
    setError(null);
    try {
      await runRollover();
      await Promise.all([loadTasks(), loadArchive()]);
    } catch (e) {
      setError(e?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const key = localDateKey(new Date());
    setCurrentDay(key);
    setNewDueDate(key);
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentDay) return;

    const timer = setInterval(() => {
      const nowDay = localDateKey(new Date());
      if (nowDay !== currentDay) {
        setCurrentDay(nowDay);
        setNewDueDate(nowDay);
        refreshAll();
      }
    }, 60_000);
  useEffect(() => {
    try {
      const data = typeof entries !== "undefined"
        ? entries
        : (typeof tasks !== "undefined" ? tasks : (typeof items !== "undefined" ? items : []));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, [typeof entries !== "undefined" ? entries : (typeof tasks !== "undefined" ? tasks : items)]);



    return () => clearInterval(timer);
  }, [currentDay]);

  function bucketForDueDate(dueDate) {
    if (!todayKey || !tomorrowKey) return 'today';
    if (dueDate === todayKey) return 'today';
    if (dueDate === tomorrowKey) return 'tomorrow';
    if (dueDate > tomorrowKey) return 'later';
    return 'today';
  }

  const openTasks = useMemo(() => tasks.filter((t) => t.status === 'open'), [tasks]);

  const filteredOpenTasks = useMemo(() => {
    return openTasks.filter((t) => {
      const inDueBucket = bucketForDueDate(t.due_date) === dueTab;
      const inCategory =
        categoryFilter === 'all' ? true : (t.category || 'Uncategorized') === categoryFilter;
      return inDueBucket && inCategory;
    });
  }, [openTasks, dueTab, categoryFilter, todayKey, tomorrowKey]);

  const completedTodayTasks = useMemo(() => {
    if (!todayKey) return [];
    return tasks.filter((t) => {
      if (t.status !== 'done' || !t.completed_at) return false;
      const completedDay = localDateKey(new Date(t.completed_at));
      const inCategory =
        categoryFilter === 'all' ? true : (t.category || 'Uncategorized') === categoryFilter;
      return completedDay === todayKey && inCategory;
    });
  }, [tasks, todayKey, categoryFilter]);

  const todayDueAll = useMemo(() => {
    if (!todayKey) return [];
    return tasks.filter((t) => t.due_date === todayKey);
  }, [tasks, todayKey]);

  const todayDueDone = todayDueAll.filter((t) => t.status === 'done').length;
  const todayDueTotal = todayDueAll.length;
  const progressPct = todayDueTotal === 0 ? 0 : Math.round((todayDueDone / todayDueTotal) * 100);

  const allCategories = useMemo(() => {
    const base = ['Personal', 'Work', 'Health', 'Family', 'Finance'];
    const fromTasks = tasks.map((t) => t.category || 'Uncategorized').filter(Boolean);
    return Array.from(new Set([...base, ...fromTasks]));
  }, [tasks]);

  async function addTask(e) {
    e.preventDefault();
    const title = newTask.trim();
    if (!title || !todayKey) return;

    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        category: newCategory || 'Personal',
        priority: newPriority || 'Medium',
        due_date: newDueDate || todayKey,
        status: 'open',
      };

      const { error } = await supabase.from('tasks').insert(payload);
      if (error) throw error;

      setNewTask('');
      setNewCategory('Personal');
      setNewPriority('Medium');
      setNewDueDate(todayKey);
      await loadTasks();
    } catch (e) {
      setError(e?.message || 'Failed to add task.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(task) {
    setError(null);
    try {
      const nextDone = task.status !== 'done';
      const { error } = await supabase
        .from('tasks')
        .update({
          status: nextDone ? 'done' : 'open',
          completed_at: nextDone ? new Date().toISOString() : null,
        })
        .eq('id', task.id);

      if (error) throw error;
      await loadTasks();
    } catch (e) {
      setError(e?.message || 'Failed to update task.');
    }
  }

  async function deleteTask(taskId) {
    setError(null);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      await Promise.all([loadTasks(), loadArchive()]);
    } catch (e) {
      setError(e?.message || 'Failed to delete task.');
    }
  }

  function startEdit(task) {
    setEditingId(task.id);
    setEditTaskTitle(task.title || '');
    setEditCategory(task.category || 'Personal');
    setEditPriority(task.priority || 'Medium');
    setEditDueDate(task.due_date || todayKey);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTaskTitle('');
    setEditCategory('Personal');
    setEditPriority('Medium');
    setEditDueDate('');
  }

  async function saveEdit(taskId) {
    const title = editTaskTitle.trim();
    if (!title || !todayKey) return;

    setError(null);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title,
          category: editCategory || 'Personal',
          priority: editPriority || 'Medium',
          due_date: editDueDate || todayKey,
        })
        .eq('id', taskId);

      if (error) throw error;
      cancelEdit();
      await loadTasks();
    } catch (e) {
      setError(e?.message || 'Failed to save task edits.');
    }
  }

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (progressPct / 100);

  function priorityClasses(priority) {
    if (priority === 'High') return 'bg-red-500/20 text-red-300 border-red-400/40';
    if (priority === 'Low') return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
    return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
  }

  const dailyQuote = quoteForDay(todayKey);

  return (
    <main className="min-h-screen bg-black text-emerald-100">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-wide text-emerald-300 drop-shadow-sm">
              Rich&apos;s Life HQ
            </h1>
            <p className="mt-2 text-sm text-emerald-400/90 italic">“{dailyQuote}”</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setTab('today')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === 'today'
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                  : 'bg-zinc-900 text-emerald-300 hover:bg-zinc-800'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTab('archive')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === 'archive'
                  ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/30'
                  : 'bg-zinc-900 text-emerald-300 hover:bg-zinc-800'
              }`}
            >
              Archive (14d)
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {tab === 'today' && (
          <section className="space-y-6">
            <div className="rounded-xl border border-emerald-500/20 bg-zinc-950 p-4 shadow-lg shadow-emerald-500/10">
              <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
                <div className="relative h-28 w-28">
                  <svg className="h-28 w-28 -rotate-90">
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-zinc-800"
                      fill="none"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-emerald-400"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${circumference - dash}`}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-xl font-semibold text-emerald-300">{progressPct}%</div>
                      <div className="text-xs text-emerald-500/80">
                        {todayDueDone}/{todayDueTotal}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-emerald-500/80">Daily Progress (Due Today)</p>
                  <p className="text-lg font-medium text-emerald-200">
                    {todayDueDone} done, {Math.max(todayDueTotal - todayDueDone, 0)} left
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={addTask} className="rounded-xl border border-emerald-500/20 bg-zinc-950 p-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Add a task..."
                  className="md:col-span-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                />

                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                >
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                >
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>

                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                />

                <button
                  type="submit"
                  disabled={saving || !todayKey}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </form>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'today', label: 'Due Today' },
                  { key: 'tomorrow', label: 'Due Tomorrow' },
                  { key: 'later', label: 'Beyond Tomorrow' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setDueTab(t.key)}
                    className={`rounded-md px-3 py-1.5 text-sm transition ${
                      dueTab === t.key
                        ? 'bg-emerald-500 text-black'
                        : 'bg-zinc-900 text-emerald-300 hover:bg-zinc-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-emerald-400/80">Filter:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                >
                  <option value="all">All Categories</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-zinc-950">
              <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-emerald-300">
                Open Tasks
              </div>
              <ul>
                {loading ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">Loading...</li>
                ) : filteredOpenTasks.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">No tasks in this view.</li>
                ) : (
                  filteredOpenTasks.map((task) => (
                    <li key={task.id} className="border-t border-zinc-800 px-4 py-3">
                      {editingId === task.id ? (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                          <input
                            value={editTaskTitle}
                            onChange={(e) => setEditTaskTitle(e.target.value)}
                            className="md:col-span-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                          />
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                          >
                            {allCategories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value)}
                            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                          >
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                          </select>
                          <input
                            type="date"
                            value={editDueDate}
                            onChange={(e) => setEditDueDate(e.target.value)}
                            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(task.id)}
                              className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded-md bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => toggleDone(task)}
                              className="mt-1 h-4 w-4"
                            />
                            <div>
                              <div className="text-base text-emerald-100">{task.title}</div>
                              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                                  {task.category || 'Uncategorized'}
                                </span>
                                <span
                                  className={`rounded border px-2 py-0.5 ${priorityClasses(
                                    task.priority || 'Medium'
                                  )}`}
                                >
                                  {task.priority || 'Medium'}
                                </span>
                                <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                                  Due: {task.due_date}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEdit(task)}
                              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-purple-500/30 bg-purple-950/20">
              <div className="border-b border-purple-500/20 px-4 py-3 text-sm font-semibold text-purple-300">
                Completed Today
              </div>
              <ul>
                {loading ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">Loading...</li>
                ) : completedTodayTasks.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">No completed tasks yet.</li>
                ) : (
                  completedTodayTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-col gap-3 border-t border-purple-500/20 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggleDone(task)}
                          className="mt-1 h-4 w-4"
                        />
                        <div>
                          <div className="text-purple-200 line-through">{task.title}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <span className="rounded border border-purple-400/40 bg-purple-500/10 px-2 py-0.5 text-purple-300">
                              {task.category || 'Uncategorized'}
                            </span>
                            <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                              Priority: {task.priority || 'Medium'}
                            </span>
                            <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                              Due: {task.due_date}
                            </span>
                          </div>
                        </div>
                      </label>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="w-fit rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                      >
                        Delete
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </section>
        )}

        {tab === 'archive' && (
          <section className="rounded-xl border border-emerald-500/20 bg-zinc-950">
            <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-emerald-300">
              Archived (last 14 days)
            </div>
            <ul>
              {loading ? (
                <li className="px-4 py-3 text-sm text-zinc-400">Loading...</li>
              ) : archiveTasks.length === 0 ? (
                <li className="px-4 py-3 text-sm text-zinc-400">No archived tasks.</li>
              ) : (
                archiveTasks.map((task) => (
                  <li key={task.id} className="border-t border-zinc-800 px-4 py-3 text-sm">
                    <div className="font-medium text-emerald-200">{task.title}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                        {task.category || 'Uncategorized'}
                      </span>
                      <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                        Priority: {task.priority || 'Medium'}
                      </span>
                      <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                        Due: {task.due_date}
                      </span>
                      <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                        Archived: {task.archived_at ? new Date(task.archived_at).toLocaleString() : '—'}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}

        <footer className="mt-10 border-t border-zinc-900 pt-4 text-center text-sm text-emerald-500/80">
          Created by Rich Ruiz
        </footer>
      </div>
    </main>
  );
}