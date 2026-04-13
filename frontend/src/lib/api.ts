/**
 * API client for communicating with the FastAPI backend.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  // Handle CSV response
  const contentType = res.headers.get('content-type');
  if (contentType?.includes('text/csv')) {
    const text = await res.text();
    return text as unknown as T;
  }

  return res.json();
}

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
  list: () => request<Student[]>('/api/students/'),
  create: (data: Omit<Student, 'id' | 'has_forfeited' | 'forfeit_order' | 'supervisor_id' | 'supervisor_name' | 'assignment_type' | 'assignment_time'>) =>
    request<Student>('/api/students/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  import: (data: Omit<Student, 'id' | 'has_forfeited' | 'forfeit_order' | 'supervisor_id' | 'supervisor_name' | 'assignment_type' | 'assignment_time'>[]) =>
    request<{ created: number; errors: { student_id: string; error: string }[]; total_attempted: number }>('/api/students/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  get: (id: number) => request<Student>(`/api/students/${id}`),
  update: (id: number, data: Partial<Student>) =>
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
  total_students: number;
  choice_threshold: number;
  session_status: 'setup' | 'choice_phase' | 'lottery_phase' | 'completed';
  current_choice_rank: number;
  forfeit_count: number;
  created_at: string;
  updated_at: string;
}

export const sessionApi = {
  get: () => request<SessionConfig>('/api/session/'),
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
  const wsUrl = API_URL.replace('http', 'ws').replace('https', 'wss');

  try {
    const ws = new WebSocket(`${wsUrl}/ws`);

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
