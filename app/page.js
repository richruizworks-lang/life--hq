'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabas.js'; 
// If this import fails in your project, use:
// import { supabase } from '@/lib/supabase-browser';

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fourteenDaysAgoISO() {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
}

export default function Page() {
  const [tab, setTab] = useState('today'); // 'today' | 'archive'
  const [newTask, setNewTask] = useState('');
  const [todayTasks, setTodayTasks] = useState([]);
  const [archiveTasks, setArchiveTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [currentDay, setCurrentDay] = useState(localDateKey());

  const todayTotal = todayTasks.length;
  const todayDone = todayTasks.filter((t) => t.status === 'done').length;
  const progressPct = todayTotal === 0 ? 0 : Math.round((todayDone / todayTotal) * 100);

  const openTasks = useMemo(
    () => todayTasks.filter((t) => t.status === 'open'),
    [todayTasks]
  );
  const doneTasks = useMemo(
    () => todayTasks.filter((t) => t.status === 'done'),
    [todayTasks]
  );

  async function runRollover() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const { error } = await supabase.rpc('archive_rollover', { p_tz: tz });
    if (error) throw error;
  }

  async function loadToday() {
    const today = localDateKey();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('due_date', today)
      .in('status', ['open', 'done'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    setTodayTasks(data || []);
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
      await Promise.all([loadToday(), loadArchive()]);
    } catch (e) {
      setError(e?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check every minute for day change
  useEffect(() => {
    const timer = setInterval(() => {
      const nowDay = localDateKey();
      if (nowDay !== currentDay) {
        setCurrentDay(nowDay);
        refreshAll();
      }
    }, 60_000);

    return () => clearInterval(timer);
  }, [currentDay]);

  async function addTask(e) {
    e.preventDefault();
    const title = newTask.trim();
    if (!title) return;

    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from('tasks').insert({
        title,
        due_date: localDateKey(),
        status: 'open',
      });
      if (error) throw error;

      setNewTask('');
      await loadToday();
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
      await loadToday();
    } catch (e) {
      setError(e?.message || 'Failed to update task.');
    }
  }

  async function deleteTask(taskId) {
    setError(null);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      await loadToday();
      await loadArchive();
    } catch (e) {
      setError(e?.message || 'Failed to delete task.');
    }
  }

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (progressPct / 100);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Life HQ</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setTab('today')}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === 'today'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTab('archive')}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === 'archive'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Archive (14d)
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {tab === 'today' && (
          <section className="space-y-6">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-4">
                <div className="relative h-28 w-28">
                  <svg className="h-28 w-28 -rotate-90">
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-zinc-700"
                      fill="none"
                    />
                    <circle
                      cx="56"
                      cy="56"
                      r={radius}
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-emerald-500"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${circumference - dash}`}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-xl font-semibold">{progressPct}%</div>
                      <div className="text-xs text-zinc-400">
                        {todayDone}/{todayTotal}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-zinc-400">Daily Progress</p>
                  <p className="text-lg font-medium">
                    {todayDone} done, {todayTotal - todayDone} left
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={addTask} className="flex gap-2">
              <input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="Add a task..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Add
              </button>
            </form>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3 text-sm font-medium">
                Open Tasks
              </div>
              <ul>
                {loading ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">Loading...</li>
                ) : openTasks.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">No open tasks.</li>
                ) : (
                  openTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center justify-between border-t border-zinc-800 px-4 py-3"
                    >
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleDone(task)}
                          className="h-4 w-4"
                        />
                        <span>{task.title}</span>
                      </label>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        Delete
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3 text-sm font-medium">
                Completed Today
              </div>
              <ul>
                {loading ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">Loading...</li>
                ) : doneTasks.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-zinc-400">No completed tasks yet.</li>
                ) : (
                  doneTasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center justify-between border-t border-zinc-800 px-4 py-3"
                    >
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggleDone(task)}
                          className="h-4 w-4"
                        />
                        <span className="text-zinc-400 line-through">{task.title}</span>
                      </label>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
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
          <section className="rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="border-b border-zinc-800 px-4 py-3 text-sm font-medium">
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
                    <div className="font-medium text-zinc-200">{task.title}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Due: {task.due_date} • Archived:{' '}
                      {task.archived_at ? new Date(task.archived_at).toLocaleString() : '—'}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}