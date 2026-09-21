import React from 'react';
import {
  X,
  Printer,
  Award,
  GraduationCap,
  Phone,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { StudentResult, Student } from '../../types';
import { formatDate } from '../../utils/helpers';
import { openWhatsAppMarksheetMessage } from '../../utils/whatsapp';

interface PrintableMarksheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: StudentResult | null;
  student?: Student | null;
}

export const PrintableMarksheetModal: React.FC<PrintableMarksheetModalProps> = ({
  isOpen,
  onClose,
  result,
  student,
}) => {
  const { db } = useSchool();

  if (!isOpen || !result) return null;

  const targetStudent =
    student ||
    db.students.find(s => s.id === result.studentId) || {
      id: result.studentId,
      name: result.studentName,
      rollNumber: result.rollNumber,
      classId: result.classId,
      className: result.className,
      admissionNumber: 'MSPS-2025',
      parentName: 'Parent / Guardian',
      parentPhone: '',
      academicYear: result.academicYear,
      status: 'active' as const,
      admissionDate: '',
      createdAt: '',
    };

  const handlePrint = () => {
    window.print();
  };

  const isPassed = result.percentage >= 33;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="w-full max-w-3xl bg-white rounded-[20px] border border-[#e5e5ea] shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:w-full print:max-w-none text-[#1d1d1f]">
        {/* Top Control Bar (Hidden in Print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] bg-white shrink-0 print:hidden">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#af52de]/10 text-[#af52de]">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <span className="text-sm font-semibold text-[#1d1d1f]">
                Student Evaluation Dossier
              </span>
              <p className="text-xs text-[#86868b]">{result.studentName} • {result.className}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => openWhatsAppMarksheetMessage(db.schoolInfo, targetStudent, result)}
              className="apple-btn-secondary py-1.5 px-3 text-xs text-[#30d158]"
            >
              <Phone className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span>WhatsApp</span>
            </button>

            <button
              onClick={handlePrint}
              className="apple-btn-primary py-1.5 px-3.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] flex items-center justify-center transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Marksheet Container */}
        <div
          id="official-report-card"
          className="flex-1 overflow-y-auto p-6 sm:p-8 bg-white text-[#1d1d1f] print:overflow-visible print:p-8"
        >
          {/* Institutional Border Frame */}
          <div className="border border-[#e5e5ea] rounded-2xl p-6 sm:p-8 relative">
            {/* School Header */}
            <div className="text-center pb-5 border-b border-[#e5e5ea]">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-[#0066cc]/10 text-[#0066cc] font-bold text-base mb-2">
                MS
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-[#1d1d1f]">
                {db.schoolInfo.name || 'M.S. Public School'}
              </h1>
              <p className="text-xs text-[#86868b] mt-0.5">
                {db.schoolInfo.tagline || 'Knowledge is Power • Empowering Future Generations'}
              </p>
              <p className="text-[11px] text-[#86868b] mt-1">
                {db.schoolInfo.address || 'Main Campus, School Road'} • Ph: {db.schoolInfo.phone} • Email: {db.schoolInfo.email}
              </p>
              <div className="mt-2.5 inline-flex items-center space-x-3 text-[11px] font-medium text-[#86868b] bg-[#f5f5f7] px-3 py-1 rounded-full">
                <span>Affiliation: {db.schoolInfo.affiliationNumber || 'CBSE/AFF/2024/93821'}</span>
                <span>•</span>
                <span>Session: {result.academicYear}</span>
              </div>
            </div>

            {/* Title */}
            <div className="text-center my-4">
              <span className="inline-block bg-[#0066cc]/10 text-[#0066cc] px-4 py-1 rounded-full text-xs font-semibold">
                Official Academic Performance Report
              </span>
              <h2 className="text-sm font-semibold text-[#1d1d1f] mt-1">
                {result.examName}
              </h2>
            </div>

            {/* Student Biodata Box */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#f5f5f7] p-4 rounded-xl text-xs mb-5 border border-[#e5e5ea]">
              <div>
                <span className="text-[11px] text-[#86868b] block">Student Name</span>
                <span className="font-semibold text-[#1d1d1f] text-xs">{result.studentName}</span>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Class & Section</span>
                <span className="font-semibold text-[#1d1d1f] text-xs">{result.className}</span>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Roll Number</span>
                <span className="font-semibold text-[#1d1d1f] text-xs">#{result.rollNumber}</span>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Admission No</span>
                <span className="font-semibold text-[#1d1d1f] text-xs">{targetStudent.admissionNumber || 'MSPS-2025'}</span>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Parent / Guardian</span>
                <span className="font-semibold text-[#1d1d1f] text-xs">{targetStudent.parentName || '—'}</span>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Date of Issue</span>
                <span className="font-semibold text-[#1d1d1f] text-xs">{formatDate(result.examDate || new Date().toISOString())}</span>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Result Status</span>
                <span
                  className={`font-semibold text-xs ${
                    isPassed ? 'text-[#30d158]' : 'text-[#ff3b30]'
                  }`}
                >
                  {isPassed ? 'Qualified & Promoted' : 'Requires Remediation'}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Overall Grade</span>
                <span className="font-semibold text-[#1d1d1f] text-xs">Grade {result.grade}</span>
              </div>
            </div>

            {/* Subject Marks Table */}
            <div className="overflow-x-auto mb-5">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#f5f5f7] text-[#86868b] font-semibold text-[11px]">
                    <th className="p-2.5 rounded-l-lg w-12 text-center">#</th>
                    <th className="p-2.5">Subject</th>
                    <th className="p-2.5 text-center w-24">Max Marks</th>
                    <th className="p-2.5 text-center w-24">Pass Marks</th>
                    <th className="p-2.5 text-center w-28">Obtained</th>
                    <th className="p-2.5 rounded-r-lg text-center w-20">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f0]">
                  {result.subjects.map((sub, idx) => {
                    const passMark = Math.ceil(sub.maxMarks * 0.33);
                    const subPassed = sub.obtainedMarks >= passMark;
                    return (
                      <tr key={idx} className="hover:bg-[#fafafa]">
                        <td className="p-2.5 text-center text-[#86868b]">
                          {idx + 1}
                        </td>
                        <td className="p-2.5 font-semibold text-[#1d1d1f]">
                          {sub.subject}
                        </td>
                        <td className="p-2.5 text-center text-[#86868b]">
                          {sub.maxMarks}
                        </td>
                        <td className="p-2.5 text-center text-[#86868b]">
                          {passMark}
                        </td>
                        <td className="p-2.5 text-center font-semibold">
                          <span
                            className={
                              subPassed ? 'text-[#1d1d1f]' : 'text-[#ff3b30]'
                            }
                          >
                            {sub.obtainedMarks}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-semibold text-[#0066cc]">
                          {sub.grade}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#f5f5f7] font-semibold text-xs rounded-xl">
                    <td colSpan={2} className="p-2.5 rounded-l-xl text-right text-[#1d1d1f]">
                      Total Aggregate:
                    </td>
                    <td className="p-2.5 text-center text-[#1d1d1f]">
                      {result.totalMaxMarks}
                    </td>
                    <td className="p-2.5 text-center text-[#86868b]">
                      {Math.ceil(result.totalMaxMarks * 0.33)}
                    </td>
                    <td className="p-2.5 text-center font-semibold text-[#1d1d1f]">
                      {result.totalMarks}
                    </td>
                    <td className="p-2.5 rounded-r-xl text-center font-semibold text-[#0066cc]">
                      {result.grade}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Score Summary Box */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[#f5f5f7] p-4 rounded-xl text-xs mb-5 border border-[#e5e5ea]">
              <div>
                <span className="text-[11px] text-[#86868b] block">Percentage Score</span>
                <p className="text-base font-semibold text-[#1d1d1f]">{result.percentage}%</p>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Final Determination</span>
                <p
                  className={`text-xs font-semibold ${
                    isPassed ? 'text-[#30d158]' : 'text-[#ff3b30]'
                  }`}
                >
                  {isPassed ? 'Qualified & Promoted' : 'Requires Retest'}
                </p>
              </div>

              <div>
                <span className="text-[11px] text-[#86868b] block">Benchmark Scale</span>
                <p className="text-[11px] text-[#86868b] mt-0.5">
                  A+ (90-100%) • A (80-89%) • B (70-79%) • C (50-69%)
                </p>
              </div>
            </div>

            {/* Remarks */}
            {result.remarks && (
              <div className="mb-6 p-4 bg-[#f5f5f7] rounded-xl border border-[#e5e5ea] text-xs">
                <span className="font-semibold text-[#1d1d1f] text-[11px] block mb-1">
                  Teacher Observation & Remarks:
                </span>
                <p className="text-[#86868b]">"{result.remarks}"</p>
              </div>
            )}

            {/* Signature Block */}
            <div className="mt-8 pt-6 border-t border-[#e5e5ea] grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <div className="h-10"></div>
                <p className="font-semibold text-[#1d1d1f] border-t border-[#e5e5ea] pt-2">Class Teacher</p>
              </div>

              <div>
                <div className="h-10 flex items-center justify-center">
                  <div className="h-8 w-8 rounded-full border border-dashed border-[#86868b] flex items-center justify-center text-[9px] text-[#86868b] font-medium">
                    Seal
                  </div>
                </div>
                <p className="font-semibold text-[#1d1d1f] border-t border-[#e5e5ea] pt-2">Examination Controller</p>
              </div>

              <div>
                <div className="h-10"></div>
                <p className="font-semibold text-[#1d1d1f] border-t border-[#e5e5ea] pt-2">
                  Principal ({db.schoolInfo.principalName || 'Dr. R.K. Mishra'})
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
