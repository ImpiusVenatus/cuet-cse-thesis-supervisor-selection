'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi, Student } from '@/lib/api';
import { Plus, Trash2, Edit2, Upload } from 'lucide-react';
import Papa from 'papaparse';

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [formData, setFormData] = useState({
    student_id: '',
    name: '',
    merit_rank: 1,
    email: '',
  });

  const { data: students, isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: () => studentsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: studentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      resetForm();
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Pick<Student, 'name' | 'merit_rank' | 'email'>>;
    }) => studentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: studentsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err: Error) => {
      alert(err.message);
    },
  });

  const importMutation = useMutation({
    mutationFn: studentsApi.import,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      alert(`Successfully imported ${result.created} students. ${result.errors.length} errors.`);
      if (result.errors.length > 0) {
        console.error('Import errors:', result.errors);
      }
      setImportText('');
      setShowImport(false);
    },
    onError: (err: Error) => {
      alert('Import failed: ' + err.message);
    },
  });

  const resetForm = () => {
    setFormData({ student_id: '', name: '', merit_rank: 1, email: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          name: formData.name,
          merit_rank: formData.merit_rank,
          email: formData.email || null,
        },
      });
    } else {
      createMutation.mutate({
        student_id: formData.student_id,
        name: formData.name,
        merit_rank: formData.merit_rank,
        email: formData.email || null,
      });
    }
  };

  const handleEdit = (student: Student) => {
    setFormData({
      student_id: student.student_id,
      name: student.name,
      merit_rank: student.merit_rank,
      email: student.email || '',
    });
    setEditingId(student.id);
    setShowForm(true);
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setImportError('Please paste CSV data');
      return;
    }

    const parsed = Papa.parse(importText.trim(), { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      setImportError('Failed to parse CSV. Please check format.');
      return;
    }

    const data = parsed.data.map((row: any) => ({
      student_id: row.student_id || row['Student ID'] || '',
      name: row.name || row.Name || row['Student Name'] || '',
      merit_rank: parseInt(row.merit_rank || row['Merit Rank'] || row['merit_rank'] || '0', 10),
      email: (String(row.email || row.Email || '').trim()) || null,
    })).filter((r: any) => r.student_id && r.name && r.merit_rank > 0);

    if (data.length === 0) {
      setImportError('No valid rows found. Ensure columns: student_id, name, merit_rank');
      return;
    }

    setImportError('');
    importMutation.mutate(data);
  };

  if (isLoading) return <div className="flex justify-center h-64 items-center text-gray-500">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Students</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      {showImport && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-2">Import Students from CSV</h3>
          <p className="text-sm text-gray-500 mb-3">
            Paste CSV with headers{' '}
            <code className="bg-gray-100 px-1 rounded">student_id,name,merit_rank,email</code>.
            Choice privilege comes from Session Config (top-N merit ranks), not from this file.
          </p>
          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportError(''); }}
            placeholder={'student_id,name,merit_rank,email\n2026001,Ahmed Karim,1,ahmed@email.com\n2026002,Fatima Rahman,2,fatima@email.com'}
            className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
          />
          {importError && <p className="text-red-600 text-sm mt-2">{importError}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={handleImport} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
              Import {importText.trim() ? `(${Papa.parse(importText.trim(), { header: true, skipEmptyLines: true }).data.length} rows)` : ''}
            </button>
            <button onClick={() => { setShowImport(false); setImportText(''); setImportError(''); }} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">{editingId ? 'Edit' : 'Add'} Student</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student ID *</label>
              <input
                type="text"
                required
                value={formData.student_id}
                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Merit Rank *</label>
              <input
                type="number"
                required
                min={1}
                value={formData.merit_rank}
                onChange={(e) => setFormData({ ...formData, merit_rank: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Choice privilege (top-N merit ranks) is set only via Session Config (Choice Threshold), not on this form.
          </p>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              {editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Rank</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Student</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Privilege</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Supervisor</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {students?.map((student) => (
              <tr key={student.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono">{student.merit_rank}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{student.name}</div>
                  <div className="text-sm text-gray-500">{student.student_id}</div>
                </td>
                <td className="px-4 py-3">
                  {student.has_choice_privilege ? (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">Yes</span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">No</span>
                  )}
                  {student.has_forfeited && (
                    <span className="ml-1 px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Forfeited</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {student.supervisor_id ? (
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Assigned</span>
                  ) : (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3">{student.supervisor_name || '-'}</td>
                <td className="px-4 py-3">
                  {student.assignment_type ? (
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      student.assignment_type === 'choice' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'
                    }`}>
                      {student.assignment_type}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(student)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${student.name}?`)) {
                          deleteMutation.mutate(student.id);
                        }
                      }}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!students || students.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No students added yet. Add manually or import CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
