import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import expressLayouts from "express-ejs-layouts";

const prisma = new PrismaClient();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.set("layout", "layout");
app.use(expressLayouts);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", async (req, res) => {
  const { from, to, q, type } = req.query;
  const where = {};
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(String(from));
    if (to) where.date.lte = new Date(String(to));
  }
  if (type && String(type).trim()) {
    where.type = { contains: String(type).trim(), mode: "insensitive" };
  }
  if (q && String(q).trim()) {
    const term = String(q).trim();
    where.OR = [
      { type: { contains: term, mode: "insensitive" } },
      { notes: { contains: term, mode: "insensitive" } },
    ];
  }
  const workouts = await prisma.workout.findMany({ where, orderBy: { date: "desc" } });

  // Weekly goal progress (Mon-Sun ISO week)
  const weeklyGoal = Number(process.env.WEEKLY_GOAL_MINUTES || 150);
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0=Mon
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  monday.setHours(0,0,0,0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23,59,59,999);
  const weekMinutes = await prisma.workout.aggregate({
    _sum: { duration: true },
    where: { date: { gte: monday, lte: sunday } },
  });
  const weeklyMinutes = weekMinutes._sum.duration || 0;
  const weeklyProgress = Math.max(0, Math.min(100, Math.round((weeklyMinutes / weeklyGoal) * 100)));

  // Prepare chart data by date (sum duration per day)
  const totalsByDate = new Map();
  for (const w of workouts) {
    const key = new Date(w.date).toISOString().slice(0, 10);
    totalsByDate.set(key, (totalsByDate.get(key) || 0) + w.duration);
  }
  const labels = Array.from(totalsByDate.keys()).sort();
  const data = labels.map((d) => totalsByDate.get(d));

  res.render("index", { workouts, chart: { labels, data }, filters: { from: from || "", to: to || "", q: q || "", type: type || "" }, weekly: { weeklyGoal, weeklyMinutes, weeklyProgress } });
});

app.get("/export", async (req, res) => {
  const rows = await prisma.workout.findMany({ orderBy: { date: "asc" } });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="workouts.csv"');
  const header = "id,date,type,duration,notes\n";
  const lines = rows.map(r => [
    r.id,
    new Date(r.date).toISOString(),
    JSON.stringify(r.type),
    r.duration,
    r.notes ? JSON.stringify(r.notes) : ""
  ].join(","));
  res.send(header + lines.join("\n"));
});

app.get("/workouts/new", (req, res) => {
  res.render("new");
});

app.post("/workouts", async (req, res) => {
  const { date, type, duration, notes } = req.body;
  await prisma.workout.create({
    data: {
      date: new Date(date),
      type,
      duration: Number(duration),
      notes: notes || null,
    },
  });
  res.redirect("/");
});

app.get("/workouts/:id/edit", async (req, res) => {
  const id = Number(req.params.id);
  const workout = await prisma.workout.findUnique({ where: { id } });
  if (!workout) return res.status(404).send("Not found");
  res.render("edit", { workout });
});

app.post("/workouts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { date, type, duration, notes } = req.body;
  await prisma.workout.update({
    where: { id },
    data: {
      date: new Date(date),
      type,
      duration: Number(duration),
      notes: notes || null,
    },
  });
  res.redirect("/");
});

app.post("/workouts/:id/delete", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.workout.delete({ where: { id } });
  res.redirect("/");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});


