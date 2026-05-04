/**
 * API client for communicating with the FastAPI backend.
 *
 * Browser calls go to this origin (port 8000 by default). Override with `NEXT_PUBLIC_API_URL`
 * for another host, port, or HTTPS in production.
 */
const DEFAULT_API_ORIGIN = 'http://localhost:8000';

export function apiBase(): string {
  const v = process.env.NEXT_PUBLIC_API_URL?.trim();
  return (v || DEFAULT_API_ORIGIN).replace(/\/$/, '');
}

/** WebSocket base (no path); `/ws` is appended in `createWebSocket`. */
function websocketOrigin(): string {
  const b = apiBase();
  if (b) {
    return b.replace(/^http/, 'ws').replace(/^https/, 'wss');
  }
  const explicit = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/?ws\/?$/i, '').replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    const port = process.env.NEXT_PUBLIC_BACKEND_PORT?.trim() || '8000';
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = isLocal ? '127.0.0.1' : h;
    return `${proto}//${host}:${port}`;
  }
  return 'ws://127.0.0.1:8000';
}

function formatFastApiDetail(detail: unknown): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'msg' in item) {
          const o = item as { loc?: unknown[]; msg: string };
          const loc = Array.isArray(o.loc) ? o.loc.filter((x) => x !== 'body').join('.') : '';
          return loc ? `${loc}: ${o.msg}` : o.msg;
        }
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (typeof detail === 'object' && detail !== null && 'msg' in detail) {
    return String((detail as { msg: string }).msg);
  }
  return String(detail);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const prefix = apiBase();
  const res = await fetch(`${prefix}${path}`, {
    ...options,
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const raw = await res.json().catch(() => null);
    const detail =
      raw && typeof raw === 'object' && raw !== null && 'detail' in raw
        ? (raw as { detail: unknown }).detail
        : null;
    const message = formatFastApiDetail(detail) || res.statusText || `HTTP ${res.status}`;
    throw new Error(message);
  }

  // Handle CSV response
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('text/csv')) {
    const text = await res.text();
    return text as unknown as T;
  }

  return res.json();
}

// ============ Batches ============

export interface Batch {
  id: number;
  name: string;
  created_at: string;
}

export const batchesApi = {
  list: () => request<Batch[]>('/api/batches/'),
  create: (name: string) =>
    request<Batch>('/api/batches/', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  setCurrent: (batchId: number) =>
    request<Batch>('/api/batches/current', {
      method: 'PUT',
      body: JSON.stringify({ batch_id: batchId }),
    }),
};

export type StudentCreatePayload = {
  student_id: string;
  name: string;
  merit_rank: number;
  email?: string | null;
};

// ============ Supervisor API ============

export interface Supervisor {
  id: number;
  name: string;
  designation: string;
  email: string | null;
  total_capacity: number;
  choice_capacity: number;
  lottery_capacity: number;
  choice_filled: number;
  lottery_filled: number;
  is_available: boolean;
  created_at: string;
}

export const supervisorsApi = {
  list: () => request<Supervisor[]>('/api/supervisors/'),
  create: (data: Omit<Supervisor, 'id' | 'choice_filled' | 'lottery_filled' | 'is_available' | 'created_at'>) =>
    request<Supervisor>('/api/supervisors/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id: number) => request<Supervisor>(`/api/supervisors/${id}`),
  update: (id: number, data: Partial<Supervisor>) =>
    request<Supervisor>(`/api/supervisors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<void>(`/api/supervisors/${id}`, { method: 'DELETE' }),
  toggleAvailability: (id: number) =>
    request<Supervisor>(`/api/supervisors/${id}/availability`, { method: 'PATCH' }),
};

// ============ Student API ============

export interface Student {
  id: number;
  batch_id: number;
  student_id: string;
  name: string;
  merit_rank: number;
  email: string | null;
  has_choice_privilege: boolean;
  has_forfeited: boolean;
  forfeit_order: number | null;
  supervisor_id: number | null;
  supervisor_name: string | null;
  assignment_type: string | null;
  assignment_time: string | null;
}

export const studentsApi = {
  list: (batchId?: number) =>
    request<Student[]>(
      batchId != null ? `/api/students/?batch_id=${batchId}` : '/api/students/'
    ),
  create: (data: StudentCreatePayload) =>
    request<Student>('/api/students/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  import: (data: StudentCreatePayload[]) =>
    request<{ created: number; errors: { student_id: string; error: string }[]; total_attempted: number }>('/api/students/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id: number) => request<Student>(`/api/students/${id}`),
  update: (id: number, data: Partial<Pick<Student, 'name' | 'merit_rank' | 'email'>>) =>
    request<Student>(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<void>(`/api/students/${id}`, { method: 'DELETE' }),
};

// ============ Session API ============

export interface SessionConfig {
  id: number;
  batch_id: number;
  total_students: number;
  choice_threshold: number;
  session_status: 'setup' | 'choice_phase' | 'lottery_phase' | 'completed';
  current_choice_rank: number;
  forfeit_count: number;
  created_at: string;
  updated_at: string;
}

/** Coordinator reset password; must match `RESET_PASSWORD` in `backend/app/routers/session.py`. */
export const SESSION_RESET_PASSWORD = 'reset2026';

export const sessionApi = {
  get: (batchId?: number) =>
    request<SessionConfig>(
      batchId != null ? `/api/session/?batch_id=${batchId}` : '/api/session/'
    ),
  setup: (data: { total_students: number; choice_threshold: number }) =>
    request<SessionConfig>('/api/session/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  startChoice: () =>
    request<SessionConfig>('/api/session/start-choice', { method: 'POST' }),
  startLottery: () =>
    request<SessionConfig>('/api/session/start-lottery', { method: 'POST' }),
  complete: () =>
    request<SessionConfig>('/api/session/complete', { method: 'POST' }),
  reset: (password: string) =>
    request<{ message: string }>(`/api/session/reset?password=${password}`, { method: 'POST' }),
};

// ============ Allocation API ============

export interface QueueState {
  phase: string;
  current_student: Student | null;
  queue: Student[];
  forfeited_students: Student[];
  current_choice_rank: number;
  forfeit_count: number;
}

export interface AssignmentResult {
  student_id: number;
  student_name: string;
  merit_rank: number;
  supervisor_id: number;
  supervisor_name: string;
  assignment_type: string;
  assignment_time: string;
}

export const allocationApi = {
  getQueue: () => request<QueueState>('/api/allocation/queue'),
  choose: (studentId: number, supervisorId: number) =>
    request('/api/allocation/choose', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId, supervisor_id: supervisorId }),
    }),
  forfeit: (studentId: number) =>
    request('/api/allocation/forfeit', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    }),
  skip: (studentId: number) =>
    request('/api/allocation/skip', {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    }),
  runLottery: (mode: string = 'auto') =>
    request('/api/allocation/run-lottery', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  getResults: () => request<AssignmentResult[]>('/api/allocation/results'),
  exportCsv: () => request<string>('/api/allocation/export'),
  undo: (studentId: number) =>
    request(`/api/allocation/undo/${studentId}`, { method: 'POST' }),
};

// ============ WebSocket ============

export function createWebSocket(onMessage: (data: any) => void): WebSocket | null {
  try {
    const ws = new WebSocket(`${websocketOrigin()}/ws`);

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Send ping to keep connection alive
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', event.data);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected. Reconnecting...');
      // Attempt to reconnect after 3 seconds
      setTimeout(() => createWebSocket(onMessage), 3000);
    };

    return ws;
  } catch (e) {
    console.error('Failed to create WebSocket:', e);
    return null;
  }
}
