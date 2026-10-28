"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Check, Copy, UtensilsCrossed, Plus, X, ShoppingCart, Sparkles, Loader2, Printer } from "lucide-react";
import { isSameDay } from "date-fns";
import { useHome } from "@/store/useHome";
import { Button, Card, Eyebrow, Field, Modal, Segmented, cx, inputCls, selectCls } from "./ui";
import { COURSES, COURSE_LABEL, COURSE_SINGULAR, SLOTS, SLOT_LABEL, copyWeek, describeMeal, dishFrequency, groceryFor, itemsOn, mealAt, weekDays, ymd } from "@/lib/calendar";
import { guessDish, normalizeIngredient, parseDishList } from "@/lib/ingredients";
import type { CalendarItem, Course, Dish, MealComponent, MealSlot } from "@/lib/types";
import { uid } from "@/lib/storage/adapter";

export function CalendarView({ today }: { today: Date }) {
  const { data: d, update } = useHome();
  const data = d!;
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<"week" | "grocery" | "dishes">("week");
  const days = weekDays(today, offset);
  const [mealEdit, setMealEdit] = useState<{ date: string; slot: MealSlot; item?: CalendarItem } | null>(null);
  const [itemEdit, setItemEdit] = useState<{ date: string; item?: CalendarItem } | null>(null);
  const dishes = data.dishes ?? [];

  const saveItem = (it: CalendarItem) => update((h) => ({ ...h, calendar: (h.calendar ?? []).some((x) => x.id === it.id) ? (h.calendar ?? []).map((x) => (x.id === it.id ? it : x)) : [...(h.calendar ?? []), it] }), `planned ${it.title}`);
  const removeItem = (id: string) => update((h) => ({ ...h, calendar: (h.calendar ?? []).filter((x) => x.id !== id) }), "removed a calendar item");
  const toggleDone = (it: CalendarItem) => update((h) => ({ ...h, calendar: (h.calendar ?? []).map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)) }), it.done ? `reopened ${it.title}` : `done: ${it.title}`);
  const copyLastWeek = () => update((h) => ({ ...h, calendar: [...(h.calendar ?? []), ...copyWeek(h, weekDays(today, offset - 1), days, uid)] }), "copied last week's plan");

  const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const plannedMeals = days.reduce((n, day) => n + itemsOn(data, ymd(day)).filter((i) => i.kind === "meal").length, 0);
  const openTodos = (data.calendar ?? []).filter((i) => i.kind !== "meal" && !i.done && i.date >= ymd(days[0]) && i.date <= ymd(days[6])).length;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Home calendar</h1>
        <div className="w-72"><Segmented size="sm" value={tab} onChange={setTab} options={[{ id: "week", label: "Week" }, { id: "grocery", label: "Grocery" }, { id: "dishes", label: "Dishes" }]} /></div>
      </div>

      {tab === "dishes" && <DishLibrary />}
      {tab === "grocery" && <GroceryList days={days} offset={offset} setOffset={setOffset} weekLabel={weekLabel} />}

      {tab === "week" && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button onClick={() => setOffset(offset - 1)} aria-label="Previous week" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronLeft size={16} /></button>
              <button onClick={() => setOffset(0)} className={cx("h-10 px-3 rounded-[10px] border text-[13px] font-semibold", offset === 0 ? "bg-ink text-white border-ink" : "bg-card border-line hover:border-field")}>{offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `${offset > 0 ? "+" : ""}${offset} wk`}</button>
              <button onClick={() => setOffset(offset + 1)} aria-label="Next week" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronRight size={16} /></button>
              <div className="ml-2 text-[13px] text-muted">{weekLabel}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-muted hidden md:block">{plannedMeals} meal{plannedMeals === 1 ? "" : "s"} planned · {openTodos} to-do{openTodos === 1 ? "" : "s"} open</div>
              <Button variant="secondary" onClick={copyLastWeek} className="h-9 px-3 text-xs"><Copy size={13} className="inline -mt-0.5 mr-1" />Copy last week</Button>
            </div>
          </div>

          {dishes.length === 0 && (
            <Card className="p-4 flex items-center gap-3 border-accent-line bg-accent-bg/40">
              <UtensilsCrossed size={18} className="text-accent shrink-0" />
              <div className="text-[13px] flex-1">Start with your <b>Favorite dishes</b> — mains, sides, meats, veggies, desserts. Then planning a meal is a couple of taps.</div>
              <Button onClick={() => setTab("dishes")} className="h-9 px-3 text-xs">Add dishes</Button>
            </Card>
          )}

          {/* Desktop: 7-column grid. Mobile: stacked days. */}
          <div className="hidden md:grid md:grid-cols-7 gap-2">
            {days.map((day) => <DayColumn key={ymd(day)} day={day} today={today} data={data} onMeal={(slot, item) => setMealEdit({ date: ymd(day), slot, item })} onItem={(item) => setItemEdit({ date: ymd(day), item })} onToggle={toggleDone} />)}
          </div>
          <div className="md:hidden flex flex-col gap-3">
            {days.map((day) => <DayColumn key={ymd(day)} day={day} today={today} data={data} onMeal={(slot, item) => setMealEdit({ date: ymd(day), slot, item })} onItem={(item) => setItemEdit({ date: ymd(day), item })} onToggle={toggleDone} />)}
          </div>
        </>
      )}

      {mealEdit && <MealEditor date={mealEdit.date} slot={mealEdit.slot} item={mealEdit.item} today={today} onClose={() => setMealEdit(null)} onSave={saveItem} onRemove={removeItem} />}
      {itemEdit && <ItemEditor date={itemEdit.date} item={itemEdit.item} onClose={() => setItemEdit(null)} onSave={saveItem} onRemove={removeItem} />}
    </>
  );
}

function DayColumn({ day, today, data, onMeal, onItem, onToggle }: { day: Date; today: Date; data: NonNullable<ReturnType<typeof useHome.getState>["data"]>; onMeal: (slot: MealSlot, item?: CalendarItem) => void; onItem: (item?: CalendarItem) => void; onToggle: (it: CalendarItem) => void }) {
  const key = ymd(day);
  const isToday = isSameDay(day, today);
  const todos = itemsOn(data, key).filter((i) => i.kind !== "meal");
  return (
    <Card className={cx("flex flex-col", isToday && "border-accent")}>
      <div className={cx("px-3 py-2 border-b border-line-soft flex items-baseline justify-between", isToday && "bg-accent-bg")}>
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
        <div className={cx("text-sm font-bold", isToday && "text-accent")}>{day.getDate()}</div>
      </div>
      <div className="flex flex-col divide-y divide-line-soft">
        {SLOTS.filter((s) => s !== "snack" || mealAt(data, key, "snack")).map((slot) => {
          const m = mealAt(data, key, slot);
          const desc = m ? describeMeal(data, m) : null;
          return (
            <button key={slot} onClick={() => onMeal(slot, m)} className="text-left px-3 py-2 hover:bg-surface/60 min-h-[52px]">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.04em]">{SLOT_LABEL[slot]}</div>
              {desc ? (
                <div className={cx("text-[12px]", m?.done && "line-through text-muted")}>
                  <div className="font-semibold">{desc.main}</div>
                  {desc.parts.map((p) => <div key={p.course} className="text-[11px] text-muted leading-snug">{COURSE_LABEL[p.course].toLowerCase()}: {p.names.join(", ")}</div>)}
                </div>
              ) : <div className="text-[12px] text-field">+ plan</div>}
            </button>
          );
        })}
        {!mealAt(data, key, "snack") && <button onClick={() => onMeal("snack")} className="text-left px-3 py-1.5 text-[10px] text-muted hover:text-accent">+ snack</button>}
        <div className="px-3 py-2 flex flex-col gap-1">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.04em]">Projects & to-dos</div>
          {todos.map((t) => (
            <div key={t.id} className="flex items-start gap-1.5">
              <button onClick={() => onToggle(t)} aria-label={t.done ? "Mark not done" : "Mark done"} className={cx("w-4 h-4 mt-0.5 rounded-[4px] border flex items-center justify-center shrink-0", t.done ? "bg-green border-green" : "border-field bg-card")}>{t.done && <Check size={10} className="text-white" strokeWidth={3} />}</button>
              <button onClick={() => onItem(t)} className={cx("text-left text-[12px] leading-snug flex-1", t.done && "line-through text-muted")}>{t.title}{t.assignee && <span className="text-muted"> · {t.assignee}</span>}</button>
            </div>
          ))}
          <button onClick={() => onItem()} className="text-left text-[11px] text-field hover:text-accent">+ add</button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------ Meal editor ------------------------------ */

function MealEditor({ date, slot, item, today, onClose, onSave, onRemove }: { date: string; slot: MealSlot; item?: CalendarItem; today: Date; onClose: () => void; onSave: (it: CalendarItem) => void; onRemove: (id: string) => void }) {
  const { data: d, update } = useHome();
  const data = d!;
  const dishes = data.dishes ?? [];
  const freq = dishFrequency(data, today);
  const [mainId, setMainId] = useState(item?.dishId ?? "");
  const [components, setComponents] = useState<MealComponent[]>(item?.components ?? []);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [newDish, setNewDish] = useState<{ course: Course; name: string } | null>(null);
  const byCourse = (c: Course) => dishes.filter((x) => x.course === c);
  const addQuick = (course: Course, name: string) => {
    const dish: Dish = { id: uid(), name: name.trim(), course };
    update((h) => ({ ...h, dishes: [...(h.dishes ?? []), dish] }), `added dish ${dish.name}`);
    if (course === "main") setMainId(dish.id); else setComponents([...components, { course, dishId: dish.id }]);
    setNewDish(null);
  };
  const main = dishes.find((x) => x.id === mainId);
  const pretty = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <Modal open onClose={onClose} title={`${SLOT_LABEL[slot]} · ${pretty}`}>
      <Field label="Main dish">
        <div className="flex gap-2">
          <select className={selectCls} value={mainId} onChange={(e) => setMainId(e.target.value)}>
            <option value="">Choose a main…</option>
            {byCourse("main").map((x) => <option key={x.id} value={x.id}>{x.name}{freq[x.id] ? ` · ${freq[x.id]}× this month` : ""}</option>)}
          </select>
          <button onClick={() => setNewDish({ course: "main", name: "" })} aria-label="New main dish" className="w-11 h-11 rounded-[12px] border border-chip bg-card flex items-center justify-center shrink-0 hover:border-field"><Plus size={16} /></button>
        </div>
      </Field>
      {COURSES.filter((c) => c !== "main").map((course) => {
        const chosen = components.filter((x) => x.course === course);
        const options = byCourse(course).filter((x) => !chosen.some((c) => c.dishId === x.id));
        return (
          <div key={course} className="flex flex-col gap-1.5">
            <div className="text-xs font-semibold text-muted">{COURSE_LABEL[course]}</div>
            <div className="flex flex-wrap gap-1.5">
              {chosen.map((c) => { const dish = dishes.find((x) => x.id === c.dishId); return (
                <span key={c.dishId} className="inline-flex items-center gap-1 h-8 pl-2.5 pr-1 rounded-full bg-accent-bg border border-accent-line text-xs font-semibold text-accent-deep">{dish?.name ?? "?"}<button onClick={() => setComponents(components.filter((x) => x !== c))} aria-label={`Remove ${dish?.name}`} className="w-6 h-6 rounded-full hover:bg-accent-soft flex items-center justify-center"><X size={12} /></button></span>
              ); })}
              <select className={cx(selectCls, "h-8 w-auto text-xs py-0 pr-8")} value="" onChange={(e) => { if (e.target.value === "__new") setNewDish({ course, name: "" }); else if (e.target.value) setComponents([...components, { course, dishId: e.target.value }]); }}>
                <option value="">+ add {COURSE_SINGULAR[course]}</option>
                {options.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                <option value="__new">＋ New {COURSE_SINGULAR[course]}…</option>
              </select>
            </div>
          </div>
        );
      })}
      {newDish && (
        <div className="flex gap-2 items-end rounded-[12px] border border-accent-line bg-accent-bg/50 p-3">
          <Field label={`New ${COURSE_SINGULAR[newDish.course]} (saved to Favorite dishes)`}><input autoFocus className={inputCls} value={newDish.name} onChange={(e) => setNewDish({ ...newDish, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && newDish.name.trim()) addQuick(newDish.course, newDish.name); }} placeholder={newDish.course === "main" ? "Tacos" : newDish.course === "side" ? "Rice" : newDish.course === "meat" ? "Ground beef" : newDish.course === "veggie" ? "Peppers & onions" : newDish.course === "dessert" ? "Churros" : "Agua fresca"} /></Field>
          <Button disabled={!newDish.name.trim()} onClick={() => addQuick(newDish.course, newDish.name)}>Add</Button>
          <Button variant="ghost" onClick={() => setNewDish(null)}>Cancel</Button>
        </div>
      )}
      <Field label="Notes (optional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Prep the night before" /></Field>
      <div className="flex gap-2 pt-1">
        {item && <Button variant="danger" onClick={() => { onRemove(item.id); onClose(); }}>Remove</Button>}
        <Button className="flex-1" disabled={!main} onClick={() => { onSave({ id: item?.id ?? uid(), date, kind: "meal", slot, dishId: main!.id, title: main!.name, components, notes: notes || undefined, done: item?.done }); onClose(); }}>Save meal</Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Project / event editor ------------------------------ */

function ItemEditor({ date, item, onClose, onSave, onRemove }: { date: string; item?: CalendarItem; onClose: () => void; onSave: (it: CalendarItem) => void; onRemove: (id: string) => void }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<"project" | "event">(item?.kind === "event" ? "event" : "project");
  const [when, setWhen] = useState(item?.date ?? date);
  const [assignee, setAssignee] = useState(item?.assignee ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  return (
    <Modal open onClose={onClose} title={item ? "Edit" : "Add to the calendar"}>
      <Field label="What"><input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix the gate latch · Dentist 3pm · Meal prep" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as "project")}><option value="project">Project / to-do</option><option value="event">Event</option></select></Field>
        <Field label="Date"><input className={inputCls} type="date" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Who (optional)"><input className={inputCls} value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Abraham" /></Field>
        <Field label="Notes (optional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2 pt-1">
        {item && <Button variant="danger" onClick={() => { onRemove(item.id); onClose(); }}>Remove</Button>}
        <Button className="flex-1" disabled={!title.trim()} onClick={() => { onSave({ id: item?.id ?? uid(), date: when, kind, title: title.trim(), assignee: assignee || undefined, notes: notes || undefined, done: item?.done }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}

/* ------------------------------ Dish library ------------------------------ */

function DishLibrary() {
  const { data: d, update } = useHome();
  const data = d!;
  const dishes = data.dishes ?? [];
  const [editing, setEditing] = useState<Dish | { course: Course } | null>(null);
  const save = (x: Dish) => update((h) => ({ ...h, dishes: (h.dishes ?? []).some((y) => y.id === x.id) ? (h.dishes ?? []).map((y) => (y.id === x.id ? x : y)) : [...(h.dishes ?? []), x] }), `saved dish ${x.name}`);
  const remove = (id: string) => update((h) => ({ ...h, dishes: (h.dishes ?? []).filter((y) => y.id !== id) }), "removed a dish");
  const [importing, setImporting] = useState(false);
  const missingIngredients = dishes.filter((x) => !x.ingredients?.length).length;
  return (
    <>
      <div className="text-[13px] text-muted leading-snug">Your household menu, itemized by course. A planned meal is a main dish plus any number of sides, meats, veggies, desserts and drinks from here. Each dish carries its ingredients, which roll up into the week&apos;s grocery list.</div>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setImporting(true)} className="h-10 px-4 text-[13px]"><Sparkles size={14} className="inline -mt-0.5 mr-1.5" />Paste a list of dishes</Button>
        {missingIngredients > 0 && <div className="text-xs text-muted self-center">{missingIngredients} dish{missingIngredients === 1 ? "" : "es"} without ingredients — open one and tap <b>Suggest</b>.</div>}
      </div>
      <div className="md:grid md:grid-cols-3 md:gap-4 flex flex-col gap-4">
        {COURSES.map((course) => {
          const list = dishes.filter((x) => x.course === course).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={course} className="flex flex-col gap-2">
              <div className="flex items-center justify-between"><Eyebrow>{COURSE_LABEL[course]} · {list.length}</Eyebrow><button onClick={() => setEditing({ course })} className="text-xs font-semibold text-accent">+ Add</button></div>
              <Card>
                {list.length === 0 && <div className="px-4 py-3 text-xs text-muted">None yet.</div>}
                {list.map((x) => (
                  <button key={x.id} onClick={() => setEditing(x)} className="w-full text-left flex items-center gap-2 px-4 py-2.5 border-b border-line-soft last:border-b-0 hover:bg-surface/60">
                    <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{x.name}</div>{(x.tags?.length || x.notes) && <div className="text-[11px] text-muted truncate">{[...(x.tags ?? []), x.notes].filter(Boolean).join(" · ")}</div>}</div>
                    {x.tags?.includes("healthy") && <span className="text-[10px] font-semibold text-green bg-green/10 rounded px-1.5 py-0.5">healthy</span>}
                  </button>
                ))}
              </Card>
            </div>
          );
        })}
      </div>
      {editing && <DishForm dish={"id" in editing ? editing : undefined} course={editing.course} onClose={() => setEditing(null)} onSave={save} onRemove={remove} />}
      {importing && <DishImporter existing={dishes} onClose={() => setImporting(false)} onSave={(list) => update((h) => ({ ...h, dishes: [...(h.dishes ?? []), ...list] }), `added ${list.length} dishes`)} />}
    </>
  );
}

/** Suggest a course + ingredients for a list of names: the server route (Claude if configured, else the built-in list). */
async function suggestDishes(names: string[]) {
  try {
    const r = await fetch("/api/dishes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ names }) });
    if (r.ok) { const j = (await r.json()) as { dishes: { name: string; course: Course; ingredients: string[] }[]; ai: boolean }; return j; }
  } catch { /* fall through */ }
  return { dishes: names.map((name) => ({ name, ...guessDish(name) })), ai: false };
}

function DishImporter({ existing, onClose, onSave }: { existing: Dish[]; onClose: () => void; onSave: (list: Dish[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const [rows, setRows] = useState<{ name: string; course: Course; ingredients: string; dup: boolean }[] | null>(null);
  const analyze = async () => {
    const names = parseDishList(text); if (!names.length) return;
    setBusy(true);
    const res = await suggestDishes(names);
    setAi(res.ai);
    setRows(res.dishes.map((d) => ({ name: d.name, course: d.course, ingredients: d.ingredients.join(", "), dup: existing.some((x) => x.name.toLowerCase() === d.name.toLowerCase()) })));
    setBusy(false);
  };
  const set = (i: number, patch: Partial<{ name: string; course: Course; ingredients: string }>) => setRows((r) => r!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Modal open onClose={onClose} title="Paste a list of dishes">
      {!rows ? (
        <>
          <div className="text-[13px] text-muted leading-snug">One dish per line (or comma-separated). We&apos;ll work out the course and what you need to make each one — you can fix anything before saving.</div>
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={8} className={cx(inputCls, "h-auto py-2 font-mono text-[13px]")} placeholder={"Tacos\nJerk chicken\nRice and peas\nSteamed broccoli\nBrownies"} />
          <Button className="w-full" disabled={busy || !text.trim()} onClick={analyze}>{busy ? <><Loader2 size={14} className="inline animate-spin mr-1.5" />Working it out…</> : "Work out ingredients"}</Button>
        </>
      ) : (
        <>
          <div className="text-[12px] text-muted">{ai ? "Suggested with AI" : "Suggested from the built-in list"} — edit any line. Ingredients are comma-separated.</div>
          <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto -mx-1 px-1">
            {rows.map((r, i) => (
              <div key={i} className={cx("rounded-[12px] border p-3 flex flex-col gap-2", r.dup ? "border-amber/50 bg-amber/5" : "border-line")}>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <input className={inputCls} value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
                  <select className={selectCls} value={r.course} onChange={(e) => set(i, { course: e.target.value as Course })}>{COURSES.map((c) => <option key={c} value={c}>{COURSE_LABEL[c]}</option>)}</select>
                </div>
                <input className={cx(inputCls, "text-[12px]")} value={r.ingredients} onChange={(e) => set(i, { ingredients: e.target.value })} placeholder="No ingredients found — type them here" />
                {r.dup && <div className="text-[11px] text-amber">Already in your library — saving adds a second copy.</div>}
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setRows(null)}>Back</Button>
            <Button className="flex-1" onClick={() => { onSave(rows.filter((r) => r.name.trim()).map((r) => ({ id: uid(), name: r.name.trim(), course: r.course, ingredients: r.ingredients.split(",").map((x) => x.trim()).filter(Boolean) }))); onClose(); }}>Add {rows.length} dish{rows.length === 1 ? "" : "es"}</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------ Grocery list ------------------------------ */

function GroceryList({ days, offset, setOffset, weekLabel }: { days: Date[]; offset: number; setOffset: (n: number) => void; weekLabel: string }) {
  const { data: d, update } = useHome();
  const data = d!;
  const weekKey = ymd(days[0]);
  const lines = groceryFor(data, days, normalizeIngredient);
  const [extra, setExtra] = useState("");
  const setState = (fn: (s: { checked: string[]; extras: string[] }) => { checked: string[]; extras: string[] }, note: string) =>
    update((h) => ({ ...h, grocery: { ...(h.grocery ?? {}), [weekKey]: fn(h.grocery?.[weekKey] ?? { checked: [], extras: [] }) } }), note);
  const toggle = (key: string) => setState((s) => ({ ...s, checked: s.checked.includes(key) ? s.checked.filter((k) => k !== key) : [...s.checked, key] }), "grocery item");
  const addExtra = () => { const v = extra.trim(); if (!v) return; setState((s) => ({ ...s, extras: [...s.extras, v] }), `added ${v} to groceries`); setExtra(""); };
  const removeExtra = (name: string) => setState((s) => ({ ...s, extras: s.extras.filter((x) => x !== name) }), "removed a grocery extra");
  const clearChecked = () => setState((s) => ({ ...s, checked: [] }), "reset grocery checks");
  const meals = days.reduce((n, day) => n + itemsOn(data, ymd(day)).filter((i) => i.kind === "meal").length, 0);
  const open = lines.filter((l) => !l.checked);
  const copyText = () => navigator.clipboard?.writeText(`Groceries · ${weekLabel}\n` + open.map((l) => `☐ ${l.name}${l.dishes.length ? ` (${l.dishes.join(", ")})` : ""}`).join("\n"));
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(offset - 1)} aria-label="Previous week" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronLeft size={16} /></button>
          <button onClick={() => setOffset(0)} className={cx("h-10 px-3 rounded-[10px] border text-[13px] font-semibold", offset === 0 ? "bg-ink text-white border-ink" : "bg-card border-line hover:border-field")}>{offset === 0 ? "This week" : offset === 1 ? "Next week" : `${offset > 0 ? "+" : ""}${offset} wk`}</button>
          <button onClick={() => setOffset(offset + 1)} aria-label="Next week" className="w-10 h-10 rounded-[10px] border border-line bg-card flex items-center justify-center hover:border-field"><ChevronRight size={16} /></button>
          <div className="ml-2 text-[13px] text-muted">{weekLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={copyText} className="h-9 px-3 text-xs"><Copy size={13} className="inline -mt-0.5 mr-1" />Copy</Button>
          <Button variant="secondary" onClick={() => window.print()} className="h-9 px-3 text-xs"><Printer size={13} className="inline -mt-0.5 mr-1" />Print</Button>
        </div>
      </div>
      <div className="text-[13px] text-muted">Built from the {meals} meal{meals === 1 ? "" : "s"} planned this week — every main and every side, meat, veggie, dessert and drink that goes with it. {open.length} to buy, {lines.length - open.length} in the cart.</div>
      {meals === 0 && <Card className="p-4 flex items-center gap-3 border-accent-line bg-accent-bg/40"><ShoppingCart size={18} className="text-accent shrink-0" /><div className="text-[13px] flex-1">Nothing planned for this week yet. Plan meals on the <b>Week</b> tab and the list fills itself in.</div></Card>}
      <Card>
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-3 px-4 py-2.5 border-b border-line-soft last:border-b-0">
            <button onClick={() => toggle(l.key)} aria-label={l.checked ? "Uncheck" : "Check"} className={cx("w-6 h-6 rounded-[7px] border-2 flex items-center justify-center shrink-0", l.checked ? "bg-green border-green text-white" : "border-chip")}>{l.checked && <Check size={14} strokeWidth={3} />}</button>
            <div className="flex-1 min-w-0">
              <div className={cx("text-[13px] font-semibold capitalize", l.checked && "line-through text-muted")}>{l.name}</div>
              {l.dishes.length > 0 && <div className="text-[11px] text-muted truncate">for {l.dishes.join(", ")}</div>}
            </div>
            {l.custom && <button onClick={() => removeExtra(l.name)} aria-label="Remove" className="text-muted hover:text-red"><X size={14} /></button>}
          </div>
        ))}
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Plus size={14} className="text-muted" />
          <input value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addExtra()} placeholder="Add something else (paper towels, dog food…)" className="flex-1 h-9 text-[13px] bg-transparent outline-none" />
          {extra && <Button onClick={addExtra} className="h-8 px-3 text-xs">Add</Button>}
        </div>
      </Card>
      {lines.some((l) => l.checked) && <button onClick={clearChecked} className="text-xs font-semibold text-muted self-start">Uncheck everything</button>}
    </>
  );
}

function DishForm({ dish, course: initialCourse, onClose, onSave, onRemove }: { dish?: Dish; course: Course; onClose: () => void; onSave: (x: Dish) => void; onRemove: (id: string) => void }) {
  const [name, setName] = useState(dish?.name ?? "");
  const [course, setCourse] = useState<Course>(dish?.course ?? initialCourse);
  const [tags, setTags] = useState((dish?.tags ?? []).join(", "));
  const [notes, setNotes] = useState(dish?.notes ?? "");
  const [url, setUrl] = useState(dish?.url ?? "");
  const [ingredients, setIngredients] = useState((dish?.ingredients ?? []).join(", "));
  const [suggesting, setSuggesting] = useState(false);
  const suggest = async () => { setSuggesting(true); const r = await suggestDishes([name.trim()]); const g = r.dishes[0]; if (g) { setIngredients(g.ingredients.join(", ")); if (!dish) setCourse(g.course); } setSuggesting(false); };
  return (
    <Modal open onClose={onClose} title={dish ? "Edit dish" : `Add a ${COURSE_SINGULAR[initialCourse]}`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Course"><select className={selectCls} value={course} onChange={(e) => setCourse(e.target.value as Course)}>{COURSES.map((c) => <option key={c} value={c}>{COURSE_LABEL[c]}</option>)}</select></Field>
      </div>
      <Field label="Ingredients (comma-separated)" hint="These go on the grocery list when the dish is planned.">
        <div className="flex gap-2">
          <input className={cx(inputCls, "flex-1")} value={ingredients} onChange={(e) => setIngredients(e.target.value)} placeholder="tortillas, ground beef, onion, tomato…" />
          <Button variant="secondary" disabled={!name.trim() || suggesting} onClick={suggest} className="h-11 px-3 text-xs shrink-0">{suggesting ? <Loader2 size={14} className="animate-spin" /> : <><Sparkles size={13} className="inline -mt-0.5 mr-1" />Suggest</>}</Button>
        </div>
      </Field>
      <Field label="Tags (comma-separated)" hint="e.g. healthy, quick, kid-friendly, Sunday"><input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
      <Field label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Marinate 2 hrs · serves 6" /></Field>
      <Field label="Recipe link (optional)"><input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
      <div className="flex gap-2 pt-1">
        {dish && <Button variant="danger" onClick={() => { onRemove(dish.id); onClose(); }}>Remove</Button>}
        <Button className="flex-1" disabled={!name.trim()} onClick={() => { onSave({ id: dish?.id ?? uid(), name: name.trim(), course, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), notes: notes || undefined, url: url || undefined, ingredients: ingredients.split(",").map((x) => x.trim()).filter(Boolean) }); onClose(); }}>Save</Button>
      </div>
    </Modal>
  );
}
