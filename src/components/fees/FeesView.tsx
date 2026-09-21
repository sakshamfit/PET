import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Phone,
  Search,
  Receipt,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { Student } from '../../types';
import { formatDate } from '../../utils/helpers';
import { openWhatsAppFeeMessage } from '../../utils/whatsapp';

interface FeesViewProps {
  onSelectStudent: (studentId: string) => void;
  onOpenCollectFee: (student: Student) => void;
}

export const FeesView: React.FC<FeesViewProps> = ({
  onSelectStudent,
  onOpenCollectFee,
}) => {
  const { db } = useSchool();
  const [activeTab, setActiveTab] = useState<'accounts' | 'transactions'>('accounts');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'partial' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Overall Financial Statistics
  const totalBilled = db.feeAccounts.reduce((acc, curr) => acc + (curr.totalFee || 0), 0);
  const totalCollected = db.feeAccounts.reduce((acc, curr) => acc + (curr.paidAmount || 0), 0);
  const totalPending = db.feeAccounts.reduce((acc, curr) => acc + (curr.dueAmount || 0), 0);
  const dueStudentsCount = db.feeAccounts.filter(fa => (fa.dueAmount || 0) > 0).length;

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return db.feeAccounts.filter(acc => {
      if (selectedClassId !== 'all' && acc.classId !== selectedClassId) return false;
      if (statusFilter !== 'all' && acc.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = acc.studentName.toLowerCase().includes(q);
        const matchesRoll = acc.rollNumber.includes(q);
        if (!matchesName && !matchesRoll) return false;
      }
      return true;
    });
  }, [db.feeAccounts, selectedClassId, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 pb-16 text-[#1d1d1f]">
      {/* Header Bar */}
      <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff9500]/10 text-[#ff9500]">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.022em] text-[#1d1d1f]">
                Fee Management & Receipts
              </h2>
              <p className="text-xs text-[#86868b]">
                Tuition ledgers, WhatsApp payment reminders, and receipts
              </p>
            </div>
          </div>

          {/* Segmented Switcher */}
          <div className="flex items-center bg-[#f5f5f7] p-1 rounded-full border border-[#e5e5ea]">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                activeTab === 'accounts'
                  ? 'bg-white text-[#1d1d1f] shadow-xs'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              Fee Accounts
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all ${
                activeTab === 'transactions'
                  ? 'bg-white text-[#1d1d1f] shadow-xs'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              Receipts ({db.feeTransactions.length})
            </button>
          </div>
        </div>
      </div>

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-5 shadow-xs">
          <span className="text-xs font-semibold text-[#86868b]">Total Billed</span>
          <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#1d1d1f]">
            ₹{(totalBilled / 1000).toFixed(0)}k
          </p>
          <span className="text-[11px] text-[#86868b]">All enrolled students</span>
        </div>

        <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-5 shadow-xs">
          <span className="text-xs font-semibold text-[#30d158]">Collected</span>
          <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#30d158]">
            ₹{(totalCollected / 1000).toFixed(0)}k
          </p>
          <span className="text-[11px] text-[#30d158] font-medium">
            {totalBilled > 0 ? `${((totalCollected / totalBilled) * 100).toFixed(1)}% Collected` : '0%'}
          </span>
        </div>

        <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-5 shadow-xs">
          <span className="text-xs font-semibold text-[#ff3b30]">Pending Dues</span>
          <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#ff3b30]">
            ₹{(totalPending / 1000).toFixed(0)}k
          </p>
          <span className="text-[11px] text-[#ff3b30] font-medium">{dueStudentsCount} Students with dues</span>
        </div>

        <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-5 shadow-xs">
          <span className="text-xs font-semibold text-[#0066cc]">Collection Rate</span>
          <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#0066cc]">
            {totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(0) : 0}%
          </p>
          <span className="text-[11px] text-[#86868b]">Session {db.schoolInfo.currentAcademicYear}</span>
        </div>
      </div>

      {activeTab === 'accounts' ? (
        <>
          {/* Filters */}
          <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 shadow-xs">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search student or roll number..."
                className="apple-input pl-10"
              />
            </div>

            <div>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="apple-input font-medium"
              >
                <option value="all">All Classes</option>
                {db.classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Section {c.section})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="apple-input font-medium"
              >
                <option value="all">All Statuses ({db.feeAccounts.length})</option>
                <option value="due">Due Only</option>
                <option value="partial">Partially Paid</option>
                <option value="paid">Fully Paid</option>
              </select>
            </div>
          </div>

          {/* Accounts List */}
          <div className="space-y-3">
            {filteredAccounts.length === 0 ? (
              <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-10 text-center text-xs text-[#86868b] shadow-xs">
                No fee accounts match the selected filter.
              </div>
            ) : (
              filteredAccounts.map(fa => {
                const student = db.students.find(s => s.id === fa.studentId);
                const isDue = (fa.dueAmount || 0) > 0;

                return (
                  <div
                    key={fa.id}
                    className="bg-white rounded-[18px] border border-[#e5e5ea] p-4 hover:border-[#0066cc]/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs group"
                  >
                    <div
                      onClick={() => onSelectStudent(fa.studentId)}
                      className="flex items-center space-x-3.5 cursor-pointer flex-1 min-w-0"
                    >
                      <img
                        src={
                          student?.photoUrl ||
                          `https://api.dicebear.com/7.x/adventurer/svg?seed=${fa.studentName}`
                        }
                        alt={fa.studentName}
                        className="h-12 w-12 shrink-0 rounded-full object-cover bg-white apple-product-shadow"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold text-sm text-[#1d1d1f] group-hover:text-[#0066cc] truncate transition-colors">
                            {fa.studentName}
                          </h4>
                          <span className="bg-[#f5f5f7] px-2 py-0.5 rounded-full text-[10px] font-semibold text-[#0066cc]">
                            #{fa.rollNumber}
                          </span>
                        </div>
                        <p className="text-xs text-[#86868b] truncate mt-0.5">
                          {fa.className} • Guardian: {student?.parentName || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Financial Amounts Breakdown */}
                    <div className="flex items-center justify-between sm:justify-end space-x-5 shrink-0 text-xs">
                      <div className="text-right">
                        <span className="text-[11px] text-[#86868b] block">Total / Paid</span>
                        <span className="font-semibold text-[#1d1d1f]">
                          ₹{fa.paidAmount} / ₹{fa.totalFee}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] text-[#86868b] block">Due Amount</span>
                        <span
                          className={`font-semibold text-sm ${
                            isDue ? 'text-[#ff3b30]' : 'text-[#30d158]'
                          }`}
                        >
                          ₹{fa.dueAmount}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2 pl-3 border-l border-[#e5e5ea]">
                        {student && student.parentPhone && (
                          <button
                            onClick={() => openWhatsAppFeeMessage(db.schoolInfo, student, fa)}
                            className="w-8 h-8 rounded-full bg-[#f5f5f7] text-[#30d158] hover:bg-[#30d158] hover:text-white flex items-center justify-center transition-colors"
                            title="Send WhatsApp Notice"
                          >
                            <Phone className="h-4 w-4" />
                          </button>
                        )}

                        {student && (
                          <button
                            onClick={() => onOpenCollectFee(student)}
                            className="apple-btn-primary py-1.5 px-3 text-xs"
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                            <span>Collect</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* Transactions & Receipts Ledger */
        <div className="bg-white rounded-[18px] border border-[#e5e5ea] p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#f0f0f0]">
            <div className="flex items-center space-x-2">
              <Receipt className="h-4 w-4 text-[#0066cc] shrink-0" />
              <h3 className="font-semibold text-[#1d1d1f] text-sm">
                Official Fee Receipts & Payment History
              </h3>
            </div>
          </div>

          <div className="divide-y divide-[#f0f0f0]">
            {db.feeTransactions.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#86868b]">
                No payment transactions recorded yet.
              </p>
            ) : (
              db.feeTransactions.map(tx => (
                <div
                  key={tx.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-[#1d1d1f] text-xs">
                        {tx.receiptNumber}
                      </span>
                      <span className="bg-[#30d158]/10 text-[#30d158] px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase">
                        {tx.paymentMethod}
                      </span>
                    </div>
                    <p className="font-semibold text-[#1d1d1f] mt-1 text-sm">
                      {tx.studentName} • {tx.className}
                    </p>
                    <p className="text-[11px] text-[#86868b] mt-0.5">
                      Date: {formatDate(tx.paymentDate)} • Collected by: {tx.recordedByName}
                    </p>
                    {tx.notes && <p className="text-[11px] text-[#86868b] mt-0.5">Ref: {tx.notes}</p>}
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-base font-semibold text-[#30d158]">
                      ₹{tx.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
