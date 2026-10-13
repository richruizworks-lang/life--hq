import { revalidatePath } from 'next/cache';
import { Lexend } from 'next/font/google';
import { supabase } from '../lib/supabase';

export const instant = false;

const lexend = Lexend({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
});

const CATEGORY_OPTIONS = [
  'Home',
  'Work',
  'Health',
  'Finance',
  'Family',
  'Personal Growth',
  'Admin/Errands',
  'Content/Projects',
  'Other',
];

const FREQUENCY_OPTIONS = ['one-time', 'daily', 'weekly', 'monthly'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high'];

const MOTIVATIONAL_QUOTES = [
  'Small steps, repeated daily, create massive change.',
  'Do the next right thing — momentum beats perfection.',
  'Discipline is just remembering what you want most.',
  'A clear plan turns stress into action.',
  'Progress is built in ordinary moments.',
  'Consistency compounds faster than intensity.',
  'One completed task is worth ten delayed intentions.',
  'You do not need more time — you need fewer distractions.',
  'Protect your priorities and your priorities will protect your future.',
  'Today’s effort is tomorrow’s freedom.',
  'Win the hour, and the day will follow.',
  'Done is fuel. Start small and keep moving.',
];

function getDailyQuote(dateObj) {
  const dayKey = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
  const dayIndex = Math.floor(dayKey / 86400000);
  const idx = Math.abs(dayIndex) % MOTIVATIONAL_QUOTES.length;
  return MOTIVATIONAL_QUOTES[idx];
}

function formatDate(dateString) {
  if (!dateString) return 'No date';
  const d = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function formatDoneDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const d = new Date(timestamp);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function priorityColor(priority) {
  if (priority === 'high') return '#fca5a5';
  if (priority === 'medium') return '#fde68a';
  return '#86efac';
}

function priorityRank(priority) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  return 2;
}

function sortTasksByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    const prioDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (prioDiff !== 0) return prioDiff;

    const aDue = a.due_date ?? '9999-12-31';
    const bDue = b.due_date ?? '9999-12-31';
    if (aDue < bDue) return -1;
    if (aDue > bDue) return 1;

    return a.id - b.id;
  });
}

function parseDateOnly(dateString) {
  if (!dateString) return null;
  return new Date(`${dateString}T00:00:00`);
}

function toDateOnlyString(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function computeNextDueDate(currentDueDate, frequency) {
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  let base = parseDateOnly(currentDueDate) ?? todayOnly;
  if (base < todayOnly) base = todayOnly;

  const next = new Date(base);

  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);

  return toDateOnlyString(next);
}

function completionTiming(task) {
  if (!task.is_done || !task.completed_at) return null;
  if (!task.due_date) return 'No due date';

  const doneDate = task.completed_at.slice(0, 10);
  if (doneDate < task.due_date) return 'Early';
  if (doneDate > task.due_date) return 'Late';
  return 'On time';
}

function completionTimingColor(timing) {
  if (timing === 'Late') return '#fca5a5';
  if (timing === 'On time') return '#86efac';
  if (timing === 'Early') return '#93c5fd';
  return '#cbd5e1';
}

function getLocalDateString(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseSelectedCategories(rawCats) {
  if (!rawCats) return [];
  const arr = Array.isArray(rawCats) ? rawCats : [rawCats];
  const flattened = arr.flatMap((item) =>
    String(item)
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  );
  const unique = [...new Set(flattened)];
  return unique.filter((c) => CATEGORY_OPTIONS.includes(c));
}

export default async function Home({ searchParams }) {
  const resolvedParams = await Promise.resolve(searchParams || {});
  const activeTabRaw = String(resolvedParams?.tab ?? 'today');
  const activeTab = ['today', 'tomorrow', 'later', 'archive'].includes(activeTabRaw)
    ? activeTabRaw
    : 'today';

  const selectedCategories = parseSelectedCategories(resolvedParams?.cats);
  const selectedCategorySet = new Set(selectedCategories);

  async function addTask(formData) {
    'use server';

    const title = String(formData.get('title') ?? '').trim();
    const details = String(formData.get('details') ?? '').trim();
    const categoryRaw = String(formData.get('category') ?? 'Other');
    const frequencyRaw = String(formData.get('frequency') ?? 'one-time');
    const priorityRaw = String(formData.get('priority') ?? 'medium');
    const dueDateRaw = String(formData.get('due_date') ?? '').trim();

    if (!title) return;

    const category = CATEGORY_OPTIONS.includes(categoryRaw) ? categoryRaw : 'Other';
    const frequency = FREQUENCY_OPTIONS.includes(frequencyRaw) ? frequencyRaw : 'one-time';
    const priority = PRIORITY_OPTIONS.includes(priorityRaw) ? priorityRaw : 'medium';
    const due_date = dueDateRaw ? dueDateRaw : null;

    const { error } = await supabase.from('tasks').insert([
      {
        title,
        details: details || null,
        category,
        frequency,
        due_date,
        priority,
        is_done: false,
        completed_at: null,
      },
    ]);

    if (error) {
      console.error('Add task error:', error.message);
      return;
    }

    revalidatePath('/');
  }

  async function updateTask(formData) {
    'use server';

    const id = Number(formData.get('id'));
    const title = String(formData.get('title') ?? '').trim();
    const details = String(formData.get('details') ?? '').trim();
    const categoryRaw = String(formData.get('category') ?? 'Other');
    const frequencyRaw = String(formData.get('frequency') ?? 'one-time');
    const priorityRaw = String(formData.get('priority') ?? 'medium');
    const dueDateRaw = String(formData.get('due_date') ?? '').trim();

    if (!Number.isInteger(id) || !title) return;

    const category = CATEGORY_OPTIONS.includes(categoryRaw) ? categoryRaw : 'Other';
    const frequency = FREQUENCY_OPTIONS.includes(frequencyRaw) ? frequencyRaw : 'one-time';
    const priority = PRIORITY_OPTIONS.includes(priorityRaw) ? priorityRaw : 'medium';
    const due_date = dueDateRaw ? dueDateRaw : null;

    const { error } = await supabase
      .from('tasks')
      .update({
        title,
        details: details || null,
        category,
        frequency,
        due_date,
        priority,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Update task error:', error.message);
      return;
    }

    revalidatePath('/');
  }

  async function toggleDone(formData) {
    'use server';

    const id = Number(formData.get('id'));
    const nextDone = String(formData.get('next_done')) === 'true';

    if (!Number.isInteger(id)) return;

    const { data: existingTask, error: readError } = await supabase
      .from('tasks')
      .select('id, title, details, category, frequency, due_date, priority, is_done')
      .eq('id', id)
      .single();

    if (readError || !existingTask) {
      console.error('Read task for toggle error:', readError?.message ?? 'Task not found');
      return;
    }

    const nowIso = new Date().toISOString();

    const { error: toggleError } = await supabase
      .from('tasks')
      .update({
        is_done: nextDone,
        completed_at: nextDone ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', id);

    if (toggleError) {
      console.error('Toggle done error:', toggleError.message);
      return;
    }

    if (nextDone && existingTask.frequency !== 'one-time') {
      const nextDue = computeNextDueDate(existingTask.due_date, existingTask.frequency);

      const { error: createNextError } = await supabase.from('tasks').insert([
        {
          title: existingTask.title,
          details: existingTask.details,
          category: existingTask.category,
          frequency: existingTask.frequency,
          due_date: nextDue,
          priority: existingTask.priority,
          is_done: false,
          completed_at: null,
        },
      ]);

      if (createNextError) {
        console.error('Create next recurring task error:', createNextError.message);
      }
    }

    revalidatePath('/');
  }

  async function deleteTask(formData) {
    'use server';

    const id = Number(formData.get('id'));
    if (!Number.isInteger(id)) return;

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      console.error('Delete task error:', error.message);
      return;
    }

    revalidatePath('/');
  }

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, details, category, frequency, due_date, priority, is_done, completed_at')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  const allUnfiltered = tasks ?? [];
  const all =
    selectedCategorySet.size === 0
      ? allUnfiltered
      : allUnfiltered.filter((t) => selectedCategorySet.has(t.category));

  const todayDate = new Date();
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  const todayStr = getLocalDateString(todayDate);
  const tomorrowStr = getLocalDateString(tomorrowDate);

  const quoteOfTheDay = getDailyQuote(todayDate);

  const archivedTasks = all.filter((t) => t.is_done || (!!t.due_date && t.due_date < todayStr));
  const activeOpenTasks = all.filter((t) => !t.is_done && !(t.due_date && t.due_date < todayStr));

  const dueToday = activeOpenTasks.filter((t) => t.due_date === todayStr);
  const dueTomorrow = activeOpenTasks.filter((t) => t.due_date === tomorrowStr);
  const beyondTomorrow = activeOpenTasks.filter((t) => !t.due_date || t.due_date > tomorrowStr);

  const allDueToday = all.filter((t) => t.due_date === todayStr);
  const doneDueToday = allDueToday.filter((t) => t.is_done).length;
  const todayTotal = allDueToday.length;
  const todayPercent = todayTotal === 0 ? 0 : Math.round((doneDueToday / todayTotal) * 100);

  const ringRadius = 48;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (todayPercent / 100) * ringCircumference;
  const ringColor = todayPercent === 100 ? '#22c55e' : '#7c3aed';

  let activeTasks = dueToday;
  let activeTitle = 'Due Today';

  if (activeTab === 'tomorrow') {
    activeTasks = dueTomorrow;
    activeTitle = 'Due Tomorrow';
  } else if (activeTab === 'later') {
    activeTasks = beyondTomorrow;
    activeTitle = 'Beyond Tomorrow';
  } else if (activeTab === 'archive') {
    activeTasks = archivedTasks;
    activeTitle = 'Archive';
  }

  const rankedActiveTasks = sortTasksByPriority(activeTasks);

  function buildTabHref(tabName) {
    const qs = new URLSearchParams();
    qs.set('tab', tabName);
    selectedCategories.forEach((cat) => qs.append('cats', cat));
    return `/?${qs.toString()}`;
  }

  function tabStyle(isActive, color = 'green') {
    const activeBorder = color === 'purple' ? '#7c3aed' : '#22c55e';
    const inactiveBorder = color === 'purple' ? '#5b21b6' : '#166534';
    const activeBg = color === 'purple' ? '#3b0764' : '#14532d';
    const inactiveBg = '#031006';
    const activeText = color === 'purple' ? '#e9d5ff' : '#dcfce7';
    const inactiveText = color === 'purple' ? '#c4b5fd' : '#86efac';

    return {
      display: 'inline-block',
      textDecoration: 'none',
      padding: '8px 12px',
      borderRadius: '8px',
      border: isActive ? `1px solid ${activeBorder}` : `1px solid ${inactiveBorder}`,
      background: isActive ? activeBg : inactiveBg,
      color: isActive ? activeText : inactiveText,
      fontSize: '14px',
    };
  }

  function renderTask(task, indexLabel) {
    const timing = completionTiming(task);
    const isArchivedOverdue = !task.is_done && !!task.due_date && task.due_date < todayStr;
    const done = task.is_done;

    const usePurple = done;
    const useAmber = isArchivedOverdue;

    const cardBorder = usePurple ? '#6d28d9' : useAmber ? '#b45309' : '#14532d';
    const cardBg = usePurple ? '#130722' : useAmber ? '#1f1204' : '#020a04';
    const titleColor = usePurple ? '#e9d5ff' : useAmber ? '#fde68a' : '#bbf7d0';
    const indexColor = usePurple ? '#c4b5fd' : useAmber ? '#f59e0b' : '#22c55e';
    const detailsColor = usePurple ? '#c4b5fd' : useAmber ? '#fcd34d' : '#86efac';
    const chipBorder = usePurple ? '#7c3aed' : useAmber ? '#b45309' : '#166534';
    const chipText = usePurple ? '#ddd6fe' : useAmber ? '#fde68a' : '#bbf7d0';

    return (
      <li
        key={task.id}
        style={{
          padding: '12px',
          marginBottom: '8px',
          border: `1px solid ${cardBorder}`,
          borderRadius: '8px',
          background: cardBg,
        }}
      >
        <style>{`
          .edit-details summary,
          .delete-details summary {
            list-style: none;
          }
          .edit-details summary::-webkit-details-marker,
          .delete-details summary::-webkit-details-marker {
            display: none;
          }
        `}</style>

        <div className="task-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: titleColor, marginBottom: '4px', wordBreak: 'break-word' }}>
              <strong style={{ color: indexColor }}>#{indexLabel}</strong> {task.title}
            </div>

            {task.details ? (
              <div style={{ color: detailsColor, fontSize: '13px', marginBottom: '6px', wordBreak: 'break-word' }}>
                {task.details}
              </div>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
              <span style={{ border: `1px solid ${chipBorder}`, color: chipText, borderRadius: '999px', padding: '2px 8px' }}>
                {task.category}
              </span>
              <span style={{ border: `1px solid ${chipBorder}`, color: chipText, borderRadius: '999px', padding: '2px 8px' }}>
                {task.frequency}
              </span>

              {!task.is_done ? (
                <span style={{ border: `1px solid ${chipBorder}`, color: chipText, borderRadius: '999px', padding: '2px 8px' }}>
                  Due: {formatDate(task.due_date)}
                </span>
              ) : (
                <span style={{ border: `1px solid ${chipBorder}`, color: chipText, borderRadius: '999px', padding: '2px 8px' }}>
                  Done: {formatDoneDate(task.completed_at)}
                </span>
              )}

              <span
                style={{
                  border: `1px solid ${chipBorder}`,
                  borderRadius: '999px',
                  padding: '2px 8px',
                  color: usePurple ? '#ddd6fe' : useAmber ? '#fde68a' : priorityColor(task.priority),
                }}
              >
                Priority: {task.priority}
              </span>

              {!task.is_done && !isArchivedOverdue ? (
                <span style={{ border: `1px solid ${chipBorder}`, color: chipText, borderRadius: '999px', padding: '2px 8px' }}>
                  Status: Open
                </span>
              ) : null}

              {isArchivedOverdue ? (
                <span style={{ border: `1px solid ${chipBorder}`, color: '#fca5a5', borderRadius: '999px', padding: '2px 8px' }}>
                  Status: Archived (Missed date)
                </span>
              ) : null}

              {task.is_done ? (
                <span
                  style={{
                    border: `1px solid ${chipBorder}`,
                    borderRadius: '999px',
                    padding: '2px 8px',
                    color: completionTimingColor(timing),
                  }}
                >
                  Status: {timing ? `Done (${timing})` : 'Done'}
                </span>
              ) : null}
            </div>
          </div>

          <div className="task-actions" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <details className="edit-details">
              <summary
                className="action-trigger"
                style={{
                  display: 'inline-block',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #22c55e',
                  background: '#14532d',
                  color: '#dcfce7',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                Edit
              </summary>

              <form
                action={updateTask}
                className="edit-form"
                style={{
                  marginTop: '10px',
                  display: 'grid',
                  gap: '8px',
                  width: '100%',
                  maxWidth: '100%',
                }}
              >
                <input type="hidden" name="id" value={task.id} />

                <input
                  name="title"
                  defaultValue={task.title}
                  required
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                    outline: 'none',
                  }}
                />

                <input
                  name="details"
                  defaultValue={task.details ?? ''}
                  placeholder="Details (optional)"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                    outline: 'none',
                  }}
                />

                <div className="edit-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <select
                    name="category"
                    defaultValue={task.category}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #166534',
                      background: '#010a03',
                      color: '#bbf7d0',
                    }}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    name="frequency"
                    defaultValue={task.frequency}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #166534',
                      background: '#010a03',
                      color: '#bbf7d0',
                    }}
                  >
                    {FREQUENCY_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    name="due_date"
                    defaultValue={task.due_date ?? ''}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #166534',
                      background: '#010a03',
                      color: '#bbf7d0',
                    }}
                  />

                  <select
                    name="priority"
                    defaultValue={task.priority}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #166534',
                      background: '#010a03',
                      color: '#bbf7d0',
                    }}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="action-trigger"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #22c55e',
                    background: '#14532d',
                    color: '#dcfce7',
                    cursor: 'pointer',
                  }}
                >
                  Save changes
                </button>
              </form>
            </details>

            <form action={toggleDone}>
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="next_done" value={task.is_done ? 'false' : 'true'} />
              <button
                type="submit"
                className="action-trigger"
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #22c55e',
                  background: task.is_done ? '#1f2937' : '#14532d',
                  color: '#dcfce7',
                  cursor: 'pointer',
                }}
              >
                {task.is_done ? 'Reopen' : 'Mark done'}
              </button>
            </form>

            <details className="delete-details">
              <summary
                className="action-trigger"
                style={{
                  display: 'inline-block',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: '1px solid #7f1d1d',
                  background: '#2b0b0b',
                  color: '#fecaca',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                Delete
              </summary>

              <form action={deleteTask} style={{ marginTop: '10px' }}>
                <input type="hidden" name="id" value={task.id} />
                <div style={{ fontSize: '12px', color: '#fca5a5', marginBottom: '6px' }}>
                  Confirm delete?
                </div>
                <button
                  type="submit"
                  className="action-trigger"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #b91c1c',
                    background: '#7f1d1d',
                    color: '#fee2e2',
                    cursor: 'pointer',
                  }}
                >
                  Confirm
                </button>
              </form>
            </details>
          </div>
        </div>
      </li>
    );
  }

  return (
    <main
      className={`${lexend.className} hq-main`}
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: '24px',
        background: '#020402',
        color: '#86efac',
      }}
    >
      <div
        className="hq-card"
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          background: '#031006',
          border: '1px solid #14532d',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 0 24px rgba(34,197,94,0.15)',
        }}
      >
        <style>{`
          .hq-layout {
            display: grid;
            grid-template-columns: 1fr 2fr;
            gap: 16px;
            align-items: start;
          }

          .hq-title {
            margin-top: 0;
            margin-bottom: 6px;
            font-size: 30px;
            color: #bbf7d0;
          }

          .task-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: flex-start;
          }

          .task-actions {
            display: flex;
            gap: 8px;
            align-items: flex-start;
            flex-wrap: wrap;
            flex-shrink: 0;
          }

          .tab-row {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 10px;
          }

          .filter-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .ring-wrap {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          @media (max-width: 900px) {
            .hq-layout {
              grid-template-columns: 1fr;
            }

            .task-row {
              flex-direction: column;
            }

            .task-actions {
              width: 100%;
            }

            .task-actions > form,
            .task-actions > details {
              width: 100%;
            }

            .action-trigger {
              width: 100% !important;
              display: block !important;
              text-align: center;
            }

            .edit-controls {
              display: grid !important;
              grid-template-columns: 1fr !important;
              gap: 8px !important;
            }

            .edit-controls > * {
              width: 100%;
            }
          }

          @media (max-width: 640px) {
            .hq-main {
              padding: 12px !important;
            }

            .hq-card {
              padding: 12px !important;
            }

            .hq-title {
              font-size: 24px !important;
              line-height: 1.2;
            }

            .tab-row {
              display: grid !important;
              grid-template-columns: 1fr 1fr;
              gap: 8px !important;
            }

            .tab-row a {
              display: block !important;
              text-align: center;
            }

            .filter-actions > * {
              width: 100%;
            }

            .ring-wrap {
              flex-direction: column;
              align-items: flex-start;
            }
          }
        `}</style>

        <h1 className="hq-title">
          Rich&apos;s Life HQ
        </h1>
        <p style={{ marginTop: 0, marginBottom: '4px', color: '#4ade80' }}>
          Responsibilities Dashboard (4-tab view)
        </p>
        <p style={{ marginTop: 0, marginBottom: '16px', color: '#c4b5fd', fontStyle: 'italic' }}>
          “{quoteOfTheDay}”
        </p>

        <div className="hq-layout">
          {/* LEFT: 1/3 */}
          <section
            style={{
              border: '1px solid #14532d',
              borderRadius: '10px',
              padding: '12px',
              background: '#020a04',
            }}
          >
            <div style={{ fontSize: '14px', marginBottom: '8px', color: '#bbf7d0' }}>Add Task</div>

            <form action={addTask}>
              <div style={{ display: 'grid', gap: '8px', marginBottom: '8px' }}>
                <input
                  name="title"
                  placeholder="Task title (required)"
                  required
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                    outline: 'none',
                  }}
                />
                <input
                  name="details"
                  placeholder="Details (optional)"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                <select
                  name="category"
                  defaultValue="Other"
                  style={{
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                  }}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <select
                  name="frequency"
                  defaultValue="one-time"
                  style={{
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                  }}
                >
                  {FREQUENCY_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  name="due_date"
                  style={{
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                  }}
                />

                <select
                  name="priority"
                  defaultValue="medium"
                  style={{
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: '#010a03',
                    color: '#bbf7d0',
                  }}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #22c55e',
                    background: '#14532d',
                    color: '#dcfce7',
                    cursor: 'pointer',
                  }}
                >
                  Add
                </button>
              </div>
            </form>

            <div
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid #14532d',
                fontSize: '14px',
                color: '#86efac',
              }}
            >
              Active Open: <strong style={{ color: '#dcfce7' }}>{activeOpenTasks.length}</strong>
              <br />
              Archive: <strong style={{ color: '#e9d5ff' }}>{archivedTasks.length}</strong>
              <br />
              {selectedCategories.length > 0 ? (
                <>
                  Filtered by: <strong style={{ color: '#fde68a' }}>{selectedCategories.join(', ')}</strong>
                </>
              ) : (
                <>Filtered by: <strong style={{ color: '#4ade80' }}>All categories</strong></>
              )}
            </div>

            <div
              style={{
                marginTop: '14px',
                paddingTop: '12px',
                borderTop: '1px solid #14532d',
              }}
            >
              <div style={{ fontSize: '14px', color: '#bbf7d0', marginBottom: '8px' }}>
                Today&apos;s Completion
              </div>

              <div className="ring-wrap">
                <svg width="120" height="120" viewBox="0 0 120 120" aria-label="Daily completion">
                  <circle cx="60" cy="60" r={ringRadius} fill="none" stroke="#14532d" strokeWidth="10" />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90 60 60)"
                    style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                  />
                  <text
                    x="60"
                    y="60"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#e9d5ff"
                    style={{ fontSize: '18px', fontWeight: 700 }}
                  >
                    {todayPercent}%
                  </text>
                </svg>

                <div style={{ fontSize: '13px', color: '#c4b5fd' }}>
                  <div>
                    Done today: <strong>{doneDueToday}</strong> / <strong>{todayTotal}</strong>
                  </div>
                  <div style={{ marginTop: '4px', color: '#a78bfa' }}>
                    {todayTotal === 0
                      ? 'No tasks due today'
                      : todayPercent === 100
                        ? 'All done 🎉'
                        : 'Keep going'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT: 2/3 */}
          <section
            style={{
              border: '1px solid #14532d',
              borderRadius: '10px',
              padding: '12px',
              background: '#020a04',
            }}
          >
            {error && (
              <p
                style={{
                  color: '#fecaca',
                  background: '#7f1d1d',
                  border: '1px solid #b91c1c',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginTop: 0,
                }}
              >
                Error: {error.message}
              </p>
            )}

            {!error && (
              <>
                <form method="get" style={{ marginBottom: '12px', border: '1px solid #14532d', borderRadius: '8px', padding: '10px' }}>
                  <input type="hidden" name="tab" value={activeTab} />
                  <div style={{ fontSize: '13px', color: '#bbf7d0', marginBottom: '8px' }}>
                    Filter by category (select one or more)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    {CATEGORY_OPTIONS.map((cat) => {
                      const checked = selectedCategorySet.has(cat);
                      return (
                        <label
                          key={cat}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '12px',
                            border: '1px solid #166534',
                            borderRadius: '999px',
                            padding: '4px 8px',
                            color: checked ? '#dcfce7' : '#86efac',
                            background: checked ? '#14532d' : '#031006',
                          }}
                        >
                          <input type="checkbox" name="cats" value={cat} defaultChecked={checked} />
                          {cat}
                        </label>
                      );
                    })}
                  </div>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #22c55e',
                        background: '#14532d',
                        color: '#dcfce7',
                        cursor: 'pointer',
                      }}
                    >
                      Apply Filter
                    </button>
                    <a
                      href={`/?tab=${activeTab}`}
                      style={{
                        display: 'inline-block',
                        textDecoration: 'none',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid #166534',
                        background: '#031006',
                        color: '#86efac',
                        fontSize: '14px',
                        textAlign: 'center',
                      }}
                    >
                      Clear Filter
                    </a>
                  </div>
                </form>

                <div className="tab-row">
                  <a href={buildTabHref('today')} style={tabStyle(activeTab === 'today')}>
                    Due Today ({dueToday.length})
                  </a>
                  <a href={buildTabHref('tomorrow')} style={tabStyle(activeTab === 'tomorrow')}>
                    Due Tomorrow ({dueTomorrow.length})
                  </a>
                  <a href={buildTabHref('later')} style={tabStyle(activeTab === 'later')}>
                    Beyond Tomorrow ({beyondTomorrow.length})
                  </a>
                  <a href={buildTabHref('archive')} style={tabStyle(activeTab === 'archive', 'purple')}>
                    Archive ({archivedTasks.length})
                  </a>
                </div>

                <h2
                  style={{
                    marginTop: 0,
                    marginBottom: '8px',
                    color: activeTab === 'archive' ? '#c4b5fd' : '#bbf7d0',
                  }}
                >
                  {activeTitle}
                </h2>

                {rankedActiveTasks.length === 0 ? (
                  <p style={{ color: activeTab === 'archive' ? '#a78bfa' : '#4ade80' }}>
                    No tasks in this tab.
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {rankedActiveTasks.map((task, i) => renderTask(task, i + 1))}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}