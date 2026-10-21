require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('\n❌ ERROR: DATABASE_URL is not set in your .env file!');
  console.log('\n👉 Instructions:');
  console.log('1. Go to https://neon.tech and create a free project.');
  console.log('2. Copy your Connection String (starts with postgresql://...).');
  console.log('3. Open .env and add:');
  console.log('   DATABASE_URL="postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"');
  console.log('4. Run: node migrate-to-neon.js\n');
  process.exit(1);
}

const sqlitePath = path.join(__dirname, 'student.db');
const sqlite = new sqlite3.Database(sqlitePath);

const pg = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function querySqlite(query, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function runPg(query, params = []) {
  return pg.query(query, params);
}

async function setupPgTables() {
  console.log('🔨 Creating schema in Neon PostgreSQL...');

  await runPg(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year TEXT NOT NULL,
      semester TEXT NOT NULL,
      "className" TEXT NOT NULL,
      password TEXT NOT NULL,
      course TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subjects (
      subject_id SERIAL PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_name TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      subject_type TEXT CHECK(subject_type IN ('Theory', 'Practical')) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_name TEXT NOT NULL,
      status TEXT CHECK(status IN ('present', 'absent')) NOT NULL,
      date DATE DEFAULT CURRENT_DATE
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      password TEXT NOT NULL,
      "className" TEXT NOT NULL,
      student_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS marks_scores (
      id SERIAL PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      test_name TEXT NOT NULL,
      marks INTEGER NOT NULL,
      "totalMarks" INTEGER NOT NULL,
      teacher_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS day_order_mapping (
      date TEXT PRIMARY KEY,
      day_order TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS internships (
      id SERIAL PRIMARY KEY,
      "companyName" TEXT NOT NULL,
      experience TEXT NOT NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      location TEXT NOT NULL,
      about TEXT NOT NULL,
      link TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hackathons (
      id SERIAL PRIMARY KEY,
      "hackathonName" TEXT NOT NULL,
      "collegeName" TEXT NOT NULL,
      mode TEXT NOT NULL,
      deadline TEXT NOT NULL,
      fees INTEGER NOT NULL,
      link TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS timetable (
      id SERIAL PRIMARY KEY,
      student_name TEXT NOT NULL,
      "className" TEXT NOT NULL,
      day TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      subject TEXT NOT NULL
    );
  `);
  console.log('✅ PostgreSQL schema successfully created in Neon!');
}

async function migrateData() {
  console.log('🚀 Starting SQLite to Neon PostgreSQL data migration...\n');

  // 1. Students
  const students = await querySqlite('SELECT * FROM students');
  for (const s of students) {
    await runPg(
      `INSERT INTO students (id, name, year, semester, "className", password, course)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         year = EXCLUDED.year,
         semester = EXCLUDED.semester,
         "className" = EXCLUDED."className",
         password = EXCLUDED.password,
         course = EXCLUDED.course`,
      [s.id, s.name, s.year, s.semester, s.className, s.password, s.course]
    );
  }
  console.log(`✅ Migrated ${students.length} students`);

  // 2. Subjects
  const subjects = await querySqlite('SELECT * FROM subjects');
  await runPg('TRUNCATE TABLE subjects RESTART IDENTITY CASCADE');
  for (const sub of subjects) {
    await runPg(
      `INSERT INTO subjects (subject_id, student_id, subject_name, subject_code, subject_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [sub.subject_id, sub.student_id, sub.subject_name, sub.subject_code, sub.subject_type]
    );
  }
  await runPg("SELECT setval(pg_get_serial_sequence('subjects', 'subject_id'), COALESCE(MAX(subject_id), 1)) FROM subjects");
  console.log(`✅ Migrated ${subjects.length} subjects`);

  // 3. Attendance
  const attendance = await querySqlite('SELECT * FROM attendance');
  await runPg('TRUNCATE TABLE attendance RESTART IDENTITY CASCADE');
  for (const att of attendance) {
    await runPg(
      `INSERT INTO attendance (id, student_id, subject_name, status, date)
       VALUES ($1, $2, $3, $4, $5)`,
      [att.id, att.student_id, att.subject_name, att.status, att.date]
    );
  }
  await runPg("SELECT setval(pg_get_serial_sequence('attendance', 'id'), COALESCE(MAX(id), 1)) FROM attendance");
  console.log(`✅ Migrated ${attendance.length} attendance records`);

  // 4. Teachers
  const teachers = await querySqlite('SELECT * FROM teachers');
  await runPg('TRUNCATE TABLE teachers RESTART IDENTITY CASCADE');
  for (const t of teachers) {
    await runPg(
      `INSERT INTO teachers (id, teacher_id, password, "className", student_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [t.id, t.teacher_id, t.password, t.className, t.student_name]
    );
  }
  await runPg("SELECT setval(pg_get_serial_sequence('teachers', 'id'), COALESCE(MAX(id), 1)) FROM teachers");
  console.log(`✅ Migrated ${teachers.length} teachers`);

  // 5. Marks Scores
  const marks = await querySqlite('SELECT * FROM marks_scores');
  await runPg('TRUNCATE TABLE marks_scores RESTART IDENTITY CASCADE');
  for (const m of marks) {
    await runPg(
      `INSERT INTO marks_scores (id, student_id, subject, test_name, marks, "totalMarks", teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [m.id, m.student_id, m.subject, m.test_name, m.marks, m.totalMarks, m.teacher_id]
    );
  }
  await runPg("SELECT setval(pg_get_serial_sequence('marks_scores', 'id'), COALESCE(MAX(id), 1)) FROM marks_scores");
  console.log(`✅ Migrated ${marks.length} marks scores`);

  // 6. Day Order Mapping
  const dayOrders = await querySqlite('SELECT * FROM day_order_mapping');
  for (const d of dayOrders) {
    await runPg(
      `INSERT INTO day_order_mapping (date, day_order)
       VALUES ($1, $2)
       ON CONFLICT (date) DO UPDATE SET day_order = EXCLUDED.day_order`,
      [d.date, d.day_order]
    );
  }
  console.log(`✅ Migrated ${dayOrders.length} day order mappings`);

  // 7. Internships
  const internships = await querySqlite('SELECT * FROM internships');
  await runPg('TRUNCATE TABLE internships RESTART IDENTITY CASCADE');
  for (const intern of internships) {
    await runPg(
      `INSERT INTO internships (id, "companyName", experience, title, mode, location, about, link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [intern.id, intern.companyName, intern.experience, intern.title, intern.mode, intern.location, intern.about, intern.link]
    );
  }
  await runPg("SELECT setval(pg_get_serial_sequence('internships', 'id'), COALESCE(MAX(id), 1)) FROM internships");
  console.log(`✅ Migrated ${internships.length} internships`);

  // 8. Hackathons
  const hackathons = await querySqlite('SELECT * FROM hackathons');
  await runPg('TRUNCATE TABLE hackathons RESTART IDENTITY CASCADE');
  for (const h of hackathons) {
    await runPg(
      `INSERT INTO hackathons (id, "hackathonName", "collegeName", mode, deadline, fees, link, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [h.id, h.hackathonName, h.collegeName, h.mode, h.deadline, h.fees, h.link, h.details, h.created_at]
    );
  }
  await runPg("SELECT setval(pg_get_serial_sequence('hackathons', 'id'), COALESCE(MAX(id), 1)) FROM hackathons");
  console.log(`✅ Migrated ${hackathons.length} hackathons`);

  // 9. Timetable
  const timetable = await querySqlite('SELECT * FROM timetable');
  await runPg('TRUNCATE TABLE timetable RESTART IDENTITY CASCADE');
  for (const slot of timetable) {
    await runPg(
      `INSERT INTO timetable (id, student_name, "className", day, time_slot, subject)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [slot.id, slot.student_name, slot.className, slot.day, slot.time_slot, slot.subject]
    );
  }
  await runPg("SELECT setval(pg_get_serial_sequence('timetable', 'id'), COALESCE(MAX(id), 1)) FROM timetable");
  console.log(`✅ Migrated ${timetable.length} timetable slots`);

  console.log('\n🎉 ALL DATA MIGRATED TO NEON POSTGRESQL SUCCESSFULLY!\n');
}

async function main() {
  try {
    await setupPgTables();
    await migrateData();
  } catch (err) {
    console.error('\n❌ Migration failed:', err);
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main();
