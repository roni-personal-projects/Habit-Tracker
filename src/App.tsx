import { AnimatePresence, motion } from "framer-motion";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { cn } from "./utils/cn";

type Habit = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

type HabitLogs = Record<string, string[]>;

type StoredHabitState = {
  habits: Habit[];
  logs: HabitLogs;
};

type WeeklyPoint = {
  key: string;
  label: string;
  count: number;
  rate: number;
  isSelected: boolean;
};

type MonthCell = {
  key: string;
  day: number;
  count: number;
  rate: number;
  isFuture: boolean;
  isSelected: boolean;
};

const STORAGE_KEY = "stride-habit-tracker-v1";
const COLOR_OPTIONS = ["#4f46e5", "#0891b2", "#16a34a", "#ea580c", "#db2777", "#7c3aed"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const shortDayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function clampDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function addDays(date: Date, amount: number) {
  const nextDate = clampDate(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function isHabitComplete(logs: HabitLogs, habitId: string, dateKey: string) {
  return logs[habitId]?.includes(dateKey) ?? false;
}

function toggleHabitDate(logs: HabitLogs, habitId: string, dateKey: string) {
  const existing = new Set(logs[habitId] ?? []);

  if (existing.has(dateKey)) {
    existing.delete(dateKey);
  } else {
    existing.add(dateKey);
  }

  return {
    ...logs,
    [habitId]: Array.from(existing).sort(),
  };
}

function getCurrentStreak(entries: string[], todayKey: string) {
  const completedDays = new Set(entries);

  if (!completedDays.has(todayKey)) {
    return 0;
  }

  let streak = 0;
  let cursor = getDateFromKey(todayKey);

  while (completedDays.has(formatDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function getLongestStreak(entries: string[]) {
  const uniqueEntries = Array.from(new Set(entries)).sort();

  if (!uniqueEntries.length) {
    return 0;
  }

  let best = 1;
  let running = 1;

  for (let index = 1; index < uniqueEntries.length; index += 1) {
    const previous = getDateFromKey(uniqueEntries[index - 1]);
    const expectedNext = formatDateKey(addDays(previous, 1));

    if (uniqueEntries[index] === expectedNext) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 1;
    }
  }

  return best;
}

function createSeedState(): StoredHabitState {
  const today = clampDate(new Date());
  const habits: Habit[] = [
    { id: createId(), name: "Drink water before coffee", color: "#4f46e5", createdAt: formatDateKey(today) },
    { id: createId(), name: "Move for 20 minutes", color: "#0891b2", createdAt: formatDateKey(today) },
    { id: createId(), name: "Read 15 pages", color: "#16a34a", createdAt: formatDateKey(today) },
    { id: createId(), name: "Wind down by 11 PM", color: "#db2777", createdAt: formatDateKey(today) },
  ];

  const patterns = [
    (offset: number) => ![5, 12, 18, 26, 33].includes(offset),
    (offset: number) => offset % 2 === 0 || offset % 5 === 0 || offset === 1,
    (offset: number) => offset % 3 !== 1 || offset < 2,
    (offset: number) => offset % 4 !== 0 || offset === 0,
  ];

  const logs: HabitLogs = {};

  habits.forEach((habit, index) => {
    logs[habit.id] = [];

    for (let offset = 45; offset >= 0; offset -= 1) {
      if (patterns[index](offset)) {
        logs[habit.id].push(formatDateKey(addDays(today, -offset)));
      }
    }
  });

  return { habits, logs };
}

function loadStoredState() {
  if (typeof window === "undefined") {
    return createSeedState();
  }

  const fallback = createSeedState();

  try {
    const rawState = window.localStorage.getItem(STORAGE_KEY);

    if (!rawState) {
      return fallback;
    }

    const parsed = JSON.parse(rawState) as Partial<StoredHabitState>;

    if (!Array.isArray(parsed.habits) || typeof parsed.logs !== "object" || parsed.logs === null) {
      return fallback;
    }

    const habits = parsed.habits
      .filter((habit): habit is Habit => {
        return (
          typeof habit?.id === "string" &&
          typeof habit?.name === "string" &&
          typeof habit?.color === "string" &&
          typeof habit?.createdAt === "string"
        );
      })
      .map((habit) => ({
        ...habit,
        name: habit.name.trim() || "Untitled habit",
      }));

    const logs = habits.reduce<HabitLogs>((accumulator, habit) => {
      const entries = Array.isArray(parsed.logs?.[habit.id]) ? parsed.logs[habit.id] : [];
      accumulator[habit.id] = entries.filter((entry): entry is string => typeof entry === "string").sort();
      return accumulator;
    }, {});

    return habits.length ? { habits, logs } : fallback;
  } catch {
    return fallback;
  }
}

function getHeatColor(rate: number, isFuture: boolean) {
  if (isFuture) {
    return "rgba(255,255,255,0.55)";
  }

  if (rate <= 0) {
    return "rgba(255,255,255,0.96)";
  }

  return `rgba(79,70,229,${0.18 + rate * 0.7})`;
}

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function ProgressRing({ value, completed, total }: { value: number; completed: number; total: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value);

  return (
    <div className="relative flex items-center justify-center">
      <svg className="size-40 -rotate-90" viewBox="0 0 128 128" fill="none">
        <circle cx="64" cy="64" r={radius} stroke="rgba(226,232,240,1)" strokeWidth="12" />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          stroke="#4f46e5"
          strokeWidth="12"
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <div className="absolute space-y-1 text-center">
        <div className="text-3xl font-semibold tracking-tight text-slate-900">{Math.round(value * 100)}%</div>
        <div className="text-sm text-slate-500">
          {completed} of {total || 0} habits
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [habitState, setHabitState] = useState<StoredHabitState>(() => loadStoredState());
  const [habitName, setHabitName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLOR_OPTIONS[0]);
  const todayKey = useMemo(() => formatDateKey(clampDate(new Date())), []);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);

  const { habits, logs } = habitState;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(habitState));
  }, [habitState]);

  const selectedDate = useMemo(() => getDateFromKey(selectedDateKey), [selectedDateKey]);

  const selectedDayCompletedCount = useMemo(() => {
    return habits.filter((habit) => isHabitComplete(logs, habit.id, selectedDateKey)).length;
  }, [habits, logs, selectedDateKey]);

  const selectedDayCompletionRate = habits.length ? selectedDayCompletedCount / habits.length : 0;

  const liveStreak = useMemo(() => {
    return habits.length
      ? Math.max(...habits.map((habit) => getCurrentStreak(logs[habit.id] ?? [], todayKey)))
      : 0;
  }, [habits, logs, todayKey]);

  const completedThisMonth = useMemo(() => {
    const selectedMonth = selectedDate.getMonth();
    const selectedYear = selectedDate.getFullYear();

    return habits.reduce((total, habit) => {
      return (
        total +
        (logs[habit.id] ?? []).filter((entry) => {
          const date = getDateFromKey(entry);
          return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
        }).length
      );
    }, 0);
  }, [habits, logs, selectedDate]);

  const weeklyData = useMemo<WeeklyPoint[]>(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(selectedDate, index - 6);
      const key = formatDateKey(date);
      const count = habits.reduce((total, habit) => total + Number(isHabitComplete(logs, habit.id, key)), 0);

      return {
        key,
        label: shortDayFormatter.format(date),
        count,
        rate: habits.length ? count / habits.length : 0,
        isSelected: key === selectedDateKey,
      };
    });
  }, [habits, logs, selectedDate, selectedDateKey]);

  const monthlyChart = useMemo(() => {
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12);
    const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 12).getDate();
    const startPadding = (monthStart.getDay() + 6) % 7;
    const cells: Array<MonthCell | null> = Array.from({ length: startPadding }, () => null);

    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day, 12);
      const key = formatDateKey(cellDate);
      const count = habits.reduce((total, habit) => total + Number(isHabitComplete(logs, habit.id, key)), 0);

      cells.push({
        key,
        day,
        count,
        rate: habits.length ? count / habits.length : 0,
        isFuture: key > todayKey,
        isSelected: key === selectedDateKey,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return {
      label: monthFormatter.format(monthStart),
      cells,
    };
  }, [habits, logs, selectedDate, selectedDateKey, todayKey]);

  const selectedHabitStatuses = useMemo(() => {
    return habits.map((habit) => {
      const completed = isHabitComplete(logs, habit.id, selectedDateKey);
      const currentStreak = getCurrentStreak(logs[habit.id] ?? [], todayKey);
      const longestStreak = getLongestStreak(logs[habit.id] ?? []);

      return {
        habit,
        completed,
        currentStreak,
        longestStreak,
      };
    });
  }, [habits, logs, selectedDateKey, todayKey]);

  function shiftSelectedDate(amount: number) {
    setSelectedDateKey((currentKey) => {
      const nextKey = formatDateKey(addDays(getDateFromKey(currentKey), amount));
      return nextKey > todayKey ? todayKey : nextKey;
    });
  }

  function handleAddHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = habitName.trim();

    if (!name) {
      return;
    }

    const newHabit: Habit = {
      id: createId(),
      name: name.slice(0, 42),
      color: selectedColor,
      createdAt: todayKey,
    };

    setHabitState((currentState) => ({
      habits: [newHabit, ...currentState.habits],
      logs: {
        ...currentState.logs,
        [newHabit.id]: [],
      },
    }));

    setHabitName("");
  }

  function handleToggleHabit(habitId: string) {
    setHabitState((currentState) => ({
      ...currentState,
      logs: toggleHabitDate(currentState.logs, habitId, selectedDateKey),
    }));
  }

  function handleDeleteHabit(habitId: string) {
    setHabitState((currentState) => {
      const nextLogs = { ...currentState.logs };
      delete nextLogs[habitId];

      return {
        habits: currentState.habits.filter((habit) => habit.id !== habitId),
        logs: nextLogs,
      };
    });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(79,70,229,0.12),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] text-slate-900">
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8"
        >
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-indigo-600">Stride</p>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  Habit tracking that keeps streaks, daily wins, and long-term patterns in one view.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  Add custom habits, check off any day, and watch your daily, weekly, and monthly charts update instantly.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => shiftSelectedDate(-1)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
                  >
                    Previous day
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDateKey(todayKey)}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:bg-slate-100"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftSelectedDate(1)}
                    disabled={selectedDateKey === todayKey}
                    className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next day
                  </button>
                </div>
                <div className="text-sm text-slate-500">{fullDateFormatter.format(selectedDate)}</div>
              </div>
            </div>

            <div className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-5 sm:p-6">
              <div className="flex items-center justify-center">
                <ProgressRing
                  value={selectedDayCompletionRate}
                  completed={selectedDayCompletedCount}
                  total={habits.length}
                />
              </div>
              <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3 sm:gap-4">
                <div>
                  <div className="text-slate-400">Live streak</div>
                  <div className="text-lg font-semibold text-slate-900">{liveStreak} days</div>
                </div>
                <div>
                  <div className="text-slate-400">Custom habits</div>
                  <div className="text-lg font-semibold text-slate-900">{habits.length}</div>
                </div>
                <div>
                  <div className="text-slate-400">Month check-ins</div>
                  <div className="text-lg font-semibold text-slate-900">{completedThisMonth}</div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <motion.section
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
            className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur"
          >
            <SectionHeading
              title="Habits"
              subtitle="Toggle completion for the selected day and keep streaks visible at a glance."
              action={
                <div className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                  {selectedDayCompletedCount}/{habits.length || 0} done
                </div>
              }
            />

            <div className="mt-6 space-y-4">
              {habits.length ? (
                <AnimatePresence mode="popLayout">
                  {selectedHabitStatuses.map(({ habit, completed, currentStreak, longestStreak }) => (
                    <motion.div
                      key={habit.id}
                      layout
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      className="rounded-[1.5rem] border border-slate-200 bg-slate-50/85 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex items-center gap-3">
                            <span
                              className="size-3 rounded-full"
                              style={{ backgroundColor: habit.color }}
                              aria-hidden="true"
                            />
                            <h3 className="truncate text-lg font-medium tracking-tight text-slate-900">{habit.name}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                            <span>{currentStreak} day streak</span>
                            <span>Best streak {longestStreak} days</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => handleToggleHabit(habit.id)}
                            className={cn(
                              "inline-flex items-center gap-3 rounded-full border px-4 py-2 text-sm font-medium transition",
                              completed
                                ? "border-transparent text-white shadow-lg shadow-indigo-200"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900"
                            )}
                            style={completed ? { backgroundColor: habit.color } : undefined}
                            aria-pressed={completed}
                          >
                            <span
                              className={cn(
                                "grid size-5 place-items-center rounded-full border transition",
                                completed ? "border-white/40 bg-white/15" : "border-slate-300 bg-slate-50"
                              )}
                            >
                              <motion.span
                                animate={{ scale: completed ? 1 : 0.2, opacity: completed ? 1 : 0 }}
                                transition={{ duration: 0.18 }}
                                className="size-2 rounded-full bg-white"
                              />
                            </span>
                            {completed ? "Completed" : "Mark done"}
                          </motion.button>
                          <button
                            type="button"
                            onClick={() => handleDeleteHabit(habit.id)}
                            className="rounded-full px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label={`Delete ${habit.name}`}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-sm text-slate-500">
                  Add your first custom habit to start tracking streaks and charts.
                </div>
              )}
            </div>

            <form onSubmit={handleAddHabit} className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
              <SectionHeading
                title="Add custom habit"
                subtitle="Create a habit in one step, choose a color, and it will appear in every chart."
              />

              <div className="mt-4 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">Habit name</span>
                  <input
                    value={habitName}
                    onChange={(event) => setHabitName(event.target.value)}
                    maxLength={42}
                    placeholder="Meditate for 10 minutes"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">Color</span>
                  <div className="flex flex-wrap gap-3">
                    {COLOR_OPTIONS.map((color) => {
                      const isActive = color === selectedColor;

                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setSelectedColor(color)}
                          className={cn(
                            "grid size-10 place-items-center rounded-full border transition",
                            isActive ? "border-slate-900 bg-white shadow-sm" : "border-transparent bg-white hover:border-slate-200"
                          )}
                          aria-label={`Choose color ${color}`}
                          aria-pressed={isActive}
                        >
                          <span className="size-5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Add habit
                </button>
              </div>
            </form>
          </motion.section>

          <div className="grid gap-6">
            <motion.section
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.14, ease: "easeOut" }}
              className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur"
            >
              <SectionHeading
                title="Daily habits chart"
                subtitle="A habit-by-habit read of the selected day, with live streak context beside each one."
              />

              <div className="mt-6 space-y-4">
                {selectedHabitStatuses.length ? (
                  selectedHabitStatuses.map(({ habit, completed, currentStreak }) => (
                    <div key={habit.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium text-slate-800">{habit.name}</span>
                          <span className="text-slate-500">{completed ? "Done" : "Open"}</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: habit.color }}
                            initial={{ width: 0 }}
                            animate={{ width: completed ? "100%" : "0%" }}
                            transition={{ duration: 0.45, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                      <div className="text-sm text-slate-500">{currentStreak} day streak</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-sm text-slate-500">
                    Daily progress appears here once you add a habit.
                  </div>
                )}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2, ease: "easeOut" }}
              className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur"
            >
              <SectionHeading
                title="Weekly habits chart"
                subtitle="Seven days ending on the selected date, showing how many habits you completed each day."
              />

              <div className="mt-6 flex h-72 items-end gap-3">
                {weeklyData.map((point, index) => (
                  <div key={point.key} className="flex flex-1 flex-col items-center gap-3">
                    <div className="w-full text-center text-sm text-slate-400">{point.count}</div>
                    <div className="relative flex h-44 w-full items-end overflow-hidden rounded-[1.25rem] bg-slate-100">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(point.rate * 100, point.count ? 16 : 0)}%` }}
                        transition={{ duration: 0.55, delay: index * 0.04, ease: "easeOut" }}
                        className={cn(
                          "absolute inset-x-0 bottom-0 rounded-[1.25rem]",
                          point.isSelected ? "bg-slate-950" : "bg-indigo-500"
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDateKey(point.key)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition",
                        point.isSelected ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {point.label}
                    </button>
                  </div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.26, ease: "easeOut" }}
              className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur"
            >
              <SectionHeading
                title="Monthly habits chart"
                subtitle="A clickable month view. Darker cells mean more habits completed on that day."
                action={<div className="text-sm font-medium text-slate-500">{monthlyChart.label}</div>}
              />

              <div className="mt-6 grid grid-cols-7 gap-2">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="px-1 pb-2 text-center text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                    {label}
                  </div>
                ))}

                {monthlyChart.cells.map((cell, index) => {
                  if (!cell) {
                    return <div key={`empty-${index}`} className="aspect-square rounded-2xl bg-transparent" />;
                  }

                  return (
                    <motion.button
                      key={cell.key}
                      type="button"
                      whileTap={{ scale: cell.isFuture ? 1 : 0.97 }}
                      onClick={() => {
                        if (!cell.isFuture) {
                          setSelectedDateKey(cell.key);
                        }
                      }}
                      className={cn(
                        "aspect-square rounded-2xl border text-sm font-medium transition",
                        cell.isSelected ? "border-slate-950 text-white shadow-sm" : "border-slate-200 text-slate-700",
                        cell.isFuture ? "cursor-not-allowed border-dashed text-slate-300" : "hover:border-slate-400"
                      )}
                      style={{
                        backgroundColor: cell.isSelected ? "#0f172a" : getHeatColor(cell.rate, cell.isFuture),
                      }}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.22, delay: index * 0.01 }}
                      aria-label={`${cell.day} ${monthlyChart.label}: ${cell.count} habits completed`}
                    >
                      <div className="flex h-full flex-col items-center justify-center">
                        <span>{cell.day}</span>
                        <span className={cn("text-[11px]", cell.isSelected ? "text-white/70" : "text-slate-400")}>{cell.count}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.section>
          </div>
        </div>
      </main>
    </div>
  );
}
