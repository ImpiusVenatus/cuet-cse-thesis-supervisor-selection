'use client';

import { useQuery } from '@tanstack/react-query';
import { sessionApi, supervisorsApi, studentsApi, SessionConfig, Supervisor, Student } from '@/lib/api';
import { Users, UserCheck, GraduationCap, Settings } from 'lucide-react';

export default function DashboardPage() {
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session'],
    queryFn: sessionApi.get,
  });

  const { data: supervisors, isLoading: supLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: supervisorsApi.list,
  });

  const { data: students, isLoading: stuLoading } = useQuery({
    queryKey: ['students'],
    queryFn: studentsApi.list,
  });

  const isLoading = sessionLoading || supLoading || stuLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const totalCapacity = supervisors?.reduce((sum, s) => sum + s.total_capacity, 0) || 0;
  const totalFilled = supervisors?.reduce((sum, s) => sum + s.choice_filled + s.lottery_filled, 0) || 0;
  const assignedStudents = students?.filter(s => s.supervisor_id !== null).length || 0;
  const unassignedStudents = students?.filter(s => s.supervisor_id === null).length || 0;

  const phaseColors: Record<string, string> = {
    setup: 'bg-gray-100 text-gray-800',
    choice_phase: 'bg-blue-100 text-blue-800',
    lottery_phase: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      {/* Session Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Session Status</h3>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${phaseColors[session?.session_status || 'setup']}`}>
            {session?.session_status.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-500">Total Students</div>
            <div className="text-2xl font-bold">{session?.total_students || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Choice Threshold</div>
            <div className="text-2xl font-bold">{session?.choice_threshold || 0}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Current Rank</div>
            <div className="text-2xl font-bold">{session?.current_choice_rank || 1}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Forfeits</div>
            <div className="text-2xl font-bold">{session?.forfeit_count || 0}</div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Users className="w-6 h-6" />}
          label="Supervisors"
          value={supervisors?.length || 0}
          subtext={`${totalFilled}/${totalCapacity} slots filled`}
          color="blue"
        />
        <StatCard
          icon={<GraduationCap className="w-6 h-6" />}
          label="Students"
          value={students?.length || 0}
          subtext={`${assignedStudents} assigned`}
          color="green"
        />
        <StatCard
          icon={<UserCheck className="w-6 h-6" />}
          label="Assigned"
          value={assignedStudents}
          subtext={`${unassignedStudents} remaining`}
          color="purple"
        />
        <StatCard
          icon={<Settings className="w-6 h-6" />}
          label="Phase"
          value={session?.session_status.replace('_', ' ') || 'setup'}
          subtext="Click to manage"
          color="orange"
        />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <a href="/setup/supervisors" className="block p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition">
            <div className="font-medium">Manage Supervisors</div>
            <div className="text-sm text-gray-500">Add, edit, or remove supervisors</div>
          </a>
          <a href="/setup/students" className="block p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition">
            <div className="font-medium">Manage Students</div>
            <div className="text-sm text-gray-500">Import and manage student data</div>
          </a>
          <a href="/setup/config" className="block p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-sm transition">
            <div className="font-medium">Session Config</div>
            <div className="text-sm text-gray-500">Configure and start ceremony</div>
          </a>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtext, color }: { icon: React.ReactNode; label: string; value: string | number; subtext: string; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className={`mb-2 ${colorClasses[color] || 'text-gray-600'}`}>{icon}</div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-400">{subtext}</div>
    </div>
  );
}
