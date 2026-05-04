'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi, Student } from '@/lib/api';
import { Plus, Trash2, Edit2, Upload, Loader2 } from 'lucide-react';
import Papa from 'papaparse';

type MessageModalState = {
  title: string;
  message: string;
  variant: 'info' | 'error';
};

type ImportResultModalState = {
  created: number;
  errors: { student_id: string; error: string }[];
};

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editStudentRecord, setEditStudentRecord] = useState<Student | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<Student | null>(null);
  const [messageModal, setMessageModal] = useState<MessageModalState | null>(null);
  const [importResultModal, setImportResultModal] = useState<ImportResultModalState | null>(null);

  /** Add-student panel only */
  const [formData, setFormData] = useState({
    student_id: '',
    name: '',
    merit_rank: 1,
    email: '',
  });
  /** Edit modal only (student_id is readonly) */
  const [editFormData, setEditFormData] = useState({
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
      setMessageModal({
        title: 'Could not add student',
        message: err.message,
        variant: 'error',
      });
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
      setEditStudentRecord(null);
    },
    onError: (err: Error) => {
      setMessageModal({
        title: 'Could not update student',
        message: err.message,
        variant: 'error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: studentsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setConfirmDeleteStudent(null);
    },
    onError: (err: Error) => {
      setConfirmDeleteStudent(null);
      setMessageModal({
        title: 'Could not delete student',
        message: err.message,
        variant: 'error',
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: studentsApi.import,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setImportText('');
      setShowImport(false);
      setImportResultModal({
        created: result.created,
        errors: result.errors ?? [],
      });
      if (result.errors?.length) {
        console.error('Import row errors:', result.errors);
      }
    },
    onError: (err: Error) => {
      setMessageModal({
        title: 'Import failed',
        message: err.message,
        variant: 'error',
      });
    },
  });

  const resetForm = () => {
    setFormData({ student_id: '', name: '', merit_rank: 1, email: '' });
    setShowForm(false);
  };

  const closeEditStudentModal = () => {
    setEditStudentRecord(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      student_id: formData.student_id,
      name: formData.name,
      merit_rank: formData.merit_rank,
      email: formData.email || null,
    });
  };

  const handleEditStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudentRecord) return;
    updateMutation.mutate({
      id: editStudentRecord.id,
      data: {
        name: editFormData.name,
        merit_rank: editFormData.merit_rank,
        email: editFormData.email || null,
      },
    });
  };

  const handleEdit = (student: Student) => {
    setEditFormData({
      name: student.name,
      merit_rank: student.merit_rank,
      email: student.email || '',
    });
    setEditStudentRecord(student);
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

  const importBusy = importMutation.isPending;
  const formBusy = createMutation.isPending || updateMutation.isPending;
  const deleteBusy = deleteMutation.isPending;
  const pageLocked = importBusy;

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-3 text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" aria-hidden />
        <p>Loading students…</p>
      </div>
    );
  }

  return (
    <div className={`max-w-7xl mx-auto px-6 py-8 relative ${pageLocked ? 'select-none' : ''}`}>
      {importBusy && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-900/55 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
          aria-labelledby="import-loading-title"
          aria-busy="true"
        >
          <Loader2 className="w-14 h-14 text-white animate-spin mb-4" aria-hidden />
          <p id="import-loading-title" className="text-lg font-medium text-white">
            Importing students…
          </p>
          <p className="text-sm text-white/85 mt-2 max-w-sm text-center px-4">
            Please wait. Do not navigate away or submit again — duplicate imports will be blocked when this finishes.
          </p>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Students</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => !importBusy && setShowImport(!showImport)}
            disabled={importBusy}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {importBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => !importBusy && setShowForm(!showForm)}
            disabled={importBusy}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            <Plus className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      {showImport && (
        <div className={`bg-white border border-gray-200 rounded-lg p-6 mb-6 ${importBusy ? 'opacity-60 pointer-events-none' : ''}`}>
          <h3 className="text-lg font-semibold mb-2">Import Students from CSV</h3>
          <p className="text-sm text-gray-500 mb-3">
            Paste CSV with headers{' '}
            <code className="bg-gray-100 px-1 rounded">student_id,name,merit_rank,email</code>.
            Choice privilege comes from Session Config (top-N merit ranks), not from this file.
          </p>
          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportError(''); }}
            disabled={importBusy}
            placeholder={'student_id,name,merit_rank,email\n2026001,Ahmed Karim,1,ahmed@email.com\n2026002,Fatima Rahman,2,fatima@email.com'}
            className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm disabled:bg-gray-50 disabled:text-gray-500"
          />
          {importError && <p className="text-red-600 text-sm mt-2">{importError}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={importBusy}
              className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Import{' '}
              {importText.trim()
                ? `(${Papa.parse(importText.trim(), { header: true, skipEmptyLines: true }).data.length} rows)`
                : ''}
            </button>
            <button
              type="button"
              onClick={() => { if (!importBusy) { setShowImport(false); setImportText(''); setImportError(''); } }}
              disabled={importBusy}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className={`bg-white border border-gray-200 rounded-lg p-6 mb-6 ${importBusy ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <h3 className="text-lg font-semibold mb-4">Add Student</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student ID *</label>
              <input
                type="text"
                required
                value={formData.student_id}
                onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                disabled={importBusy || createMutation.isPending}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={importBusy || createMutation.isPending}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
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
                disabled={importBusy || createMutation.isPending}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={importBusy || createMutation.isPending}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Choice privilege (top-N merit ranks) is set only via Session Config (Choice Threshold), not on this form.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={importBusy || createMutation.isPending}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={importBusy || createMutation.isPending}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden ${importBusy ? 'opacity-60 pointer-events-none' : ''}`}>
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
                    <button
                      type="button"
                      onClick={() => !importBusy && handleEdit(student)}
                      disabled={importBusy || formBusy || deleteBusy}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => !importBusy && setConfirmDeleteStudent(student)}
                      disabled={importBusy || formBusy || deleteBusy}
                      className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
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

      {editStudentRecord && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45"
          role="presentation"
          onClick={() => !updateMutation.isPending && closeEditStudentModal()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-student-title"
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-student-title" className="text-lg font-semibold text-gray-900">
              Edit student
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Student ID cannot be changed. Privilege flags follow Session Config after you save.
            </p>
            <form onSubmit={handleEditStudentSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                <input
                  type="text"
                  readOnly
                  value={editStudentRecord.student_id}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  disabled={updateMutation.isPending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Merit rank *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={editFormData.merit_rank}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, merit_rank: parseInt(e.target.value, 10) || 1 })
                  }
                  disabled={updateMutation.isPending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  disabled={updateMutation.isPending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditStudentModal}
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteStudent && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45"
          role="presentation"
          onClick={() => !deleteBusy && setConfirmDeleteStudent(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-student-title"
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-student-title" className="text-lg font-semibold text-gray-900">
              Delete this student?
            </h3>
            <p className="text-gray-600 mt-3 text-sm leading-relaxed">
              Remove <span className="font-medium text-gray-900">{confirmDeleteStudent.name}</span>
              {' '}
              (<span className="font-mono text-gray-800">{confirmDeleteStudent.student_id}</span>) from this cohort.
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setConfirmDeleteStudent(null)}
                disabled={deleteBusy}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(confirmDeleteStudent.id)}
                disabled={deleteBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {messageModal && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45"
          onClick={() => setMessageModal(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="message-modal-title"
            className={`rounded-xl shadow-xl max-w-md w-full p-6 border ${
              messageModal.variant === 'error' ? 'bg-white border-red-200' : 'bg-white border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="message-modal-title" className="text-lg font-semibold text-gray-900">
              {messageModal.title}
            </h3>
            <p className="text-gray-600 mt-2 text-sm whitespace-pre-wrap">{messageModal.message}</p>
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={() => setMessageModal(null)}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {importResultModal && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45"
          onClick={() => setImportResultModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-result-title"
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="import-result-title" className="text-lg font-semibold text-gray-900">
              Import finished
            </h3>
            <p className="text-gray-700 mt-2 text-sm">
              Successfully created <strong>{importResultModal.created}</strong> student
              {importResultModal.created === 1 ? '' : 's'}.
              {importResultModal.errors.length > 0 && (
                <>
                  {' '}
                  <span className="text-amber-800 font-medium">
                    {importResultModal.errors.length} row{importResultModal.errors.length === 1 ? '' : 's'} could not be
                    imported (see below).
                  </span>
                </>
              )}
            </p>
            {importResultModal.errors.length > 0 && (
              <div className="mt-4 border border-amber-200 rounded-lg bg-amber-50/80 overflow-hidden flex-1 min-h-0 flex flex-col">
                <p className="text-xs font-medium text-amber-900 px-3 py-2 border-b border-amber-200">Row errors</p>
                <ul className="text-xs text-amber-950 overflow-y-auto max-h-48 px-3 py-2 space-y-1.5 font-mono">
                  {importResultModal.errors.map((e) => (
                    <li key={`${e.student_id}-${e.error}`}>
                      <span className="font-semibold">{e.student_id}</span>: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={() => setImportResultModal(null)}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
