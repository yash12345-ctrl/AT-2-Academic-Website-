require('dotenv').config();
const path = require('path');

const isPostgres = Boolean(process.env.DATABASE_URL);

let db = null;

if (isPostgres) {
  const { Pool } = require('pg');
  console.log('🌐 Connecting to Neon PostgreSQL database...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.connect((err, client, release) => {
    if (err) {
      console.error('❌ Error connecting to Neon PostgreSQL:', err.message);
    } else {
      console.log('✅ Connected to Neon PostgreSQL database successfully!');
      release();
    }
  });

  function convertSql(sql) {
    let paramIndex = 1;
    let converted = sql.replace(/\?/g, () => `$${paramIndex++}`);
    converted = converted.replace(/DATE\('now'\)/gi, 'CURRENT_DATE');
    if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(converted)) {
      converted = converted.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
      if (!/ON\s+CONFLICT/i.test(converted)) {
        converted += ' ON CONFLICT DO NOTHING';
      }
    }
    return converted;
  }

  function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    const mapped = { ...row };
    if (row.classname !== undefined && row.className === undefined) mapped.className = row.classname;
    if (row.companyname !== undefined && row.companyName === undefined) mapped.companyName = row.companyname;
    if (row.hackathonname !== undefined && row.hackathonName === undefined) mapped.hackathonName = row.hackathonname;
    if (row.collegename !== undefined && row.collegeName === undefined) mapped.collegeName = row.collegename;
    if (row.totalmarks !== undefined && row.totalMarks === undefined) mapped.totalMarks = row.totalmarks;
    if (row.student_name !== undefined && row.studentName === undefined) mapped.studentName = row.student_name;
    return mapped;
  }

  db = {
    isPostgres: true,
    pool,

    serialize(fn) {
      if (typeof fn === 'function') fn();
    },

    all(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const pgSql = convertSql(sql);
      pool.query(pgSql, params || [], (err, res) => {
        if (err) {
          if (callback) callback(err);
          return;
        }
        const rows = (res.rows || []).map(normalizeRow);
        if (callback) callback(null, rows);
      });
    },

    get(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const pgSql = convertSql(sql);
      pool.query(pgSql, params || [], (err, res) => {
        if (err) {
          if (callback) callback(err);
          return;
        }
        const row = res.rows && res.rows.length > 0 ? normalizeRow(res.rows[0]) : undefined;
        if (callback) callback(null, row);
      });
    },

    run(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      let pgSql = convertSql(sql);

      // If it's an INSERT without RETURNING, append RETURNING id for lastID emulation
      const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
      if (isInsert && !/RETURNING/i.test(pgSql)) {
        pgSql += ' RETURNING id';
      }

      pool.query(pgSql, params || [], (err, res) => {
        const context = {
          lastID: res?.rows?.[0]?.id,
          changes: res?.rowCount || 0
        };
        if (callback) callback.call(context, err);
      });
    }
  };
} else {
  // SQLite fallback
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'student.db');

  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Error connecting to SQLite database:', err.message);
    } else {
      console.log('✅ Connected to SQLite database at:', dbPath);
    }
  });
}

// Table schemas
const createStudentsTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year TEXT NOT NULL,
      semester TEXT NOT NULL,
      "className" TEXT NOT NULL,
      password TEXT NOT NULL,
      course TEXT NOT NULL
    );`
  : `CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year TEXT NOT NULL,
      semester TEXT NOT NULL,
      className TEXT NOT NULL,
      password TEXT NOT NULL,
      course TEXT NOT NULL
    );`;

const createSubjectsTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS subjects (
      subject_id SERIAL PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_name TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      subject_type TEXT CHECK(subject_type IN ('Theory', 'Practical')) NOT NULL
    );`
  : `CREATE TABLE IF NOT EXISTS subjects (
      subject_id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      subject_type TEXT CHECK(subject_type IN ('Theory', 'Practical')) NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );`;

const createAttendanceTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_name TEXT NOT NULL,
      status TEXT CHECK(status IN ('present', 'absent')) NOT NULL,
      date DATE DEFAULT CURRENT_DATE
    );`
  : `CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      status TEXT CHECK(status IN ('present', 'absent')) NOT NULL,
      date TEXT DEFAULT (DATE('now')),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );`;

const createTeachersTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      password TEXT NOT NULL,
      "className" TEXT NOT NULL,
      student_name TEXT NOT NULL
    );`
  : `CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id TEXT NOT NULL,
      password TEXT NOT NULL,
      className TEXT NOT NULL,
      student_name TEXT NOT NULL
    );`;

const createMarksTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS marks_scores (
      id SERIAL PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      test_name TEXT NOT NULL,
      marks INTEGER NOT NULL,
      "totalMarks" INTEGER NOT NULL,
      teacher_id TEXT NOT NULL
    );`
  : `CREATE TABLE IF NOT EXISTS marks_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      test_name TEXT NOT NULL,
      marks INTEGER NOT NULL,
      totalMarks INTEGER NOT NULL,
      teacher_id TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );`;

const createDayOrderTable = `
  CREATE TABLE IF NOT EXISTS day_order_mapping (
    date TEXT PRIMARY KEY,
    day_order TEXT NOT NULL
  );
`;

const createInternshipTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS internships (
      id SERIAL PRIMARY KEY,
      "companyName" TEXT NOT NULL,
      experience TEXT NOT NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      location TEXT NOT NULL,
      about TEXT NOT NULL,
      link TEXT NOT NULL
    );`
  : `CREATE TABLE IF NOT EXISTS internships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      companyName TEXT NOT NULL,
      experience TEXT NOT NULL,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      location TEXT NOT NULL,
      about TEXT NOT NULL,
      link TEXT NOT NULL
    );`;

const createHackathonsTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS hackathons (
      id SERIAL PRIMARY KEY,
      "hackathonName" TEXT NOT NULL,
      "collegeName" TEXT NOT NULL,
      mode TEXT NOT NULL,
      deadline TEXT NOT NULL,
      fees INTEGER NOT NULL,
      link TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`
  : `CREATE TABLE IF NOT EXISTS hackathons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hackathonName TEXT NOT NULL,
      collegeName TEXT NOT NULL,
      mode TEXT NOT NULL,
      deadline TEXT NOT NULL,
      fees INTEGER NOT NULL,
      link TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );`;

const createTimetableTable = isPostgres
  ? `CREATE TABLE IF NOT EXISTS timetable (
      id SERIAL PRIMARY KEY,
      student_name TEXT NOT NULL,
      "className" TEXT NOT NULL,
      day TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      subject TEXT NOT NULL
    );`
  : `CREATE TABLE IF NOT EXISTS timetable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_name TEXT NOT NULL,
      className TEXT NOT NULL,
      day TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      subject TEXT NOT NULL
    );`;

function initTables() {
  db.serialize(() => {
    if (!isPostgres) {
      db.run('PRAGMA foreign_keys = ON');
    }

    db.run(createStudentsTable, (err) => {
      if (err) console.error('❌ Failed to create students table:', err.message);
      else console.log('✅ Students table ready');
    });

    db.run(createInternshipTable, (err) => {
      if (err) console.error('❌ Failed to create internships table:', err.message);
      else console.log('✅ Internships table ready');
    });

    db.run(createHackathonsTable, (err) => {
      if (err) console.error('❌ Failed to create hackathons table:', err.message);
      else console.log('✅ Hackathons table ready');
    });

    db.run(createSubjectsTable, (err) => {
      if (err) console.error('❌ Failed to create subjects table:', err.message);
      else console.log('✅ Subjects table ready');
    });

    db.run(createDayOrderTable, (err) => {
      if (err) console.error('❌ Failed to create day_order_mapping table:', err.message);
      else console.log('✅ Day Order Mapping table ready');
    });

    db.run(createAttendanceTable, (err) => {
      if (err) console.error('❌ Failed to create attendance table:', err.message);
      else console.log('✅ Attendance table ready');
    });

    db.run(createTeachersTable, (err) => {
      if (err) console.error('❌ Failed to create teachers table:', err.message);
      else console.log('✅ Teachers table ready');
    });

    db.run(createTimetableTable, (err) => {
      if (err) console.error('❌ Failed to create timetable table:', err.message);
      else console.log('✅ Timetable table ready');
    });

    db.run(createMarksTable, (err) => {
      if (err) console.error('❌ Failed to create marks_scores table:', err.message);
      else console.log('✅ Marks Scores table ready');
    });
  });
}

module.exports = { db, initTables, isPostgres };
