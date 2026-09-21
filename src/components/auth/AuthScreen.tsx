import React, { useState } from 'react';
import {
  Shield,
  KeyRound,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  GraduationCap,
  Smartphone,
  Building2,
} from 'lucide-react';
import { useSchool } from '../../context/SchoolContext';
import { BuildStamp } from '../../build';

export const AuthScreen: React.FC = () => {
  const { db, loginPrincipal, loginTeacher } = useSchool();

  const [authMode, setAuthMode] = useState<'selection' | 'principal_login' | 'teacher_login'>('selection');

  // Principal Login Form State
  // NOTE: authentication now runs through Firebase Auth (password verified
  // by Google, never stored in this app). The email is pre-filled as a
  // convenience only — it is not a credential.
  const [principalEmail, setPrincipalEmail] = useState('mozammilalam1996@gmail.com');
  const [principalPassword, setPrincipalPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [principalBusy, setPrincipalBusy] = useState(false);

  // Teacher Login Form State
  const [teacherCode, setTeacherCode] = useState('');
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const [teacherBusy, setTeacherBusy] = useState(false);

  const handlePrincipalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (principalBusy) return;
    setLoginError(null);
    setPrincipalBusy(true);
    try {
      const res = await loginPrincipal(principalEmail, principalPassword);
      if (!res.success) {
        setLoginError(res.error || 'Invalid email or password');
      }
    } finally {
      setPrincipalBusy(false);
    }
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (teacherBusy) return;
    setTeacherError(null);
    setTeacherBusy(true);
    try {
      const res = await loginTeacher(teacherCode);
      if (!res.success) {
        setTeacherError(res.error || 'Invalid 6-Digit Teacher Code');
      }
    } finally {
      setTeacherBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="w-full max-w-md relative z-10">
        {/* School Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0066cc] text-white mb-4 shadow-md">
            <GraduationCap className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.022em] text-[#1d1d1f]">
            {db.schoolInfo.name || 'M.S. PUBLIC SCHOOL'}
          </h1>
          <p className="text-xs text-[#86868b] mt-1">
            School Management & Performance System
          </p>
          <div className="mt-3 inline-flex items-center space-x-2 bg-white px-3.5 py-1 rounded-full text-xs font-semibold text-[#0066cc] border border-[#e5e5ea] shadow-xs">
            <span>Session: {db.schoolInfo.currentAcademicYear}</span>
          </div>
        </div>

        {/* View 1: Main Selection (Two Cards) */}
        {authMode === 'selection' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Principal Login Card */}
            <div
              onClick={() => setAuthMode('principal_login')}
              className="group cursor-pointer bg-white rounded-[20px] border border-[#e5e5ea] p-5 hover:border-[#0066cc]/40 transition-all duration-200 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0066cc]/10 text-[#0066cc]">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors">
                      Principal Console
                    </h2>
                    <p className="text-xs text-[#86868b] mt-0.5">
                      Full administration, faculty, students, fees & audit
                    </p>
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b] group-hover:bg-[#0066cc] group-hover:text-white transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>

            {/* Teacher Login Card */}
            <div
              onClick={() => setAuthMode('teacher_login')}
              className="group cursor-pointer bg-white rounded-[20px] border border-[#e5e5ea] p-5 hover:border-[#0066cc]/40 transition-all duration-200 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#af52de]/10 text-[#af52de]">
                    <GraduationCap className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#1d1d1f] group-hover:text-[#0066cc] transition-colors">
                      Teacher Portal
                    </h2>
                    <p className="text-xs text-[#86868b] mt-0.5">
                      6-Digit Teacher Code • Multi-Device Access
                    </p>
                  </div>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5f5f7] text-[#86868b] group-hover:bg-[#0066cc] group-hover:text-white transition-colors">
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>

            {/* Multi-Device Support Badge */}
            <div className="flex items-center justify-center space-x-2 text-center pt-2 text-xs text-[#86868b]">
              <Smartphone className="h-3.5 w-3.5 text-[#30d158] shrink-0" />
              <span>Multi-device synchronization enabled</span>
            </div>
          </div>
        )}

        {/* View 2: Principal Login */}
        {authMode === 'principal_login' && (
          <div className="bg-white rounded-[20px] border border-[#e5e5ea] p-6 sm:p-7 shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0f0f0] mb-5">
              <div className="flex items-center space-x-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0066cc]/10 text-[#0066cc]">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[#1d1d1f]">Principal Login</h3>
                  <p className="text-xs text-[#86868b]">Email & Master Password</p>
                </div>
              </div>
              <button
                onClick={() => setAuthMode('selection')}
                className="text-xs font-semibold text-[#0066cc] hover:underline"
              >
                Change Role
              </button>
            </div>

            {loginError && (
              <div className="mb-4 flex items-center space-x-2 bg-[#ff3b30]/10 p-3 rounded-xl text-xs font-semibold text-[#ff3b30]">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#ff3b30]" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handlePrincipalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#86868b] mb-1">
                  Principal Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
                  <input
                    type="email"
                    required
                    value={principalEmail}
                    onChange={e => setPrincipalEmail(e.target.value)}
                    placeholder="mozammilalam1996@gmail.com"
                    className="apple-input pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#86868b] mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#86868b]" />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={principalPassword}
                    onChange={e => setPrincipalPassword(e.target.value)}
                    placeholder="Enter password"
                    className="apple-input pl-10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={principalBusy}
                className="w-full apple-btn-primary py-3 mt-2 flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                <span>{principalBusy ? 'Verifying with Google Firebase…' : 'Access Principal Console'}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </form>
          </div>
        )}

        {/* View 3: Teacher Login with 6-Digit Code */}
        {authMode === 'teacher_login' && (
          <div className="bg-white rounded-[20px] border border-[#e5e5ea] p-6 sm:p-7 shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0f0f0] mb-5">
              <div className="flex items-center space-x-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#af52de]/10 text-[#af52de]">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[#1d1d1f]">Teacher Login</h3>
                  <p className="text-xs text-[#86868b]">6-Digit Access Code</p>
                </div>
              </div>
              <button
                onClick={() => setAuthMode('selection')}
                className="text-xs font-semibold text-[#0066cc] hover:underline"
              >
                Change Role
              </button>
            </div>

            {teacherError && (
              <div className="mb-4 flex items-center space-x-2 bg-[#ff3b30]/10 p-3 rounded-xl text-xs font-semibold text-[#ff3b30]">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#ff3b30]" />
                <span>{teacherError}</span>
              </div>
            )}

            <form onSubmit={handleTeacherSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#86868b] mb-1 text-center">
                  6-Digit Teacher Code
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0066cc]" />
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={10}
                    value={teacherCode}
                    onChange={e => setTeacherCode(e.target.value.toUpperCase())}
                    placeholder="e.g. 501001"
                    className="apple-input pl-10 pr-10 font-mono text-center text-lg font-bold tracking-widest"
                  />
                </div>
                <div className="mt-3 flex items-center justify-center space-x-1.5 text-xs text-[#86868b] bg-[#f5f5f7] py-2 px-3 rounded-xl text-center">
                  <Smartphone className="h-3.5 w-3.5 text-[#30d158] shrink-0" />
                  <span>Works simultaneously on multiple teacher devices</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={teacherBusy}
                className="w-full apple-btn-primary py-3 mt-2 flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                <span>{teacherBusy ? 'Signing in…' : 'Enter Teacher Portal'}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/*
        Build identity, on the screen everyone sees first.
        Until now the stamp lived only behind the login (sidebar footer /
        Settings → About), so "am I looking at the new build?" could not be
        answered without signing in — which is how a deployment can be perfectly
        current while everybody believes it is old. Now it is one glance.
      */}
      <div className="relative z-10 mt-6 text-center">
        <BuildStamp />
        <p className="mt-1 text-[10px] text-[#a1a1a6]">
          Compare with <span className="font-mono">/build-info.json</span> on this URL
        </p>
      </div>
    </div>
  );
};
