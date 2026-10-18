'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

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

function dueDateKey(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function dueTimeKey(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function dueDateTimeLabel(dueDate, dueTime) {
  const d = dueDateKey(dueDate);
  if (!d) return '—';
  const t = dueTimeKey(dueTime);
  return t ? `${d} ${t}` : `${d} (any time)`;
}

function isOverdueTask(task, todayKey) {
  if (!todayKey) return false;
  if (task?.completed_at) return false;
  const key = dueDateKey(task?.due_date);
  if (!key) return false;
  return key < todayKey;
}

function taskSortStamp(task, noTimeAtEnd = true) {
  const d = dueDateKey(task?.due_date) || '9999-12-31';
  const t = dueTimeKey(task?.due_time);
  const timePart = t || (noTimeAtEnd ? '99:99' : '00:00');
  return `${d}T${timePart}`;
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

function titleCaseEntryType(type) {
  const t = String(type || 'task').toLowerCase();
  if (t === 'event') return 'Event';
  if (t === 'reminder') return 'Reminder';
  if (t === 'appointment') return 'Appointment';
  return 'Task';
}

function meterStrokeClass(tone) {
  if (tone === 'green') return 'text-emerald-400';
  if (tone === 'purple') return 'text-purple-400';
  return 'text-red-400';
}

function meterLabelClass(tone) {
  if (tone === 'green') return 'text-emerald-500/80';
  if (tone === 'purple') return 'text-purple-400/90';
  return 'text-red-400/90';
}

function meterValueClass(tone) {
  if (tone === 'green') return 'text-emerald-200';
  if (tone === 'purple') return 'text-purple-200';
  return 'text-red-200';
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
  const [newDueTime, setNewDueTime] = useState('');
  const [newEntryType, setNewEntryType] = useState('task');

  const [tasks, setTasks] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);
  const [listItems, setListItems] = useState([]);

  const [newListName, setNewListName] = useState('');
  const [newListItem, setNewListItem] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listSaving, setListSaving] = useState(false);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editCategory, setEditCategory] = useState('Personal');
  const [editPriority, setEditPriority] = useState('Medium');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [editEntryType, setEditEntryType] = useState('task');

  const todayKey = currentDay;
  const tomorrowKey = currentDay ? addDaysToKey(currentDay, 1) : '';

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true })
      .order('due_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function fetchLists() {
    const { data, error } = await supabase
      .from('one_time_lists')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async function fetchListItems(listId) {
    if (!listId) return [];
    const { data, error } = await supabase
      .from('one_time_list_items')
      .select('*')
      .eq('list_id', listId)
      .order('is_done', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function reloadTasks() {
    const data = await fetchTasks();
    setTasks(data);
  }

  async function reloadLists() {
    const data = await fetchLists();
    setLists(data);

    if (data.length === 0) {
      setSelectedListId(null);
      setListItems([]);
      return;
    }

    const exists = data.some((l) => l.id === selectedListId);
    const nextSelected = exists ? selectedListId : data[0].id;
    setSelectedListId(nextSelected);

    const items = await fetchListItems(nextSelected);
    setListItems(items);
  }

  async function reloadItems(listId) {
    if (!listId) {
      setListItems([]);
      return;
    }
    const items = await fetchListItems(listId);
    setListItems(items);
  }

  async function refreshAll() {
    setError(null);
    try {
      const [taskData, listData] = await Promise.all([fetchTasks(), fetchLists()]);
      setTasks(taskData);
      setLists(listData);

      if (listData.length === 0) {
        setSelectedListId(null);
        setListItems([]);
      } else {
        const exists = listData.some((l) => l.id === selectedListId);
        const nextSelected = exists ? selectedListId : listData[0].id;
        setSelectedListId(nextSelected);
        const items = await fetchListItems(nextSelected);
        setListItems(items);
      }
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
    }, 60000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDay]);

  useEffect(() => {
    if (!selectedListId) return;
    reloadItems(selectedListId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId]);

  function bucketForDueDate(dueDate) {
    if (!todayKey || !tomorrowKey) return 'today';
    const key = dueDateKey(dueDate);
    if (!key) return 'later';
    if (key === todayKey) return 'today';
    if (key === tomorrowKey) return 'tomorrow';
    if (key > tomorrowKey) return 'later';
    return 'today';
  }

  const openTasks = useMemo(() => tasks.filter((t) => !t.completed_at), [tasks]);

  const filteredOpenTasks = useMemo(() => {
    const base = openTasks.filter((t) => {
      const inDueBucket = bucketForDueDate(t.due_date) === dueTab;
      const inCategory =
        categoryFilter === 'all' ? true : (t.category || 'Uncategorized') === categoryFilter;
      return inDueBucket && inCategory;
    });

    return [...base].sort((a, b) => {
      const aStamp = taskSortStamp(a, true);
      const bStamp = taskSortStamp(b, true);
      if (aStamp < bStamp) return -1;
      if (aStamp > bStamp) return 1;

      const aCreated = new Date(a.created_at || 0).getTime();
      const bCreated = new Date(b.created_at || 0).getTime();
      return aCreated - bCreated;
    });
  }, [openTasks, dueTab, categoryFilter, todayKey, tomorrowKey]);

  const completedTodayTasks = useMemo(() => {
    if (!todayKey) return [];
    return tasks
      .filter((t) => {
        if (!t.completed_at) return false;
        const completedDay = localDateKey(new Date(t.completed_at));
        const inCategory =
          categoryFilter === 'all' ? true : (t.category || 'Uncategorized') === categoryFilter;
        return completedDay === todayKey && inCategory;
      })
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  }, [tasks, todayKey, categoryFilter]);

  const archiveTasks = useMemo(() => {
    if (!todayKey) return [];
    const startToday = parseDateKey(todayKey);
    const start14DaysAgo = new Date(startToday);
    start14DaysAgo.setDate(start14DaysAgo.getDate() - 14);

    return tasks
      .filter((t) => {
        if (!t.completed_at) return false;
        const completed = new Date(t.completed_at);
        return completed < startToday && completed >= start14DaysAgo;
      })
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  }, [tasks, todayKey]);

  const todayDueAll = useMemo(() => {
    if (!todayKey) return [];
    return tasks.filter((t) => dueDateKey(t.due_date) === todayKey);
  }, [tasks, todayKey]);

  const todayDueDone = todayDueAll.filter((t) => !!t.completed_at).length;
  const todayDueTotal = todayDueAll.length;
  const dueTodayPct = todayDueTotal === 0 ? 0 : Math.round((todayDueDone / todayDueTotal) * 100);

  const doneTodayCount = completedTodayTasks.length;
  const todayActivityTotal = useMemo(() => {
    const ids = new Set();
    todayDueAll.forEach((t) => ids.add(t.id));
    completedTodayTasks.forEach((t) => ids.add(t.id));
    return ids.size;
  }, [todayDueAll, completedTodayTasks]);
  const doneTodayPct =
    todayActivityTotal === 0 ? 0 : Math.round((doneTodayCount / todayActivityTotal) * 100);

  const overdueOpenCount = useMemo(
    () => openTasks.filter((t) => isOverdueTask(t, todayKey)).length,
    [openTasks, todayKey]
  );
  const openTotal = openTasks.length;
  const overduePct = openTotal === 0 ? 0 : Math.round((overdueOpenCount / openTotal) * 100);

  const allCategories = useMemo(() => {
    const base = ['Personal', 'Work', 'Health', 'Family', 'Finance', 'Personal Growth', 'Other'];
    const fromTasks = tasks.map((t) => t.category || 'Uncategorized').filter(Boolean);
    return Array.from(new Set([...base, ...fromTasks]));
  }, [tasks]);

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) || null,
    [lists, selectedListId]
  );

  const listDoneCount = listItems.filter((i) => i.is_done).length;
  const listTotalCount = listItems.length;

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
        due_time: newDueTime || null,
        entry_type: (newEntryType || 'task').toLowerCase(),
      };

      const { error } = await supabase.from('tasks').insert(payload);
      if (error) throw error;

      setNewTask('');
      setNewCategory('Personal');
      setNewPriority('Medium');
      setNewDueDate(todayKey);
      setNewDueTime('');
      setNewEntryType('task');
      await reloadTasks();
    } catch (e) {
      setError(e?.message || 'Failed to add task.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(task) {
    setError(null);
    try {
      const nextCompletedAt = task.completed_at ? null : new Date().toISOString();
      const { error } = await supabase
        .from('tasks')
        .update({ completed_at: nextCompletedAt })
        .eq('id', task.id);

      if (error) throw error;
      await reloadTasks();
    } catch (e) {
      setError(e?.message || 'Failed to update task.');
    }
  }

  async function deleteTask(taskId) {
    setError(null);
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      await reloadTasks();
    } catch (e) {
      setError(e?.message || 'Failed to delete task.');
    }
  }

  function startEdit(task) {
    setEditingId(task.id);
    setEditTaskTitle(task.title || '');
    setEditCategory(task.category || 'Personal');
    setEditPriority(task.priority || 'Medium');
    setEditDueDate(dueDateKey(task.due_date) || todayKey);
    setEditDueTime(dueTimeKey(task.due_time) || '');
    setEditEntryType((task.entry_type || 'task').toLowerCase());
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTaskTitle('');
    setEditCategory('Personal');
    setEditPriority('Medium');
    setEditDueDate('');
    setEditDueTime('');
    setEditEntryType('task');
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
          due_time: editDueTime || null,
          entry_type: (editEntryType || 'task').toLowerCase(),
        })
        .eq('id', taskId);

      if (error) throw error;
      cancelEdit();
      await reloadTasks();
    } catch (e) {
      setError(e?.message || 'Failed to save task edits.');
    }
  }

  async function createList(e) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;

    setListSaving(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('one_time_lists')
        .insert({ name })
        .select('*')
        .single();

      if (error) throw error;

      setNewListName('');
      await reloadLists();
      if (data?.id) {
        setSelectedListId(data.id);
        await reloadItems(data.id);
      }
    } catch (e) {
      setError(e?.message || 'Failed to create list.');
    } finally {
      setListSaving(false);
    }
  }

  async function deleteList(listId) {
    if (!listId) return;
    setError(null);
    try {
      const { error } = await supabase.from('one_time_lists').delete().eq('id', listId);
      if (error) throw error;
      await reloadLists();
    } catch (e) {
      setError(e?.message || 'Failed to delete list.');
    }
  }

  async function addListItem(e) {
    e.preventDefault();
    const title = newListItem.trim();
    if (!title || !selectedListId) return;

    setListSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from('one_time_list_items').insert({
        list_id: selectedListId,
        title,
        is_done: false,
      });
      if (error) throw error;

      setNewListItem('');
      await reloadItems(selectedListId);
    } catch (e) {
      setError(e?.message || 'Failed to add list item.');
    } finally {
      setListSaving(false);
    }
  }

  async function toggleListItem(item) {
    setError(null);
    try {
      const { error } = await supabase
        .from('one_time_list_items')
        .update({ is_done: !item.is_done })
        .eq('id', item.id);

      if (error) throw error;
      await reloadItems(selectedListId);
    } catch (e) {
      setError(e?.message || 'Failed to update list item.');
    }
  }

  async function deleteListItem(itemId) {
    setError(null);
    try {
      const { error } = await supabase.from('one_time_list_items').delete().eq('id', itemId);
      if (error) throw error;
      await reloadItems(selectedListId);
    } catch (e) {
      setError(e?.message || 'Failed to delete list item.');
    }
  }

  async function clearCheckedItems() {
    if (!selectedListId) return;
    setError(null);
    try {
      const { error } = await supabase
        .from('one_time_list_items')
        .delete()
        .eq('list_id', selectedListId)
        .eq('is_done', true);

      if (error) throw error;
      await reloadItems(selectedListId);
    } catch (e) {
      setError(e?.message || 'Failed to clear checked items.');
    }
  }

  function priorityClasses(priority) {
    if (priority === 'High') return 'bg-red-500/20 text-red-300 border-red-400/40';
    if (priority === 'Low') return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
    return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
  }

  function renderMeter({ tone, label, pct, numerator, denominator }) {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const safePct = Math.max(0, Math.min(100, pct));
    const dash = circumference * (safePct / 100);

    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20">
            <svg className="h-20 w-20 -rotate-90">
              <circle
                cx="40"
                cy="40"
                r={radius}
                stroke="currentColor"
                strokeWidth="8"
                className="text-zinc-800"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r={radius}
                stroke="currentColor"
                strokeWidth="8"
                className={meterStrokeClass(tone)}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className={`text-lg font-semibold ${meterValueClass(tone)}`}>{safePct}%</div>
                <div className="text-xs text-zinc-400">
                  {numerator}/{denominator}
                </div>
              </div>
            </div>
          </div>
          <div>
            <p className={`text-sm ${meterLabelClass(tone)}`}>{label}</p>
          </div>
        </div>
      </div>
    );
  }

  const dailyQuote = quoteForDay(todayKey);

  return (
    <main className="min-h-screen bg-black text-emerald-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {tab === 'today' && (
              <section className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {renderMeter({
                    tone: 'green',
                    label: 'Due Today Progress',
                    pct: dueTodayPct,
                    numerator: todayDueDone,
                    denominator: todayDueTotal,
                  })}
                  {renderMeter({
                    tone: 'purple',
                    label: 'Done Today Progress',
                    pct: doneTodayPct,
                    numerator: doneTodayCount,
                    denominator: todayActivityTotal,
                  })}
                  {renderMeter({
                    tone: 'red',
                    label: 'Overdue (Not Done)',
                    pct: overduePct,
                    numerator: overdueOpenCount,
                    denominator: openTotal,
                  })}
                </div>

                <form
                  onSubmit={addTask}
                  className="rounded-xl border border-emerald-500/20 bg-zinc-950 p-4"
                >
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-8">
                    <input
                      value={newTask}
                      onChange={(e) => setNewTask(e.target.value)}
                      placeholder="Add a task..."
                      className="md:col-span-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                    />
                    <select
                      value={newEntryType}
                      onChange={(e) => setNewEntryType(e.target.value)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                    >
                      <option value="task">Task</option>
                      <option value="event">Event</option>
                      <option value="reminder">Reminder</option>
                      <option value="appointment">Appointment</option>
                    </select>
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
                    <input
                      type="time"
                      value={newDueTime}
                      onChange={(e) => setNewDueTime(e.target.value)}
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
                      filteredOpenTasks.map((task) => {
                        const overdue = isOverdueTask(task, todayKey);
                        return (
                          <li
                            key={task.id}
                            className={`border-t px-4 py-3 ${
                              overdue ? 'border-red-500/40 bg-red-500/5' : 'border-zinc-800'
                            }`}
                          >
                            {editingId === task.id ? (
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-8">
                                <input
                                  value={editTaskTitle}
                                  onChange={(e) => setEditTaskTitle(e.target.value)}
                                  className="md:col-span-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                                />
                                <select
                                  value={editEntryType}
                                  onChange={(e) => setEditEntryType(e.target.value)}
                                  className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-emerald-100 outline-none focus:border-emerald-500"
                                >
                                  <option value="task">Task</option>
                                  <option value="event">Event</option>
                                  <option value="reminder">Reminder</option>
                                  <option value="appointment">Appointment</option>
                                </select>
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
                                <input
                                  type="time"
                                  value={editDueTime}
                                  onChange={(e) => setEditDueTime(e.target.value)}
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
                                      <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
                                        {titleCaseEntryType(task.entry_type)}
                                      </span>
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
                                      <span
                                        className={`rounded border px-2 py-0.5 ${
                                          overdue
                                            ? 'border-red-400/40 bg-red-500/20 text-red-200'
                                            : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                                        }`}
                                      >
                                        Due: {dueDateTimeLabel(task.due_date, task.due_time)}
                                      </span>
                                      {overdue && (
                                        <span className="rounded border border-red-400/50 bg-red-600/30 px-2 py-0.5 text-red-100">
                                          Overdue
                                        </span>
                                      )}
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
                        );
                      })
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
                                <span className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
                                  {titleCaseEntryType(task.entry_type)}
                                </span>
                                <span className="rounded border border-purple-400/40 bg-purple-500/10 px-2 py-0.5 text-purple-300">
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
                                  Due: {dueDateTimeLabel(task.due_date, task.due_time)}
                                </span>
                                <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                                  Completed:{' '}
                                  {task.completed_at
                                    ? new Date(task.completed_at).toLocaleString()
                                    : '—'}
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
                        <div className="font-medium text-emerald-200 line-through">{task.title}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                          <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
                            {titleCaseEntryType(task.entry_type)}
                          </span>
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
                            Due: {dueDateTimeLabel(task.due_date, task.due_time)}
                          </span>
                          <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                            Completed:{' '}
                            {task.completed_at ? new Date(task.completed_at).toLocaleString() : '—'}
                          </span>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:col-span-1">
            <div className="rounded-xl border border-cyan-500/20 bg-zinc-950">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-cyan-300">One-Time Lists</h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Grocery trips, freelance job checklists, and other temporary lists.
                </p>
              </div>

              <div className="space-y-4 p-4">
                <form onSubmit={createList} className="flex gap-2">
                  <input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="New list name..."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-500"
                  />
                  <button
                    type="submit"
                    disabled={listSaving}
                    className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
                  >
                    Add
                  </button>
                </form>

                <div className="max-h-56 overflow-auto rounded-md border border-zinc-800">
                  {lists.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-zinc-400">No lists yet.</div>
                  ) : (
                    <ul>
                      {lists.map((list) => (
                        <li key={list.id} className="border-t border-zinc-800 first:border-t-0">
                          <button
                            onClick={() => setSelectedListId(list.id)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                              selectedListId === list.id
                                ? 'bg-cyan-500/20 text-cyan-200'
                                : 'text-zinc-200 hover:bg-zinc-900'
                            }`}
                          >
                            <span className="truncate">{list.name}</span>
                            {selectedListId === list.id && (
                              <span className="text-xs text-cyan-300">Active</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selectedList ? (
                  <div className="space-y-3 rounded-md border border-cyan-500/20 bg-cyan-950/10 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-cyan-200">{selectedList.name}</div>
                        <div className="text-xs text-zinc-400">
                          {listDoneCount}/{listTotalCount} checked
                        </div>
                      </div>
                      <button
                        onClick={() => deleteList(selectedList.id)}
                        className="rounded bg-red-600/80 px-2 py-1 text-xs text-red-100 hover:bg-red-500"
                      >
                        Delete List
                      </button>
                    </div>

                    <form onSubmit={addListItem} className="flex gap-2">
                      <input
                        value={newListItem}
                        onChange={(e) => setNewListItem(e.target.value)}
                        placeholder="Add item..."
                        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-cyan-100 outline-none focus:border-cyan-500"
                      />
                      <button
                        type="submit"
                        disabled={listSaving}
                        className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </form>

                    <div className="max-h-72 overflow-auto rounded-md border border-zinc-800">
                      {listItems.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-zinc-400">No items yet.</div>
                      ) : (
                        <ul>
                          {listItems.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-2 border-t border-zinc-800 px-3 py-2 first:border-t-0"
                            >
                              <label className="flex min-w-0 items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={item.is_done}
                                  onChange={() => toggleListItem(item)}
                                  className="h-4 w-4"
                                />
                                <span
                                  className={`truncate text-sm ${
                                    item.is_done ? 'text-zinc-400 line-through' : 'text-zinc-100'
                                  }`}
                                >
                                  {item.title}
                                </span>
                              </label>
                              <button
                                onClick={() => deleteListItem(item.id)}
                                className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                              >
                                Delete
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <button
                      onClick={clearCheckedItems}
                      className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                    >
                      Delete Checked Items
                    </button>
                  </div>
                ) : (
                  <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-3 text-xs text-zinc-400">
                    Create or select a list to start checking things off.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <footer className="mt-10 border-t border-zinc-900 pt-4 text-center text-sm text-emerald-500/80">
          Created by Rich Ruiz
        </footer>
      </div>
    </main>
  );
}