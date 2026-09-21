import React, { useState } from 'react';
import {
  X,
  CreditCard,
  Phone,
  Save,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSchool } from '../../context/SchoolContext';
import { Student } from '../../types';
import { getTodayDateString, generateReceiptNumber } from '../../utils/helpers';
import { openWhatsAppFeeMessage } from '../../utils/whatsapp';

interface CollectFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
}

export const CollectFeeModal: React.FC<CollectFeeModalProps> = ({
  isOpen,
  onClose,
  student,
}) => {
  const { db, recordFeeTransaction } = useSchool();

  if (!isOpen || !student) return null;

  const feeAccount = db.feeAccounts.find(fa => fa.studentId === student.id) || {
    id: `fee_${student.id}`,
    studentId: student.id,
    studentName: student.name,
    rollNumber: student.rollNumber,
    classId: student.classId,
    className: student.className,
    totalFee: 24000,
    paidAmount: 0,
    dueAmount: 24000,
    status: 'due' as const,
  };

  const [amount, setAmount] = useState<number>(feeAccount.dueAmount || 5000);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Online' | 'Cheque'>('UPI');
  const [paymentDate, setPaymentDate] = useState(getTodayDateString());
  const [notes, setNotes] = useState('');
  const [receiptNumber] = useState(generateReceiptNumber());
  const [sendWhatsAppOnSuccess, setSendWhatsAppOnSuccess] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    recordFeeTransaction({
      studentId: student.id,
      amount: Number(amount),
      paymentMethod,
      notes,
      paymentDate,
    });

    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 },
      });
    } catch {}

    if (sendWhatsAppOnSuccess && student.parentPhone) {
      const updatedAccount = {
        ...feeAccount,
        paidAmount: feeAccount.paidAmount + amount,
        dueAmount: Math.max(0, feeAccount.dueAmount - amount),
      };
      openWhatsAppFeeMessage(db.schoolInfo, student, updatedAccount);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-[20px] border border-[#e5e5ea] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col text-[#1d1d1f]">
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-5 border-b border-[#f0f0f0] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-[-0.022em] text-[#1d1d1f]">Collect Student Fee</h3>
              <p className="text-xs text-[#86868b]">{student.name} • {student.className}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Current Fee Overview */}
          <div className="bg-[#f5f5f7] p-4 rounded-2xl border border-[#e5e5ea] space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-[#86868b]">Total Billed Fee:</span>
              <span className="font-semibold text-[#1d1d1f]">
                ₹{(feeAccount.totalFee || 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#86868b]">Already Paid:</span>
              <span className="font-semibold text-[#30d158]">
                ₹{(feeAccount.paidAmount || 0).toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between text-xs pt-2 border-t border-[#e5e5ea] font-medium">
              <span className="text-[#1d1d1f]">Outstanding Due:</span>
              <span className="text-[#ff3b30] font-semibold text-sm">
                ₹{(feeAccount.dueAmount || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Amount to Pay with fast presets */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">
              Payment Amount (₹) *
            </label>
            <input
              type="number"
              required
              min={1}
              max={feeAccount.dueAmount || 100000}
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              placeholder="5000"
              className="apple-input text-base font-semibold"
            />

            {feeAccount.dueAmount > 0 && (
              <div className="mt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setAmount(feeAccount.dueAmount)}
                  className="apple-btn-secondary py-1 px-2.5 text-xs text-[#30d158]"
                >
                  Pay Full Due (₹{feeAccount.dueAmount})
                </button>
                <button
                  type="button"
                  onClick={() => setAmount(Math.round(feeAccount.dueAmount / 2))}
                  className="apple-btn-secondary py-1 px-2.5 text-xs"
                >
                  Pay Half (₹{Math.round(feeAccount.dueAmount / 2)})
                </button>
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">
              Payment Method *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['UPI', 'Cash', 'Online', 'Cheque'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMethod(mode)}
                  className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                    paymentMethod === mode
                      ? 'bg-[#0066cc] text-white shadow-xs'
                      : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">
                Receipt Number
              </label>
              <input
                type="text"
                disabled
                value={receiptNumber}
                className="apple-input font-mono text-[#86868b] bg-[#f5f5f7]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#86868b] mb-1">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="apple-input font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#86868b] mb-1">
              Remarks / Transaction ID
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. UPI Ref: 394829381"
              className="apple-input"
            />
          </div>

          {/* WhatsApp toggle */}
          {student.parentPhone && (
            <label className="flex items-center space-x-2.5 bg-[#f5f5f7] p-3 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={sendWhatsAppOnSuccess}
                onChange={e => setSendWhatsAppOnSuccess(e.target.checked)}
                className="h-4 w-4 rounded text-[#30d158] focus:ring-0"
              />
              <div className="flex items-center space-x-1.5 text-xs font-medium text-[#1d1d1f]">
                <Phone className="h-3.5 w-3.5 text-[#30d158] shrink-0" />
                <span>Send WhatsApp Receipt to Parent</span>
              </div>
            </label>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="w-full apple-btn-primary py-3"
            >
              <Save className="h-4 w-4 mr-2 shrink-0" />
              <span>Record Transaction (₹{amount})</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
