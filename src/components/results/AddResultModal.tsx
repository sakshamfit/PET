import React, { useState, useEffect } from 'react';
import {
  X,
  Award,
  Plus,
  Trash2,
  Save,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { Student, SubjectMarks, StudentResult } from '../../types';
import { getTodayDateString, calculateGrade } from '../../utils/helpers';

interface AddResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  student?: Student | null;
  initialClassId?: string;
  onSaved?: (newResult: StudentResult) => void;
}

export const AddResultModal: React.FC<AddResultModalProps> = ({
  isOpen,
  onClose,
  student: initialStudent,
  initialClassId,
  onSaved,
}) => {
  const { db, addResult, currentUser } = useSchool();

  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    initialStudent?.id || ''
  );
  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialStudent?.classId ||
      initialClassId ||
      currentUser?.assignedClassId ||
      db.classes[0]?.id ||
      'cls_05'
  );

  const [examName, setExamName] = useState('Annual Final Examination 2025-26');
  const [examDate, setExamDate] = useState(getTodayDateString());
  const [remarks, setRemarks] = useState('Excellent performance throughout the academic session.');

  // Default subjects
  const [subjects, setSubjects] = useState<SubjectMarks[]>([
    { subject: 'Mathematics', maxMarks: 100, obtainedMarks: 90, grade: 'A+' },
    { subject: 'Science', maxMarks: 100, obtainedMarks: 85, grade: 'A' },
    { subject: 'English', maxMarks: 100, obtainedMarks: 82, grade: 'A' },
    { subject: 'Hindi', maxMarks: 100, obtainedMarks: 88, grade: 'A' },
    { subject: 'Social Studies', maxMarks: 100, obtainedMarks: 86, grade: 'A' },
  ]);

  const classStudents = db.students.filter(
    s => s.classId === selectedClassId && s.status === 'active'
  );

  useEffect(() => {
    if (initialStudent) {
      setSelectedStudentId(initialStudent.id);
      setSelectedClassId(initialStudent.classId);
    } else if (classStudents.length > 0 && !selectedStudentId) {
      setSelectedStudentId(classStudents[0].id);
    }
  }, [initialStudent, selectedClassId, classStudents]);

  if (!isOpen) return null;

  const currentStudent =
    db.students.find(s => s.id === selectedStudentId) ||
    initialStudent ||
    classStudents[0];

  const updateSubjectMarks = (index: number, field: keyof SubjectMarks, value: any) => {
    setSubjects(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'obtainedMarks' || field === 'maxMarks') {
        const obt = Number(updated[index].obtainedMarks) || 0;
        const max = Number(updated[index].maxMarks) || 100;
        const pct = max > 0 ? (obt / max) * 100 : 0;
        updated[index].grade = calculateGrade(pct).grade;
      }
      return updated;
    });
  };

  const addSubjectRow = () => {
    setSubjects(prev => [
      ...prev,
      { subject: 'Computer Science', maxMarks: 100, obtainedMarks: 90, grade: 'A+' },
    ]);
  };

  const removeSubjectRow = (index: number) => {
    if (subjects.length <= 1) return;
    setSubjects(prev => prev.filter((_, i) => i !== index));
  };

  const totalMax = subjects.reduce((a, b) => a + Number(b.maxMarks || 0), 0);
  const totalObt = subjects.reduce((a, b) => a + Number(b.obtainedMarks || 0), 0);
  const overallPercentage = totalMax > 0 ? Number(((totalObt / totalMax) * 100).toFixed(1)) : 0;
  const overallGrade = calculateGrade(overallPercentage).grade;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentStudent) {
      alert('Please select a student first');
      return;
    }

    const saved = addResult({
      studentId: currentStudent.id,
      studentName: currentStudent.name,
      rollNumber: currentStudent.rollNumber,
      classId: currentStudent.classId,
      className: currentStudent.className,
      examName,
      examDate,
      academicYear: currentStudent.academicYear || db.schoolInfo.currentAcademicYear || '2025-26',
      subjects,
      totalMarks: totalObt,
      totalMaxMarks: totalMax,
      percentage: overallPercentage,
      grade: overallGrade,
      remarks,
    });

    onClose();
    if (onSaved && saved) {
      onSaved(saved);
    }
  };

  const examPresets = [
    'Annual Final Examination 2025-26',
    'Half-Yearly Examination 2025-26',
    'Quarterly Examination',
    'Unit Test 1',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-[20px] border border-[#e5e5ea] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col text-[#1d1d1f]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#f0f0f0] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#af52de]/10 text-[#af52de]">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Record Student Evaluation</h3>
              <p className="text-xs text-[#86868b]">
                {currentStudent ? `${currentStudent.name} • ${currentStudent.className} (Roll #${currentStudent.rollNumber})` : 'Enter subject marks & grades'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Class & Student Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#f5f5f7] p-4 rounded-xl border border-[#e5e5ea]">
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">
                Select Class *
              </label>
              <select
                value={selectedClassId}
                onChange={e => {
                  setSelectedClassId(e.target.value);
                  const firstInClass = db.students.find(
                    s => s.classId === e.target.value && s.status === 'active'
                  );
                  if (firstInClass) setSelectedStudentId(firstInClass.id);
                }}
                className="apple-input bg-white font-medium"
              >
                {db.classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} - Section {c.section}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">
                Select Student *
              </label>
              <select
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
                className="apple-input bg-white font-medium"
              >
                {classStudents.length === 0 ? (
                  <option value="">No Students Registered</option>
                ) : (
                  classStudents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Roll #{s.rollNumber})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Exam Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">
                Examination Name *
              </label>
              <input
                type="text"
                required
                value={examName}
                onChange={e => setExamName(e.target.value)}
                placeholder="e.g. Annual Final Examination"
                className="apple-input"
              />
              {/* Quick Exam Presets */}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {examPresets.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setExamName(preset)}
                    className="text-[11px] bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#86868b] hover:text-[#1d1d1f] px-2.5 py-0.5 rounded-full font-medium transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">
                Examination Date
              </label>
              <input
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                className="apple-input"
              />
            </div>
          </div>

          {/* Subject Marks Table */}
          <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#e5e5ea] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#86868b]">Subject Scores Matrix</span>
              <button
                type="button"
                onClick={addSubjectRow}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-[#0066cc] bg-white px-2.5 py-1 rounded-full border border-[#e5e5ea] shadow-xs"
              >
                <Plus className="h-3 w-3 shrink-0" />
                <span>Add Subject</span>
              </button>
            </div>

            <div className="space-y-2">
              {subjects.map((sub, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={sub.subject}
                    onChange={e => updateSubjectMarks(idx, 'subject', e.target.value)}
                    placeholder="Subject Name"
                    className="flex-1 apple-input bg-white py-1.5 text-xs font-medium"
                  />
                  <input
                    type="number"
                    required
                    min={0}
                    max={sub.maxMarks}
                    value={sub.obtainedMarks}
                    onChange={e => updateSubjectMarks(idx, 'obtainedMarks', Number(e.target.value))}
                    placeholder="Obt"
                    className="w-16 apple-input bg-white py-1.5 px-2 text-xs font-semibold text-center"
                  />
                  <span className="text-xs text-[#86868b]">/</span>
                  <input
                    type="number"
                    required
                    min={1}
                    value={sub.maxMarks}
                    onChange={e => updateSubjectMarks(idx, 'maxMarks', Number(e.target.value))}
                    placeholder="Max"
                    className="w-16 apple-input bg-white py-1.5 px-2 text-xs text-center text-[#86868b]"
                  />
                  <span className="w-10 text-center text-xs font-semibold text-[#0066cc] bg-white border border-[#e5e5ea] py-1.5 rounded-lg">
                    {sub.grade}
                  </span>
                  {subjects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSubjectRow(idx)}
                      className="p-1.5 text-[#86868b] hover:text-[#ff3b30] transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Computed Score Bar */}
          <div className="bg-[#f5f5f7] p-4 rounded-xl border border-[#e5e5ea] flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-[#86868b] block">
                Total Score & Aggregate
              </span>
              <p className="text-sm font-semibold text-[#1d1d1f]">
                {totalObt} / {totalMax} Marks ({overallPercentage}%)
              </p>
            </div>
            <div className="text-right">
              <span className="bg-white border border-[#e5e5ea] px-3 py-1 text-xs font-semibold text-[#0066cc] rounded-full shadow-xs">
                Grade {overallGrade} ({overallPercentage >= 33 ? 'Passed' : 'Needs Improvement'})
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">
              Teacher Evaluation & Remarks
            </label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Outstanding performance in Science and Mathematics."
              className="apple-input"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full apple-btn-primary py-3"
            >
              <Save className="h-4 w-4 mr-2 shrink-0" />
              <span>Save & Publish Report Card</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
