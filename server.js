const { spawn } = require('child_process');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { db, initTables } = require('./db');
initTables();
const multer = require('multer');


const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Setup Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const { id } = req.body;
    const uniqueName = `${id}-${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });


// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Set EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -------------------- AUTH & COOKIE HELPERS -------------------- //

// Parse cookies from request header
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    try {
      list[name] = decodeURIComponent(value);
    } catch (e) {
      list[name] = value;
    }
  });

  return list;
}

// Retrieve student credentials from Body, Query, or Session Cookie
function getStudentAuth(req) {
  let id = req.body?.id || req.body?.studentId || req.query?.id || req.query?.studentId || '';
  let password = req.body?.password || req.query?.password || '';
  let name = req.body?.name || req.body?.studentName || req.query?.name || req.query?.studentName || '';

  if (typeof id === 'string') id = id.trim();
  if (typeof password === 'string') password = password.trim();
  if (typeof name === 'string') name = name.trim();

  // If missing from request body/query, fall back to persistent student_auth cookie
  if (!id || !password) {
    const cookies = parseCookies(req);
    if (cookies.student_auth) {
      try {
        const authData = JSON.parse(cookies.student_auth);
        id = id || authData.id || '';
        password = password || authData.password || '';
        name = name || authData.name || '';
      } catch (e) {
        console.warn('⚠️ Failed to parse student_auth cookie:', e.message);
      }
    }
  }

  return { id, password, name };
}

// Set persistent student authentication session cookie
function setStudentAuthCookie(res, auth) {
  const cookieVal = encodeURIComponent(JSON.stringify({
    id: auth.id,
    password: auth.password,
    name: auth.name
  }));
  // Valid for 30 days, SameSite=Lax ensures cookie is sent on refreshes and redirects
  res.setHeader('Set-Cookie', `student_auth=${cookieVal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
}

// Clear authentication cookie (logout)
function clearStudentAuthCookie(res) {
  res.setHeader('Set-Cookie', 'student_auth=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
}

// Convert timetable time slot (e.g., "8:00 - 8:50", "1:25 - 2:15") to minutes for chronological sorting
function convertToMinutes(timeRange) {
  if (!timeRange || typeof timeRange !== 'string' || !timeRange.includes('-')) return 0;
  const startTime = timeRange.split('-')[0].trim();
  const parts = startTime.split(':');
  if (parts.length < 2) return 0;
  let hour = parseInt(parts[0], 10);
  let minute = parseInt(parts[1], 10);
  if (isNaN(hour)) hour = 0;
  if (isNaN(minute)) minute = 0;
  if (hour < 8) hour += 12; // Handle afternoon hours
  return hour * 60 + minute;
}

// -------------------- ROUTES -------------------- //

// ✅ Health check route for UptimeRobot / ping monitoring to keep Render alive 24/7
app.get(['/health', '/healthz'], (req, res) => {
  const uptimeSeconds = process.uptime();
  res.status(200).json({
    status: 'ok',
    service: 'Academic Website Server',
    message: 'Server is running and healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptimeSeconds / 60)}m ${Math.floor(uptimeSeconds % 60)}s`
  });
});

// ✅ Root route: Serve login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ✅ GET /login: If already authenticated redirect to profile, else serve login page
app.get('/login', (req, res) => {
  const auth = getStudentAuth(req);
  if (auth.id && auth.password) {
    return res.redirect(`/student-profile?name=${encodeURIComponent(auth.name || '')}&id=${encodeURIComponent(auth.id)}`);
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ✅ Logout route: Clear session and redirect to login
app.get('/logout', (req, res) => {
  clearStudentAuthCookie(res);
  res.redirect('/');
});

// ✅ Serve login page & clear cookie on explicit visit
app.get('/login-page', (req, res) => {
  clearStudentAuthCookie(res);
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ✅ Serve student registration page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/registration', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ Student registration
app.post('/submit', (req, res) => {
  const { name, year, semester, className, id, password, course, subjects } = req.body;

  const insertStudent = `
      INSERT INTO students (id, name, year, semester, className, password, course)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

  db.run(insertStudent, [id, name, year, semester, className, password, course], function (err) {
    if (err) {
      console.error('❌ Error inserting student:', err.message);
      return res.status(500).send(`Error saving student: ${err.message}`);
    }

    const insertSubject = `
        INSERT INTO subjects (student_id, subject_name, subject_code, subject_type)
        VALUES (?, ?, ?, ?)
      `;

    if (subjects && Array.isArray(subjects)) {
      subjects.forEach(subject => {
        db.run(insertSubject, [id, subject.name, subject.code, subject.type], (err) => {
          if (err) console.error('❌ Error inserting subject:', err.message);
        });
      });
    }

    res.status(200).send('✅ Student and subjects saved successfully');
  });
});

app.post('/teacher-login', (req, res) => {
  const { teacherId, password } = req.body;

  db.get('SELECT * FROM teachers WHERE teacher_id = ? AND password = ?', [teacherId, password], (err, teacher) => {
    if (err) {
      console.error('❌ Error finding teacher:', err.message);
      return res.status(500).send('Server error');
    }

    if (!teacher) {
      return res.send('❌ Invalid Teacher ID or Password');
    }

    // ✅ Get all student names for this teacher
    db.all('SELECT student_name FROM teachers WHERE teacher_id = ?', [teacherId], (err, rows) => {
      if (err) {
        console.error('❌ Error fetching student names:', err.message);
        return res.status(500).send('Failed to load students');
      }

      const students = rows.map(row => row.student_name);
      res.render('attendance_list', { students });
    });
  });
});


// ✅ Student login: Authenticates, sets session cookie, and redirects (Post/Redirect/Get)
app.post('/login', (req, res) => {
  const id = (req.body?.id || '').trim();
  const password = (req.body?.password || '').trim();

  if (!id || !password) {
    return res.status(400).send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h2 style="color: #ef4444;">❌ Missing Credentials</h2>
        <p>Please enter both your Student ID and password.</p>
        <a href="/" style="display: inline-block; margin-top: 15px; padding: 10px 22px; background: #4f46e5; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;">Back to Login</a>
      </div>
    `);
  }

  // Authenticate student against database
  const studentQuery = 'SELECT id, name FROM students WHERE id = ? AND password = ?';
  db.get(studentQuery, [id, password], (err, student) => {
    if (err) {
      console.error('❌ Login error:', err.message);
      return res.status(500).send('Internal server error');
    }

    if (!student) {
      return res.status(401).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #ef4444;">❌ Invalid Student ID or Password</h2>
          <p>The student ID or password you entered is incorrect.</p>
          <a href="/" style="display: inline-block; margin-top: 15px; padding: 10px 22px; background: #4f46e5; color: white; border-radius: 8px; text-decoration: none; font-weight: bold;">Try Again</a>
        </div>
      `);
    }

    // Set persistent session cookie so refresh and navigation work seamlessly
    setStudentAuthCookie(res, { id: student.id, password, name: student.name });

    // Post/Redirect/Get pattern: redirect to /student-profile so browser URL changes and refreshes cleanly
    return res.redirect(`/student-profile?name=${encodeURIComponent(student.name)}&id=${encodeURIComponent(student.id)}`);
  });
});

// ✅ Student dashboard handler supporting both GET and POST with session cookie persistence
const handleStudentDashboard = (req, res) => {
  const auth = getStudentAuth(req);
  const id = auth.id;
  const password = auth.password;

  if (!id) {
    return res.redirect('/');
  }

  const studentQuery = 'SELECT name FROM students WHERE id = ?';
  db.get(studentQuery, [id], (err, student) => {
    if (err || !student) {
      console.error('❌ Error finding student for dashboard:', err?.message);
      return res.redirect('/');
    }

    const subjectQuery = `
      SELECT subject_name AS name, subject_code AS code, subject_type AS type
      FROM subjects WHERE student_id = ?
    `;

    db.all(subjectQuery, [id], (err2, subjects) => {
      if (err2) {
        console.error('❌ Error fetching subjects:', err2.message);
        return res.status(500).send('Error loading dashboard');
      }

      const statsQuery = `
        SELECT subject_name, 
              COUNT(*) AS total, 
              SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
        FROM attendance 
        WHERE student_id = ?
        GROUP BY subject_name
      `;

      db.all(statsQuery, [id], (err3, attendanceStats) => {
        if (err3) {
          console.error('❌ Error fetching attendance stats:', err3.message);
          return res.status(500).send('Error loading stats');
        }

        const mergedSubjects = (subjects || []).map(sub => {
          const stat = (attendanceStats || []).find(s => s.subject_name === sub.name) || {
            total: 0, present: 0, absent: 0
          };
          return { ...sub, ...stat };
        });

        res.render('student_dashboard', {
          name: student.name,
          subjects: mergedSubjects,
          id: id,
          password: password || ''
        });
      });
    });
  });
};

app.get('/student-dashboard', handleStudentDashboard);
app.post('/student-dashboard', handleStudentDashboard);


// ✅ Serve login1.html for teacher login page
app.get('/login1', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login1.html'));
});


// ✅ Get last 5 entered subjects (optional for form reuse)
app.get('/last-subjects', (req, res) => {
  db.all(`
      SELECT subject_name AS name, subject_code AS code, subject_type AS type
      FROM subjects ORDER BY subject_id DESC LIMIT 5
    `, (err, rows) => {
    if (err) {
      console.error('❌ Last subject fetch error:', err.message);
      return res.status(500).send('Error fetching subjects');
    }
    res.json(rows);
  });
});

// ✅ Route to display attendance list with checkboxes
app.post('/mark-attendance', (req, res) => {
  const studentNames = req.body.students;
  const namesArray = Array.isArray(studentNames) ? studentNames : [studentNames];
  res.render('attendance_list', { students: namesArray });
});

app.post('/save-student-info', (req, res) => {
  const { students, class: className, teacherId, password } = req.body;

  if (!students || !teacherId || !password || !className) {
    return res.status(400).send('Missing required fields');
  }

  const insertQuery = `
      INSERT INTO teachers (teacher_id, password, className, student_name)
      VALUES (?, ?, ?, ?)
    `;

  const studentsArray = Array.isArray(students) ? students : [students];
  studentsArray.forEach(name => {
    db.run(insertQuery, [teacherId, password, className, name], (err) => {
      if (err) console.error('❌ Error inserting teacher-student:', err.message);
    });
  });

  res.redirect('/login1'); // Ensure login1.html is in /public
});

// ✅ Save attendance (only if student name and subject match)
app.post('/save-attendance', (req, res) => {
  const subject = req.body.subject.trim();
  const allStudents = req.body['allStudents[]'] || req.body.allStudents || [];
  const presentStudents = req.body['present[]'] || req.body.present || [];

  const insertAttendance = `
      INSERT INTO attendance (student_id, subject_name, status, date)
      VALUES (?, ?, ?, DATE('now'))
    `;

  const allArray = Array.isArray(allStudents) ? allStudents : [allStudents];
  const presentArray = Array.isArray(presentStudents) ? presentStudents : [presentStudents];

  allArray.forEach(name => {
    db.get(`SELECT id FROM students WHERE name = ?`, [name], (err, studentRow) => {
      if (err || !studentRow) return;

      db.get(`SELECT * FROM subjects WHERE student_id = ? AND subject_name = ?`, [studentRow.id, subject], (err, subjectRow) => {
        if (err || !subjectRow) return;

        const isPresent = presentArray.includes(name);
        db.run(insertAttendance, [studentRow.id, subject, isPresent ? 'present' : 'absent'], err => {
          if (err) console.error('Insert error:', err.message);
        });
      });
    });
  });

  res.send('✅ Attendance recorded (if names and subject matched)');
});

// Create tables if not exist
db.serialize(() => {
  db.run(`
      CREATE TABLE IF NOT EXISTS marks_teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marksId TEXT,
        marksPassword TEXT,
        marksClass TEXT
      )
    `);

  db.run(`
      CREATE TABLE IF NOT EXISTS marks_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentName TEXT,
        teacherMarksId TEXT
      )
    `);
});

// === Route 1: Save student data ===
app.post('/save-marks-students', (req, res) => {
  const { marksStudents, marksClass, marksId, marksPassword } = req.body;

  db.run(
    'INSERT INTO marks_teachers (marksId, marksPassword, marksClass) VALUES (?, ?, ?)',
    [marksId, marksPassword, marksClass],
    function (err) {
      if (err) return res.send('Error saving teacher: ' + err);

      const teacherId = marksId;
      const stmt = db.prepare(
        'INSERT INTO marks_students (studentName, teacherMarksId) VALUES (?, ?)'
      );

      marksStudents.forEach((name) => {
        stmt.run(name, teacherId);
      });

      stmt.finalize();
      res.send('Student and teacher details saved successfully!');
    }
  );
});

// === Route 2: Handle teacher login and render marks entry form ===
app.post('/marks-login', (req, res) => {
  const { marksLoginId, marksLoginPassword } = req.body;

  db.get(
    'SELECT * FROM marks_teachers WHERE marksId = ? AND marksPassword = ?',
    [marksLoginId, marksLoginPassword],
    (err, teacher) => {
      if (err) return res.send('DB error: ' + err);
      if (!teacher) return res.send('Invalid ID or password');

      db.all(`
  SELECT s.name, s.id
  FROM students s
  JOIN marks_students m ON s.name = m.studentName
  WHERE m.teacherMarksId = ?
`, [marksLoginId], (err, students) => {
        if (err) return res.send('DB error: ' + err);

        res.render('marks', {
          name: marksLoginId,
          students,
          className: teacher.marksClass
        });
      });
    }
  );
});


// === Route 3: Save submitted marks ===
app.post('/submit-marks', (req, res) => {
  const teacherId = req.body.teacherId;
  const subject = req.body.subject;
  const totalMarks = req.body.totalMarks;
  const testName = req.body.testName;
  const marks = req.body.marks;

  if (!marks || typeof marks !== 'object') {
    return res.send("Invalid marks format.");
  }

  const insertStmt = db.prepare(`INSERT INTO marks_scores (student_id, subject, marks, totalMarks, test_name, teacher_id) VALUES (?, ?, ?, ?, ?, ?)`);

  for (const studentId in marks) {
    const studentMarks = parseFloat(marks[studentId]);
    if (!isNaN(studentMarks)) {
      insertStmt.run(studentId, subject, studentMarks, totalMarks, testName, teacherId);
    }
  }

  insertStmt.finalize();

  // ✅ After uploading, fetch the same students again
  db.all(`SELECT id, student_name AS name FROM teachers WHERE teacher_id = ?`, [teacherId], (err, students) => {
    if (err) {
      console.error("❌ Failed to fetch students for teacher:", err.message);
      return res.send("Failed to reload dashboard.");
    }

    // ✅ Render the same dashboard with success message
    res.render('marks', {
      name: teacherId,
      students,
      success: true,
      subject,
      testName
    });
  });
});


// === Route to fetch marks for a student (supports both GET and POST with session cookie) ===
const handleStudentMarks = (req, res) => {
  const auth = getStudentAuth(req);
  const studentId = auth.id;
  const password = auth.password;

  if (!studentId) {
    return res.redirect('/');
  }

  // Step 1: Get student name using ID
  db.get('SELECT name FROM students WHERE id = ?', [studentId], (err, student) => {
    if (err || !student) {
      console.error("❌ Error finding student:", err?.message);
      return res.redirect('/');
    }

    // Step 2: Get marks from marks_scores
    const query = `
        SELECT subject, test_name, marks, "totalMarks"
        FROM marks_scores
        WHERE student_id = ?
        ORDER BY subject, test_name
      `;

    db.all(query, [studentId], (err, rows) => {
      if (err) {
        console.error("❌ Error fetching student marks:", err.message);
        return res.status(500).send("Error fetching marks.");
      }

      // Step 3: Group marks by subject
      const grouped = {};
      (rows || []).forEach(row => {
        if (!row.subject || !row.test_name || row.marks == null || row.totalMarks == null) {
          return;
        }

        const key = row.subject;
        if (!grouped[key]) grouped[key] = [];

        grouped[key].push({
          test_name: row.test_name,
          marks: row.marks,
          totalMarks: row.totalMarks
        });
      });

      // Step 4: Render marks1.ejs
      res.render('marks1', {
        name: student.name,
        id: studentId,
        password: password || '',
        groupedMarks: grouped
      });
    });
  });
};

app.get('/student-marks', handleStudentMarks);
app.post('/student-marks', handleStudentMarks);



// ✅ Timetable submission route (POST from timetable_form.html)
app.post('/submit-timetable', (req, res) => {
  const { student_name, class_name, year, course, ...subjects } = req.body;

  const students = Array.isArray(student_name) ? student_name : [student_name];

  const getTimeSlot = (i) => {
    const slots = [
      "8:00 - 8:50", "8:50 - 9:40", "9:45 - 10:35", "10:40 - 11:30",
      "11:35 - 12:25", "12:30 - 1:20", "1:25 - 2:15", "2:20 - 3:10",
      "3:10 - 4:00", "4:00 - 4:50"
    ];
    return slots[i];
  };

  // Save for each student
  students.forEach(name => {
    // Ensure student exists
    db.run(
      `INSERT OR IGNORE INTO students (name, className, year, course) VALUES (?, ?, ?, ?)`,
      [name, class_name, year, course]
    );

    // Insert timetable
    for (let i = 0; i < 10; i++) {
      for (let j = 1; j <= 5; j++) {
        const subjectKey = `subject_${i}_${j}`;
        const subject = subjects[subjectKey];
        if (subject && subject.trim() !== "") {
          db.run(
            `INSERT INTO timetable (student_name, day, className, time_slot, subject) VALUES (?, ?, ?, ?, ?)`,
            [name, `Day ${j}`, class_name, getTimeSlot(i), subject.trim()]
          );
        }
      }
    }
  });

  res.send("✅ Timetable uploaded successfully!");
});


const handleTimetableView = (req, res) => {
  const auth = getStudentAuth(req);
  const id = auth.id;
  const password = auth.password;
  let studentName = auth.name;

  if (!id && !studentName) {
    return res.redirect('/');
  }

  const renderTimetable = (name) => {
    const query = `
        SELECT day, time_slot, subject 
        FROM timetable 
        WHERE student_name = ?
      `;

    db.all(query, [name], (err, rows) => {
      if (err) {
        console.error('❌ Error fetching timetable:', err.message);
        return res.status(500).send('Error loading timetable');
      }

      res.render('timetable', {
        student: { name: name },
        timetable: rows || [],
        name: name,
        id: id || '',
        password: password || ''
      });
    });
  };

  if (!studentName && id) {
    db.get('SELECT name FROM students WHERE id = ?', [id], (err, row) => {
      renderTimetable(row?.name || '');
    });
  } else {
    renderTimetable(studentName);
  }
};

app.post('/view-timetable', handleTimetableView);
app.get('/view-timetable', handleTimetableView);

const handleStudentProfile = (req, res) => {
  const auth = getStudentAuth(req);
  const id = auth.id;
  const password = auth.password;
  let name = auth.name;

  if (!id) {
    return res.redirect('/');
  }

  const renderProfile = (studentName) => {
    const uploadsPath = path.join(__dirname, 'public/uploads');
    const today = new Date().toISOString().split('T')[0];

    db.get('SELECT day_order FROM day_order_mapping WHERE date = ?', [today], (err, row) => {
      const todayOrder = row?.day_order || 'Not Set';

      db.all(`
          SELECT time_slot, subject FROM timetable
          WHERE student_name = ? AND day = ?
          ORDER BY time_slot
        `, [studentName, todayOrder], (err2, timetableRows) => {
        if (err2) {
          console.error('❌ Error fetching today\'s timetable:', err2);
          timetableRows = [];
        }

        const sortedSchedule = (timetableRows || []).sort((a, b) => {
          return convertToMinutes(a.time_slot) - convertToMinutes(b.time_slot);
        });

        fs.readdir(uploadsPath, (err3, files) => {
          const images = (!err3 && files) ? files.map(file => '/uploads/' + file) : [];

          db.all('SELECT * FROM internships ORDER BY id DESC', (err4, internshipRows) => {
            if (err4) {
              console.error("❌ Error fetching internships:", err4.message);
            }

            db.all('SELECT * FROM hackathons ORDER BY deadline ASC', (err5, hackathons) => {
              if (err5) {
                console.error("❌ Error fetching hackathons:", err5.message);
              }

              res.render('student_profile', {
                name: studentName,
                id,
                password: password || '',
                images,
                dayOrder: todayOrder,
                todaySubjects: sortedSchedule,
                internships: internshipRows || [],
                hackathons: hackathons || []
              });
            });
          });
        });
      });
    });
  };

  if (!name) {
    db.get('SELECT name FROM students WHERE id = ?', [id], (err, row) => {
      if (err || !row) return res.redirect('/');
      renderProfile(row.name);
    });
  } else {
    renderProfile(name);
  }
};

app.get('/student-profile', handleStudentProfile);
app.post('/student-profile', handleStudentProfile);



app.post('/upload-images', upload.array('images', 5), (req, res) => {
  const { name, id, password } = req.body;
  const uploadsPath = path.join(__dirname, 'public/uploads');

  fs.readdir(uploadsPath, (err, files) => {
    if (err) {
      console.error('❌ Error reading uploads directory:', err);
      return res.status(500).send('Error reading files');
    }

    // ✅ Show all images regardless of ID
    const allImages = files
      .map(file => ({
        name: file,
        time: fs.statSync(path.join(uploadsPath, file)).ctime
      }))
      .sort((a, b) => a.time - b.time);

    // ✅ Limit total to 5 most recent
    const maxImages = 5;
    const excess = allImages.length - maxImages;

    if (excess > 0) {
      const filesToDelete = allImages.slice(0, excess);

      filesToDelete.forEach(file => {
        const fullPath = path.join(uploadsPath, file.name);
        fs.unlink(fullPath, (err) => {
          if (err) console.error(`❌ Failed to delete ${file.name}:`, err.message);
        });
      });
    }

    // ✅ Re-read directory after deletion
    const updatedImages = fs.readdirSync(uploadsPath)
      .map(file => '/uploads/' + file);

    res.render('student_profile', {
      name,
      id,
      password,
      images: updatedImages
    });
  });
});


// Route: Save day orders for 5 dates
app.post('/set-day-orders', (req, res) => {
  const orders = req.body.orders; // [{ date, order }]

  const stmt = db.prepare(`
      INSERT INTO day_order_mapping (date, day_order)
      VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET day_order = excluded.day_order
    `);

  orders.forEach(({ date, order }) => {
    stmt.run(date, order);
  });

  stmt.finalize((err) => {
    if (err) {
      console.error("❌ Error saving day orders:", err.message);
      return res.status(500).send("Failed to save day orders.");
    }

    res.send({ message: '✅ Day orders saved successfully!' });
  });
});

// Route: Get all current day order mappings
app.get('/get-day-orders', (req, res) => {
  db.all('SELECT * FROM day_order_mapping', [], (err, rows) => {
    if (err) {
      console.error("❌ Error retrieving day orders:", err.message);
      return res.status(500).send("Error fetching data.");
    }
    res.json(rows);
  });
});

// Route: Update a single date's day order
app.post('/update-day-order', (req, res) => {
  const { date, newOrder } = req.body;

  // Step 1: Update the selected date with new day order (e.g., Holiday)
  const updateQuery = `UPDATE day_order_mapping SET day_order = ? WHERE date = ?`;
  db.run(updateQuery, [newOrder, date], function (err) {
    if (err) {
      console.error("❌ Error updating day order:", err.message);
      return res.status(500).json({ message: "Error updating day order." });
    }

    // Step 2: Get all future dates
    const getFutureDatesQuery = `SELECT date, day_order FROM day_order_mapping WHERE date > ? ORDER BY date ASC`;
    db.all(getFutureDatesQuery, [date], (err, futureRows) => {
      if (err) {
        console.error("❌ Error fetching future dates:", err.message);
        return res.status(500).json({ message: "Error fetching future dates." });
      }

      // Step 3: Get the last valid day order before this date (to continue sequence)
      const getPrevOrderQuery = `
          SELECT day_order FROM day_order_mapping 
          WHERE date < ? AND day_order != 'Holiday' 
          ORDER BY date DESC LIMIT 1
        `;
      db.get(getPrevOrderQuery, [date], (err, prevRow) => {
        if (err) {
          console.error("❌ Error getting previous day order:", err.message);
          return res.status(500).json({ message: "Error getting previous day order." });
        }

        const dayOrderCycle = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"];
        let startIndex = 0;

        if (prevRow && dayOrderCycle.includes(prevRow.day_order)) {
          const prevIndex = dayOrderCycle.indexOf(prevRow.day_order);
          startIndex = (prevIndex + 1) % dayOrderCycle.length;
        }

        // Step 4: Update future day orders in sequence, skipping holidays
        const updates = [];
        let index = startIndex;

        for (const row of futureRows) {
          if (row.day_order === "Holiday") continue;

          const newDayOrder = dayOrderCycle[index];
          updates.push({ date: row.date, day_order: newDayOrder });
          index = (index + 1) % dayOrderCycle.length;
        }

        // Perform updates
        const updateStmt = db.prepare(`UPDATE day_order_mapping SET day_order = ? WHERE date = ?`);
        for (const u of updates) {
          updateStmt.run([u.day_order, u.date]);
        }
        updateStmt.finalize();

        return res.json({ message: "Day order updated and future dates shifted." });
      });
    });
  });
});

app.get('/get-today-day-order', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  db.get('SELECT day_order FROM day_order_mapping WHERE date = ?', [today], (err, row) => {
    if (err) {
      console.error('❌ Error fetching today\'s day order:', err.message);
      return res.json({ day_order: 'Not Set' });
    }

    res.json({ day_order: row ? row.day_order : 'Not Set' });
  });
});

app.post('/submit-internship', (req, res) => {
  const { companyName, experience, title, mode, location, about, link } = req.body;

  const insert = `
      INSERT INTO internships (companyName, experience, title, mode, location, about, link)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

  db.run(insert, [companyName, experience, title, mode, location, about, link], (err) => {
    if (err) {
      console.error("❌ Error saving internship:", err.message);
      return res.status(500).send("Failed to save internship");
    }

    res.redirect(`/view-internships?name=${req.body.name}&id=${req.body.id}&password=${req.body.password}`);
  });
});


const handleInternshipsView = (req, res) => {
  db.all('SELECT * FROM internships ORDER BY id DESC', (err, rows) => {
    if (err) {
      console.error("❌ Error fetching internships:", err.message);
      return res.status(500).send("Failed to load internships");
    }

    const auth = getStudentAuth(req);
    const name = auth.name || 'Student';
    const id = auth.id || '';
    const password = auth.password || '';

    res.render('internships', {
      internships: rows || [],
      name,
      id,
      password
    });
  });
};

app.get('/view-internships', handleInternshipsView);
app.post('/view-internships', handleInternshipsView);
app.get('/internship-details', handleInternshipsView);
app.post('/internship-details', handleInternshipsView);

const handleHackathonsView = (req, res) => {
  db.all('SELECT * FROM hackathons ORDER BY deadline ASC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching hackathons:', err.message);
      return res.status(500).send('Internal Server Error');
    }

    const auth = getStudentAuth(req);
    const name = auth.name || 'Student';
    const id = auth.id || '';
    const password = auth.password || '';

    res.render('hackathons', {
      hackathons: rows || [],
      id,
      name,
      password
    });
  });
};

app.get('/view-hackathons', handleHackathonsView);
app.post('/view-hackathons', handleHackathonsView);
app.get('/hackathon-details', handleHackathonsView);
app.post('/hackathon-details', handleHackathonsView);



// Serve chat.html
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Function to generate an intelligent SRM GPT response stream
function streamSimulatedAIResponse(userMessage, res) {
  const msg = (userMessage || '').toLowerCase().trim();
  let responseText = '';

  if (!msg || msg === 'hi' || msg === 'hello' || msg === 'hey') {
    responseText = "Hello! I am SRM GPT, your AI Campus & Academic Assistant.\n\n" +
      "I'm here to assist you across all SRM Academia services:\n" +
      "• Attendance tracking & 75% examination compliance forecasting\n" +
      "• Day Order timetable lookup and classroom venues\n" +
      "• Internal assessments (CLA-1, CLA-2) & grade projections\n" +
      "• Active campus hackathons and industry internship opportunities\n\n" +
      "How can I help you today?";
  } else if (msg.includes('attendance') || msg.includes('75') || msg.includes('bunk') || msg.includes('miss')) {
    responseText = "📊 **SRM Attendance Regulations & Policy:**\n\n" +
      "1. **75% Minimum Requirement**: All registered students must maintain at least 75% attendance in each subject to be eligible for End-Semester Examinations.\n" +
      "2. **Condonation Bracket (65% - 74%)**: Permitted only in verified medical cases or institutional on-duty (OD) events with Dean/HOD authorization.\n" +
      "3. **Ineligibility (<65%)**: If attendance drops below 65%, you will be barred from examinations and must repeat the course.\n\n" +
      "💡 *Tip*: Monitor your subject-wise attendance percentages directly in the **Attendance Dashboard** tab.";
  } else if (msg.includes('timetable') || msg.includes('day order') || msg.includes('class') || msg.includes('schedule') || msg.includes('lecture')) {
    responseText = "🗓️ **SRM Day Order & Timetable System:**\n\n" +
      "SRM University operates on a 5-day cyclic schedule (**Day 1 through Day 5**) rather than fixed calendar weekdays. This prevents disruption of lab and lecture sequences by holidays.\n\n" +
      "• Current active Day Order is displayed on your **Student Portal**.\n" +
      "• Head over to the **Lecture Timetable** page for your hour-by-hour classroom and laboratory allocations.";
  } else if (msg.includes('mark') || msg.includes('exam') || msg.includes('cgpa') || msg.includes('gpa') || msg.includes('cla') || msg.includes('grade')) {
    responseText = "📈 **Assessment & Grading Structure:**\n\n" +
      "Academic evaluation is divided into:\n" +
      "• **Internal Assessment (60%)**: CLA-1, CLA-2, and lab assessments conducted during the semester.\n" +
      "• **End-Semester Examination (40%)**: University central comprehensive theory/practical exams.\n\n" +
      "Check the **Marks Scorecard** tab for your recorded internals, class averages, and grade projections.";
  } else if (msg.includes('internship') || msg.includes('job') || msg.includes('placement') || msg.includes('stipend')) {
    responseText = "💼 **Industry Placements & Internships:**\n\n" +
      "Current top campus hiring drives include Amazon AWS, Microsoft Azure, Google Cloud, and Deloitte.\n\n" +
      "Navigate to the **Internship Hub** from the sidebar drawer to view eligible openings, stipends (up to ₹1,20,000/mo), and one-click application links!";
  } else if (msg.includes('hackathon') || msg.includes('contest') || msg.includes('code') || msg.includes('competition')) {
    responseText = "🚀 **Hackathons & Coding Contests:**\n\n" +
      "SRM students regularly participate in national hackathons including Smart India Hackathon (SIH), HackSRM, ETHIndia, and departmental codathons.\n\n" +
      "Open the **Hackathons Hub** to explore live competitions, prize pools up to ₹5,00,000, deadlines, and direct registration links.";
  } else {
    responseText = `🎓 **SRM GPT Assistant:**\n\n` +
      `Regarding "${userMessage}":\n\n` +
      `Our campus AI engine is synchronized with the SRM Academia academic system. You can review your attendance records, lecture timetables, and academic marks from your student navigation menu.\n\n` +
      `For specialized academic questions or syllabus inquiries, consult your faculty mentor during designated consultation hours.`;
  }

  // Stream out response in realistic typewriter chunks
  const words = responseText.split(' ');
  let idx = 0;
  const interval = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(interval);
      return;
    }
    if (idx < words.length) {
      const chunk = (idx === 0 ? '' : ' ') + words[idx];
      res.write(chunk);
      idx++;
    } else {
      clearInterval(interval);
      res.end();
    }
  }, 35);
}

// ✅ Resilient STREAMING AI route
app.post('/ask-ai-stream', (req, res) => {
  const userMessage = req.body?.message || '';
  console.log('Received:', userMessage);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  let child;
  let hasHandledError = false;

  try {
    child = spawn('ollama', ['run', 'phi3'], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    console.warn('⚠️ Ollama spawn exception:', err.message);
    return streamSimulatedAIResponse(userMessage, res);
  }

  // CRITICAL: Prevent crash if ollama is not found (ENOENT)
  child.on('error', (err) => {
    if (hasHandledError) return;
    hasHandledError = true;
    console.warn(`⚠️ Ollama not available (${err.code}). Using built-in campus AI response.`);
    streamSimulatedAIResponse(userMessage, res);
  });

  if (child.stdin) {
    child.stdin.on('error', (err) => {
      console.warn('⚠️ child.stdin stream error:', err.message);
    });
    try {
      child.stdin.write(userMessage + '\n');
      child.stdin.end();
    } catch (e) {
      console.warn('⚠️ Error writing to child.stdin:', e.message);
    }
  }

  let receivedAnyData = false;

  child.stdout.on('data', (chunk) => {
    receivedAnyData = true;
    if (!res.writableEnded) {
      res.write(chunk);
    }
  });

  child.stderr.on('data', (err) => {
    console.error('Ollama stderr:', err.toString());
  });

  child.on('close', (code) => {
    if (hasHandledError) return;
    if (!receivedAnyData && code !== 0) {
      console.warn(`⚠️ Ollama exited with code ${code} without output. Using fallback.`);
      streamSimulatedAIResponse(userMessage, res);
    } else {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
});


app.post('/submit-hackathon', (req, res) => {
  const { hackathonName, collegeName, mode, deadline, fees, link, details } = req.body;

  const query = `
    INSERT INTO hackathons (hackathonName, collegeName, mode, deadline, fees, link, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(query, [hackathonName, collegeName, mode, deadline, fees, link, details], function (err) {
    if (err) {
      console.error('❌ Error saving hackathon:', err.message);
      return res.json({ success: false, message: 'Database error' });
    }
    res.json({ success: true });
  });
});



const handleStudentInfo = (req, res) => {
  const auth = getStudentAuth(req);
  const id = auth.id;

  if (!id) {
    return res.redirect('/');
  }

  db.get('SELECT * FROM students WHERE id = ?', [id], (err, student) => {
    if (err || !student) {
      console.error('❌ Error fetching student:', err?.message);
      return res.redirect('/');
    }

    res.render('student_info', {
      id: student.id,
      name: student.name,
      className: student.className,
      semester: student.semester,
      year: student.year,
      course: student.course
    });
  });
};

app.get('/student-info', handleStudentInfo);
app.post('/student-info', handleStudentInfo);

// Safety handlers for GET requests to teacher / secondary routes to prevent 'Cannot GET' on page refresh
app.get('/teacher-login', (req, res) => res.redirect('/login1'));
app.get('/marks-login', (req, res) => res.redirect('/marks_login.html'));
app.get('/upload-images', (req, res) => res.redirect('/student-profile'));
app.get('/mark-attendance', (req, res) => res.redirect('/login1'));





// ✅ Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ ERROR: Port ${PORT} is already in use by another running process!`);
    console.error(`👉 Run 'fuser -k ${PORT}/tcp' or choose another port with 'PORT=3001 node server.js'.`);
  } else {
    console.error('❌ Server startup error:', err);
  }
  process.exit(1);
});
