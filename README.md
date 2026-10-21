<div align="center">

# 🎓 SRM Academia & Academic Administration Portal
### *Enterprise Full-Stack Academic Portal, Attendance Intelligence, Dynamic Cyclic Day-Order Timetable & Career Hub*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-at--2--academic--website.onrender.com-4f46e5?style=for-the-badge&logo=render&logoColor=white)](https://at-2-academic-website.onrender.com)
[![Status](https://img.shields.io/badge/Server%20Status-24%2F7%20Online-10b981?style=for-the-badge&logo=uptimerobot&logoColor=white)](https://at-2-academic-website.onrender.com/health)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-v5.1-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Database](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-00e599?style=for-the-badge&logo=postgresql&logoColor=black)](https://neon.tech/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

> **SRM Academia** is a high-performance academic management platform built for higher-education institutions. It provides real-time attendance compliance tracking, dynamic 5-day cyclic timetable management, internal assessment scorecards, campus recruitment & internship discovery, and an AI-driven academic tutor.

---

</div>

## 📌 Quick Access & Demo Credentials

Experience the platform live on Render without manual registration:

| Parameter | Demo Value | Description |
| :--- | :--- | :--- |
| **Live Portal URL** | [https://at-2-academic-website.onrender.com](https://at-2-academic-website.onrender.com) | Production Web Service |
| **Student Roll ID** | `1` | Pre-configured test student profile (*Yash Tomar*) |
| **Portal Password** | `12345678` | Pre-hashed student credential |
| **Health Check** | [`/health`](https://at-2-academic-website.onrender.com/health) | 24/7 UptimeRobot monitoring probe |

---

## 🌟 Key Highlights & Feature Matrix

### 👤 1. Student Portal & Academic Intelligence
- **Glassmorphism Executive UI**: Curated dark-mode aesthetic with custom design tokens, radial glow ambient gradients, and responsive mobile dock navigation.
- **Session Cookie Authentication**: Zero-dependency `student_auth` session management paired with Post/Redirect/Get (PRG) patterns, ensuring seamless page refreshes (`F5`) across every internal route without session loss.
- **Interactive Student Bio**: Displays degree course, active semester progression bar, enrollment section, and verified institutional badge.

### 📊 2. Attendance Tracking & 75% Examination Compliance
- **Course-by-Course Analytics**: Automated tallying of total lecture hours, verified presents, and absences.
- **Compliance Forecasting**: Visual indicators alerting students when attendance approaches or drops below the university examination eligibility threshold (75%).

### 🗓️ 3. Dynamic Cyclic Day-Order Timetable
- **5-Day Cyclical Scheduling**: Prevents curriculum disruption caused by public holidays through an adaptive `Day 1` through `Day 5` rotation engine.
- **Chronological Sorting**: Smart time-slot parser that calculates exact minute offsets (converting `8:00 - 8:50`, `1:25 - 2:15`, etc.) to arrange daily lectures in chronological sequence.
- **Holiday Shift Engine**: Administrative endpoint allowing single-date updates with automatic cascading shift of all future day orders.

### 📈 4. Assessment Scorecard & Marks Registry
- **Categorized Evaluations**: Automatic grouping of internal tests (CLA-1, CLA-2, Lab Internals) by academic subject.
- **Scoring Analytics**: Side-by-side display of marks obtained against total potential marks.

### 💼 5. Career Hub: Internships & Hackathons
- **Campus Placement Drives**: Real-time board listing enterprise internships from top recruiters (Amazon AWS, Microsoft, Google Cloud, Deloitte) with stipend details and one-click application gateways.
- **National Hackathons Board**: Live competition dashboard tracking deadlines, cash prize pools (up to ₹5,00,000), modes (Online/Offline), and direct registration portals.

### 🤖 6. SRM GPT: AI Campus Study Assistant
- **Streaming AI Academic Tutor**: Real-time typewriter response stream (`/ask-ai-stream`) powered by local LLMs via Ollama (`phi3`) with a zero-downtime academic fallback engine.

### 👨‍🏫 7. Faculty & Administration Gateway
- **Faculty Login**: Secure credential verification for department professors (`/login1.html`).
- **One-Click Attendance Logging**: Batch roster checkboxes for marking student presence per lecture hour.
- **Marks Upload Portal**: Batch entry interface for subject teachers to record student assessments.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    Client["🌐 Client Browser\n(Desktop / Mobile)"]
    
    subgraph AppServer ["🚀 Express Application Server (Node.js)"]
        AuthMiddleware["🛡️ Cookie Session & Auth Helper\n(PRG Pattern + SameSite Lax)"]
        Routes["📡 Unified REST & EJS Routes\n(/login, /student-dashboard, /student-marks)"]
        AIEngine["🤖 AI Tutor Service\n(Ollama phi3 / Fallback Stream)"]
        HealthEndpoint["💓 /health & /healthz\n(UptimeRobot 24/7 Keep-Alive)"]
    end

    subgraph DualDB ["💾 Dual-Database Adapter Layer (db.js)"]
        Adapter{"DATABASE_URL\nDefined?"}
        NeonPG[("🐘 Neon Cloud Serverless\nPostgreSQL (Pooled SSL)")]
        LocalSQLite[("📁 Local Embedded\nSQLite3 (student.db)")]
    end

    UptimeRobot["⏰ UptimeRobot Monitor\n(Pings every 12 min)"] --> HealthEndpoint
    Client --> AuthMiddleware
    AuthMiddleware --> Routes
    Routes --> AIEngine
    Routes --> DualDB
    Adapter -- "Production" --> NeonPG
    Adapter -- "Local Dev" --> LocalSQLite
```

---

## 🗄️ Database Architecture & Dual-Adapter Layer

The backend uses a dual-database adapter in [`db.js`](file:///home/yash-tomar/Documents/yash/Project-1/db.js):
- **Cloud Production**: **Neon Serverless PostgreSQL** via connection pooling and SSL (`DATABASE_URL`).
- **Local Fallback**: **SQLite3** (`student.db`) automatically used if no connection string is provided.
- **SQL Dialect Translation**: Translates queries dynamically (such as `AUTOINCREMENT` $\to$ `SERIAL`, automatic quoting of camelCase columns like `"totalMarks"`, `"className"`, `"companyName"`).

### Schema Tables Overview

| Table | Description |
| :--- | :--- |
| `students` | Student biographical profile, degree course, year, semester, and password |
| `subjects` | Registered course catalog linked to each student |
| `attendance` | Daily lecture attendance records (present / absent) by date and subject |
| `timetable` | Scheduled class allocations by Day Order (`Day 1` - `Day 5`) and time slot |
| `day_order_mapping`| Calendar date to Day Order mapping (supports holiday shift sequences) |
| `marks_scores` | Test scores (CLA-1, CLA-2, finals) recorded per student and subject |
| `teachers` | Faculty accounts and class section allocations |
| `internships` | Corporate internship job descriptions, stipends, and apply links |
| `hackathons` | National hackathon competitions, deadlines, prizes, and application URLs |

---

## 📡 API & Routing Directory

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | Serves official student portal login gateway |
| `GET` | `/health`, `/healthz` | Public | Lightweight 24/7 server health probe for UptimeRobot |
| `POST` | `/login` | Public | Authenticates credentials, sets session cookie, redirects via PRG |
| `GET` | `/login` | Dynamic | Redirects authenticated students to profile, otherwise shows login |
| `GET` | `/logout` | Authenticated | Clears `student_auth` session cookie and redirects to `/` |
| `GET / POST`| `/student-profile` | Student | Renders personalized dashboard, day-order classes, and career hub |
| `GET / POST`| `/student-dashboard` | Student | Renders real-time subject-wise attendance analytics and logs |
| `GET / POST`| `/student-marks` | Student | Renders internal assessment scorecard categorized by course |
| `GET / POST`| `/student-info` | Student | Renders official student profile card, registration number, and bio |
| `GET / POST`| `/view-timetable` | Student | Displays hour-by-hour lecture timetable sorted by minutes |
| `GET / POST`| `/view-internships` | Student | Explores corporate internship openings and recruitment drives |
| `GET / POST`| `/view-hackathons` | Student | Explores active coding competitions and hackathons |
| `POST` | `/ask-ai-stream` | Student | Chunked typewriter AI academic assistant response stream |
| `POST` | `/teacher-login` | Faculty | Authenticates faculty credentials and loads classroom roster |
| `POST` | `/save-attendance` | Faculty | Batch saves present/absent roll call records into database |
| `POST` | `/submit-marks` | Faculty | Records internal test scores for all students in a section |

---

## 🛠️ Technology Stack

- **Runtime Environment**: [Node.js (v20+)](https://nodejs.org/)
- **Application Framework**: [Express.js (v5.1)](https://expressjs.com/)
- **View Engine**: [EJS (Embedded JavaScript Templating)](https://ejs.co/)
- **Cloud Database**: [Neon Serverless PostgreSQL](https://neon.tech/) (`pg`)
- **Local Database**: [SQLite3](https://sqlite.org/) (`sqlite3`)
- **Styling & Design System**: Custom Vanilla CSS3 (Glassmorphism, CSS Custom Properties, Plus Jakarta Sans)
- **Deployment Platform**: [Render Web Services](https://render.com/)
- **Availability Monitoring**: [UptimeRobot](https://uptimerobot.com/)

---

## 💻 Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/yash12345-ctrl/AT-2-Academic-Website-.git
cd AT-2-Academic-Website-
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the project root:
```env
PORT=3000

# Optional: Neon PostgreSQL connection string (defaults to local SQLite if omitted)
DATABASE_URL=postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 4. Seed Demo Data (Optional)
```bash
# Seeds initial demo students, timetable, subjects, and day orders
npm run seed
```

### 5. Migrate to Neon PostgreSQL (Optional)
```bash
# Automatically creates all 9 tables in Neon and migrates local data
npm run migrate:neon
```

### 6. Launch the Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## ☁️ Deployment & 24/7 Availability

### Deploying to Render
1. Create a new **Web Service** on [Render](https://render.com/).
2. Connect your GitHub repository: `yash12345-ctrl/AT-2-Academic-Website-`.
3. Set build and start commands:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. In **Environment Variables**, add:
   - `DATABASE_URL`: Your Neon PostgreSQL pooled connection URI.

### 24/7 Uptime with UptimeRobot (Prevent Render Sleeping)
Render free tier instances sleep after 15 minutes of idle time. To keep the server awake 24/7:
1. Go to [UptimeRobot](https://uptimerobot.com/) $\to$ **Add New Monitor**.
2. **Monitor Type**: `HTTP(s)`
3. **Friendly Name**: `Academic Portal Monitor`
4. **URL**: `https://at-2-academic-website.onrender.com/health`
5. **Monitoring Interval**: `12 minutes` (or `5 minutes`)
6. Click **Create Monitor**. The `/health` route will receive a heartbeat every 12 minutes, keeping the instance active 24/7.

---

## 🔒 Security & Reliability Best Practices

- **Zero-Crash Page Refreshes**: Employs the Post/Redirect/Get (PRG) pattern combined with HTTP-Only cookies so users never encounter `Cannot GET /login` or `Cannot GET /student-dashboard`.
- **Environment Isolation**: `.gitignore` strictly guards `.env`, credentials, local database files, and uploaded user files against public Git tracking.
- **SQL Injection Prevention**: All queries utilize parameterized statements (`?` / `$1`, `$2`) across both SQLite and PostgreSQL adapters.
- **Resilient AI Pipeline**: Non-blocking child process streaming with automatic graceful fallback if Ollama is not installed on the host.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free for educational and institutional modification.

<div align="center">
<sub>Crafted with passion for modern academic institutions.</sub>
</div>
