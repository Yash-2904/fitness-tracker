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
  const workouts = await prisma.workout.findMany({ orderBy: { date: "desc" } });

  // Prepare chart data by date (sum duration per day)
  const totalsByDate = new Map();
  for (const w of workouts) {
    const key = new Date(w.date).toISOString().slice(0, 10);
    totalsByDate.set(key, (totalsByDate.get(key) || 0) + w.duration);
  }
  const labels = Array.from(totalsByDate.keys()).sort();
  const data = labels.map((d) => totalsByDate.get(d));

  res.render("index", { workouts, chart: { labels, data } });
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


