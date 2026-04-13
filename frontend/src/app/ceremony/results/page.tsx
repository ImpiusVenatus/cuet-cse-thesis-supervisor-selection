'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { allocationApi, sessionApi, supervisorsApi, AssignmentResult } from '@/lib/api';
import { Download, Undo2, AlertCircle, CheckCircle } from 'lucide-react';

export default function ResultsPage() {
  const queryClient = useQueryClient();
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);

  const { data: session } = useQuery({
    queryKey: ['session'],
    queryFn: sessionApi.get,
  });

  const { data: results, isLoading } = useQuery({
    queryKey: ['results'],
    queryFn: allocationApi.getResults,
    refetchInterval: 3000,
  });

  const { data: supervisors } = useQuery({
    queryKey: ['supervisors'],
    queryFn: supervisorsApi.list,
  });

  const undoMutation = useMutation({
    mutationFn: allocationApi.undo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['supervisors'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
      alert('Assignment undone successfully');
    },
    onError: (err: Error) => alert(err.message),
  });

  const handleExport = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_URL}/api/allocation/export`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'thesis_results.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert('Failed to export');
    }
  };

  const handleUndo = (studentId: number) => {
    if (confirm('Are you sure you want to undo this assignment?')) {
      undoMutation.mutate(studentId);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center h-64 items-center text-gray-500">Loading...</div>;
  }

  const isComplete = session?.session_status === 'completed';
  const assignedCount = results?.length || 0;
  const totalCount = session?.total_students || 0;

  // Group by supervisor
  const bySupervisor: Record<string, AssignmentResult[]> = {};
  results?.forEach((r) => {
    const key = r.supervisor_name;
    if (!bySupervisor[key]) bySupervisor[key] = [];
    bySupervisor[key].push(r);
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Results</h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          {isComplete ? (
            <CheckCircle className="w-6 h-6 text-green-600" />
          ) : (
            <AlertCircle className="w-6 h-6 text-yellow-600" />
          )}
          <div>
            <h3 className="text-lg font-semibold">
              {isComplete ? 'Session Complete' : 'In Progress'}
            </h3>
            <p className="text-sm text-gray-500">
              {assignedCount}/{totalCount} students assigned
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-500">Assigned</div>
            <div className="text-2xl font-bold text-green-600">{assignedCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Unassigned</div>
            <div className="text-2xl font-bold text-yellow-600">{totalCount - assignedCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Choice Assignments</div>
            <div className="text-2xl font-bold">
              {results?.filter(r => r.assignment_type === 'choice').length || 0}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Lottery Assignments</div>
            <div className="text-2xl font-bold">
              {results?.filter(r => r.assignment_type === 'lottery').length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* By Supervisor */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Assignments by Supervisor</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(bySupervisor).map(([supName, students]) => (
            <div key={supName} className="border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium mb-2">{supName}</h4>
              <p className="text-sm text-gray-500 mb-3">{students.length} students</p>
              <div className="space-y-1">
                {students.slice(0, 5).map((s) => (
                  <div key={s.student_id} className="text-sm flex justify-between">
                    <span>{s.student_name}</span>
                    <span className="text-gray-400 font-mono">#{s.merit_rank}</span>
                  </div>
                ))}
                {students.length > 5 && (
                  <div className="text-sm text-gray-400">+{students.length - 5} more</div>
                )}
              </div>
            </div>
          ))}
          {Object.keys(bySupervisor).length === 0 && (
            <p className="text-gray-500 text-center py-8 col-span-full">No assignments yet</p>
          )}
        </div>
      </div>

      {/* Full Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <h3 className="text-lg font-semibold p-6 pb-0">All Assignments</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Rank</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Student</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Supervisor</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Time</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results?.map((result) => (
                <tr
                  key={result.student_id}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedStudent(expandedStudent === result.student_id ? null : result.student_id)}
                >
                  <td className="px-4 py-3 font-mono">{result.merit_rank}</td>
                  <td className="px-4 py-3 font-medium">{result.student_name}</td>
                  <td className="px-4 py-3">{result.supervisor_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      result.assignment_type === 'choice'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {result.assignment_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {result.assignment_time ? new Date(result.assignment_time).toLocaleTimeString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUndo(result.student_id); }}
                      disabled={undoMutation.isPending}
                      className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!results || results.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No assignments yet. Start the ceremony to begin allocation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
