# CUET CSE Thesis Supervisor Selection System

A real-time thesis supervisor allocation system for the CUET CSE Department. This system manages the ceremony where students select thesis supervisors through a two-phase process: a **choice phase** (top-ranked students pick in merit order) followed by a **lottery phase** (remaining students are auto-assigned).

## Features

- **Supervisor Management** — Add, edit, and remove supervisors with configurable capacity (total, choice quota, lottery quota) and availability toggles
- **Student Management** — Add students manually or bulk import via CSV with merit ranking
- **Session Configuration** — Set total students and choice threshold to control who gets priority selection
- **Choice Phase** — Top-N students by merit rank select their preferred supervisor in order
- **Forfeiture** — Privileged students can forfeit their choice and join the front of the lottery queue
- **Lottery Phase** — Auto-assign remaining students to supervisors with available lottery slots (forfeited students get priority)
- **Real-time Updates** — WebSocket-based live synchronization across multiple browser tabs
- **CSV Export** — Download final assignment results as a CSV file
- **Undo & Reset** — Undo individual assignments or hard-reset the entire session (password-protected)

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.11+, FastAPI, Uvicorn, SQLAlchemy, Alembic, Pydantic v2 |
| **Frontend** | Next.js 16 (App Router), TypeScript, Tailwind CSS, @tanstack/react-query, Papa Parse |
| **Database** | SQLite (file-based) |
| **Real-time** | WebSocket (FastAPI) |

## Prerequisites

- **Python 3.11+** — [Download](https://www.python.org/downloads/)
- **Node.js 18+** — [Download](https://nodejs.org/)
- **npm** (comes with Node.js)

## Installation & Setup

### 1. Clone / Navigate to the Project

```bash
cd "CUET Supervisor"
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate a virtual environment
python -m venv venv

# On Windows:
venv\Scripts\activate
# On macOS/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install alembic

# Run database migrations
alembic upgrade head
```

### 3. Frontend Setup

Open a **new terminal** (keep the backend terminal available) and run:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install
```

## Running the Application

You need to start **both** the backend and frontend servers.

### Start the Backend

```bash
cd backend
# Make sure your virtual environment is activated
uvicorn main:app --reload --port 8000
```

The API will be available at **http://localhost:8000**.

Interactive API docs: **http://localhost:8000/docs**

### Start the Frontend

In a **separate terminal**:

```bash
cd frontend
npm run dev
```

The web app will be available at **http://localhost:3000**.

---

Both servers must be running simultaneously.

## Usage Guide

### Phase 1: Setup

Navigate through the tabs in the top navigation bar.

#### 1. Add Supervisors (`/setup/supervisors`)

1. Click **Add Supervisor**
2. Fill in:
   - **Name** (required)
   - **Designation** (Professor / Assoc. Prof. / Asst. Prof. / Lecturer)
   - **Email** (optional)
   - **Total Capacity** — maximum students this supervisor can take
   - **Choice Capacity** — slots reserved for the choice phase
   - **Lottery Capacity** — slots reserved for the lottery phase
3. Toggle **availability** using the switch icon to include/exclude a supervisor from allocation
4. You can **edit** or **delete** supervisors (deletion only allowed if no students are assigned)

#### 2. Add Students (`/setup/students`)

**Option A — Manual Add:**
1. Click **Add Student**
2. Fill in student ID, name, merit rank, and optionally email
3. Check **Has Choice Privilege** if applicable (or let the session config auto-assign)

**Option B — CSV Import:**
1. Click **Import CSV**
2. Paste CSV data with headers:
   ```
   student_id,name,merit_rank,email,has_choice_privilege
   2026001,Ahmed Karim,1,ahmed@email.com,true
   2026002,Fatima Rahman,2,fatima@email.com,true
   2026003,Rafiq Hasan,21,rafiq@email.com,false
   ```
3. Click **Import**

#### 3. Configure Session (`/setup/config`)

1. Set **Total Students** — the expected number of students in the ceremony
2. Set **Choice Threshold** — the top-N students (by merit rank) who get to choose their supervisor
   - Example: threshold of `20` means ranks 1–20 get choice privilege, rank 21+ go directly to lottery
3. Click **Configure & Save**

This will automatically mark the top-N students with choice privilege.

---

### Phase 2: Ceremony

#### Choice Phase (`/ceremony/choice`)

1. Go to **Config** and click **Start Choice Phase** (or navigate directly to `/ceremony/choice`)
2. The current student (by merit rank) is displayed
3. **To assign:**
   - Select a supervisor from the available list (shows remaining slots)
   - Click **Confirm Choice**
4. **To forfeit:**
   - Click **Forfeit** and confirm
   - The student loses choice privilege and joins the front of the lottery queue
5. **To skip:**
   - Click **Skip** — the student remains unassigned, moves to the next rank
6. The queue sidebar shows upcoming students and any who have forfeited

The phase automatically ends when all privileged students have been processed.

#### Lottery Phase (`/ceremony/lottery`)

1. Go to **Config** and click **Start Lottery Phase** (or navigate directly)
2. Review the queue:
   - **Forfeited students** appear first (in forfeit order)
   - **Remaining unassigned students** appear next (by merit rank)
3. Check supervisor availability (shows remaining lottery slots)
4. Click **Run Lottery** to auto-assign all remaining students
5. Results appear immediately showing all assignments

---

### Phase 3: Results

#### View Results (`/ceremony/results`)

- **Summary card** shows assigned/unassigned counts, choice vs lottery breakdown
- **By Supervisor** view groups assignments per supervisor
- **Full table** lists every assignment with rank, student, supervisor, type, and time
- **Undo** any individual assignment using the undo button (reopens the slot)
- **Export CSV** downloads the complete results file

#### Reset Session

If you need to start over:
1. Go to **Config** → **Danger Zone**
2. Click **Reset Session**
3. Enter the reset password (default: `reset2026`)
4. Click **Confirm Reset**

This clears all student assignments, resets supervisor counters, and returns to setup phase.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| **Supervisors** | | |
| GET | `/api/supervisors/` | List all supervisors |
| POST | `/api/supervisors/` | Create supervisor |
| GET | `/api/supervisors/{id}` | Get supervisor |
| PUT | `/api/supervisors/{id}` | Update supervisor |
| DELETE | `/api/supervisors/{id}` | Delete supervisor |
| PATCH | `/api/supervisors/{id}/availability` | Toggle availability |
| **Students** | | |
| GET | `/api/students/` | List all students |
| POST | `/api/students/` | Create student |
| POST | `/api/students/import` | Bulk import students |
| PUT | `/api/students/{id}` | Update student |
| DELETE | `/api/students/{id}` | Delete student (setup phase only) |
| **Session** | | |
| GET | `/api/session/` | Get session config |
| POST | `/api/session/setup` | Initialize session |
| POST | `/api/session/start-choice` | Start choice phase |
| POST | `/api/session/start-lottery` | Start lottery phase |
| POST | `/api/session/complete` | Mark session complete |
| POST | `/api/session/reset?password=...` | Hard reset session |
| **Allocation** | | |
| GET | `/api/allocation/queue` | Get queue state |
| POST | `/api/allocation/choose` | Student chooses supervisor |
| POST | `/api/allocation/forfeit` | Student forfeits choice |
| POST | `/api/allocation/skip` | Skip current student |
| POST | `/api/allocation/run-lottery` | Run auto lottery |
| GET | `/api/allocation/results` | Get assignment results |
| GET | `/api/allocation/export` | Export results as CSV |
| POST | `/api/allocation/undo/{id}` | Undo a student's assignment |

**WebSocket:** `ws://localhost:8000/ws` — receives real-time events for slot updates, queue advances, assignments, and phase changes.

## Project Structure

```
CUET Supervisor/
├── backend/
│   ├── app/
│   │   ├── db/                  # Database connection & session
│   │   ├── engine/              # Core allocation logic
│   │   ├── models/              # SQLAlchemy models
│   │   ├── routers/             # FastAPI API endpoints
│   │   ├── schemas/             # Pydantic validation schemas
│   │   └── websocket/           # WebSocket handler
│   ├── alembic/                 # Database migrations
│   ├── data/                    # SQLite database file
│   ├── main.py                  # FastAPI app entry point
│   ├── requirements.txt         # Python dependencies
│   └── alembic.ini              # Alembic configuration
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── ceremony/        # Choice, Lottery, Results pages
│   │   │   ├── setup/           # Supervisors, Students, Config pages
│   │   │   ├── dashboard/       # Overview dashboard
│   │   │   ├── layout.tsx       # Root layout with navigation
│   │   │   └── page.tsx         # Home (redirects to dashboard)
│   │   ├── components/
│   │   │   └── providers.tsx    # React Query provider
│   │   └── lib/
│   │       └── api.ts           # API client + WebSocket
│   ├── .env.local               # Environment variables
│   └── package.json             # Node dependencies
└── README.md
```

## Business Rules

1. **Choice Privilege** — Only the top-N students (by merit rank, configurable) get to choose their supervisor
2. **Merit Order** — Privileged students select in ascending merit rank order (rank 1 picks first)
3. **Forfeiture** — A privileged student may forfeit → they join the **front** of the lottery queue in forfeit order
4. **Lottery Order** — Forfeited students first (by forfeit order), then remaining unassigned students (by merit rank)
5. **Capacity** — Each supervisor has separate choice and lottery quotas; total capacity is a hard cap
6. **Availability** — Unavailable supervisors are excluded from allocation

## Troubleshooting

| Problem | Solution |
|---|---|
| Backend won't start | Ensure virtual environment is activated and `pip install -r requirements.txt` has been run |
| `alembic upgrade head` fails | Make sure you're in the `backend/` directory and the database file path is accessible |
| Frontend shows errors | Run `npm install` in the `frontend/` directory |
| Can't connect to API | Verify `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local` |
| Port already in use | Change the port: `uvicorn main:app --reload --port 8001` (update `.env.local` accordingly) |
| Database is corrupted | Delete `backend/data/thesis.db` and re-run `alembic upgrade head` |
