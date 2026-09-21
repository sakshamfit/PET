import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSchool } from '../../context/SchoolContext';

export const AcademicYearView: React.FC = () => {
  const { db, promoteStudents, updateSchoolSettings } = useSchool();

  const [currentYear, setCurrentYear] = useState(db.schoolInfo.currentAcademicYear);
  const [sourceClassId, setSourceClassId] = useState(db.classes[0]?.id || 'cls_05');
  const [targetClassId, setTargetClassId] = useState(db.classes[1]?.id || 'cls_06');
  const [nextAcademicYear, setNextAcademicYear] = useState('2026-27');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [promotionSuccessMsg, setPromotionSuccessMsg] = useState<string | null>(null);

  // Active students in source class
  const sourceStudents = useMemo(() => {
    return db.students.filter(s => s.classId === sourceClassId && s.status === 'active');
  }, [db.students, sourceClassId]);

  const selectAll = () => {
    setSelectedStudentIds(sourceStudents.map(s => s.id));
  };

  const clearAll = () => {
    setSelectedStudentIds([]);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handlePromote = () => {
    if (selectedStudentIds.length === 0) return;

    const sourceClass = db.classes.find(c => c.id === sourceClassId);
    const targetClass = db.classes.find(c => c.id === targetClassId);

    promoteStudents(sourceClassId, targetClassId, selectedStudentIds, nextAcademicYear);

    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {}

    setPromotionSuccessMsg(
      `Successfully promoted ${selectedStudentIds.length} students from ${sourceClass?.name} to ${targetClass?.name} for session ${nextAcademicYear}!`
    );

    setSelectedStudentIds([]);
    setTimeout(() => setPromotionSuccessMsg(null), 5000);
  };

  const handleSetCurrentAcademicYear = (e: React.FormEvent) => {
    e.preventDefault();
    updateSchoolSettings({ currentAcademicYear: currentYear });
  };

  const sourceClassObj = db.classes.find(c => c.id === sourceClassId);
  const targetClassObj = db.classes.find(c => c.id === targetClassId);

  return (
    <div className="space-y-6 pb-16 text-[#1d1d1f]">
      {/* Header */}
      <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-6 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.022em] text-[#1d1d1f]">
              Academic Session & Student Promotion
            </h2>
            <p className="text-xs text-[#86868b]">
              Batch promote students to the next grade while preserving historic archives
            </p>
          </div>
        </div>
      </div>

      {/* Current Session Setting */}
      <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-6 shadow-xs">
        <h3 className="font-semibold text-sm text-[#1d1d1f] mb-3">
          Current Academic Session
        </h3>
        <form onSubmit={handleSetCurrentAcademicYear} className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="text"
            value={currentYear}
            onChange={e => setCurrentYear(e.target.value)}
            placeholder="e.g. 2025-26"
            className="apple-input max-w-sm font-medium"
          />
          <button
            type="submit"
            className="apple-btn-primary py-2.5"
          >
            Update Session
          </button>
        </form>
      </div>

      {/* Student Promotion Workspace */}
      <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-6 space-y-5 shadow-xs">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-[#0066cc] shrink-0" />
          <h3 className="font-semibold text-sm text-[#1d1d1f]">
            Annual Promotion Workflow
          </h3>
        </div>

        {promotionSuccessMsg && (
          <div className="bg-[#30d158]/10 border border-[#30d158]/30 rounded-xl p-4 text-xs font-semibold text-[#30d158] flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{promotionSuccessMsg}</span>
          </div>
        )}

        {/* Promotion Mapping Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#f5f5f7] rounded-xl border border-[#e5e5ea]">
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">
              Source Class (Promoting From)
            </label>
            <select
              value={sourceClassId}
              onChange={e => {
                setSourceClassId(e.target.value);
                setSelectedStudentIds([]);
              }}
              className="apple-input bg-white font-medium"
            >
              {db.classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (Section {c.section})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">
              Target Class (Promoting To)
            </label>
            <select
              value={targetClassId}
              onChange={e => setTargetClassId(e.target.value)}
              className="apple-input bg-white font-medium"
            >
              {db.classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} (Section {c.section})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">
              Target Academic Session
            </label>
            <input
              type="text"
              value={nextAcademicYear}
              onChange={e => setNextAcademicYear(e.target.value)}
              placeholder="2026-27"
              className="apple-input bg-white font-medium"
            />
          </div>
        </div>

        {/* Student Selection Checklist */}
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#f0f0f0]">
            <div>
              <h4 className="font-semibold text-sm text-[#1d1d1f]">
                Select Students in {sourceClassObj?.name} ({sourceStudents.length} enrolled)
              </h4>
              <p className="text-xs text-[#86868b]">
                {selectedStudentIds.length} students selected for promotion to {targetClassObj?.name}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={selectAll}
                className="apple-btn-secondary py-1 px-3 text-xs"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="apple-btn-secondary py-1 px-3 text-xs"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {sourceStudents.map(student => {
              const isChecked = selectedStudentIds.includes(student.id);

              return (
                <div
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                  className={`cursor-pointer flex items-center justify-between p-3 rounded-xl border transition-all ${
                    isChecked
                      ? 'border-[#0066cc] bg-[#0066cc]/5'
                      : 'border-[#e5e5ea] bg-white hover:border-[#0066cc]/30'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="h-4 w-4 rounded text-[#0066cc] focus:ring-0 pointer-events-none accent-[#0066cc]"
                    />
                    <img
                      src={
                        student.photoUrl ||
                        `https://api.dicebear.com/7.x/adventurer/svg?seed=${student.name}`
                      }
                      alt={student.name}
                      className="h-9 w-9 rounded-full object-cover bg-white apple-product-shadow"
                    />
                    <div className="truncate">
                      <span className="font-semibold text-xs text-[#1d1d1f] block truncate">
                        {student.name}
                      </span>
                      <span className="text-[11px] text-[#86868b]">Roll #{student.rollNumber}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3">
            <button
              type="button"
              disabled={selectedStudentIds.length === 0}
              onClick={handlePromote}
              className={`w-full py-3 apple-btn-primary ${
                selectedStudentIds.length === 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <Sparkles className="h-4 w-4 mr-2 shrink-0" />
              <span>
                Promote {selectedStudentIds.length} Students to {targetClassObj?.name}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
