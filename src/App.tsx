import React, { useState } from 'react';
import { SchoolProvider, useSchool } from './context/SchoolContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MobileQuickActionFAB } from './components/MobileQuickActionFAB';
import { WhatsAppBroadcastModal } from './components/WhatsAppBroadcastModal';
import { PrincipalDashboard } from './components/dashboard/PrincipalDashboard';
import { TeacherDashboard } from './components/dashboard/TeacherDashboard';
import { AttendanceView } from './components/attendance/AttendanceView';
import { StudentsView } from './components/students/StudentsView';
import { StudentProfileModal } from './components/students/StudentProfileModal';
import { AddEditStudentModal } from './components/students/AddEditStudentModal';
import { FeesView } from './components/fees/FeesView';
import { CollectFeeModal } from './components/fees/CollectFeeModal';
import { TeachersView } from './components/teachers/TeachersView';
import { AddTeacherModal } from './components/teachers/AddTeacherModal';
import { TeacherAttendanceView } from './components/teachers/TeacherAttendanceView';
import { ClassesView } from './components/classes/ClassesView';
import { ResultsView } from './components/results/ResultsView';
import { AddResultModal } from './components/results/AddResultModal';
import { PerformanceView } from './components/performance/PerformanceView';
import { AddPerformanceModal } from './components/performance/AddPerformanceModal';
import { ReportsView } from './components/reports/ReportsView';
import { AcademicYearView } from './components/academic/AcademicYearView';
import { ActivityLogsView } from './components/activity/ActivityLogsView';
import { SchoolSettingsView } from './components/settings/SchoolSettingsView';
import { QuickSearchModal } from './components/QuickSearchModal';
import { UpdateBanner, useBuildWatcher } from './build';
import { Student } from './types';

const MainLayout: React.FC = () => {
  const { currentUser, adminImpersonation } = useSchool();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [extraParam, setExtraParam] = useState<any>(null);

  // Global Modals State
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);
  const [collectFeeStudent, setCollectFeeStudent] = useState<Student | null>(null);
  const [isAddTeacherOpen, setIsAddTeacherOpen] = useState(false);
  const [addResultStudent, setAddResultStudent] = useState<Student | null>(null);
  const [addPerformanceStudent, setAddPerformanceStudent] = useState<Student | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);

  // Detects (and loudly reports) a server that is serving a newer build than
  // this page is running — the fix for "Vercel still shows the old build".
  // Quiet on purpose in the desktop/Android shells and while offline.
  const buildWatch = useBuildWatcher();

  if (!currentUser) {
    return (
      <>
        <UpdateBanner watch={buildWatch} />
        <AuthScreen />
      </>
    );
  }

  const isPrincipal = currentUser.role === 'principal' && !adminImpersonation;

  const navigateTab = (tab: string, extra?: any) => {
    setCurrentTab(tab);
    setExtraParam(extra || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenEditStudent = (student: Student) => {
    setStudentToEdit(student);
    setIsAddStudentOpen(true);
  };

  const handleOpenAddStudent = () => {
    setStudentToEdit(null);
    setIsAddStudentOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans flex flex-col antialiased selection:bg-[#0066cc] selection:text-white relative overflow-x-hidden pb-16 lg:pb-0">
      <UpdateBanner watch={buildWatch} />
      {/* Top Application Navbar (Global Nav + Frosted Sub-Nav) */}
      <div className="relative z-30">
        <Navbar
          currentTab={currentTab}
          setCurrentTab={navigateTab}
          onOpenQuickSearch={() => setIsSearchOpen(true)}
        />
      </div>

      {/* Main Body with Apple Sidebar + Workspace Content */}
      <div className="relative z-10 flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Desktop Apple Sidebar Navigation */}
        <Sidebar currentTab={currentTab} setCurrentTab={navigateTab} />

        {/* Dynamic Main Stage View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden">
          {/* Principal & Teacher Views Routing */}
          {currentTab === 'dashboard' && (
            isPrincipal ? (
              <PrincipalDashboard
                onNavigate={navigateTab}
                onOpenAddStudent={handleOpenAddStudent}
                onOpenAddTeacher={() => setIsAddTeacherOpen(true)}
                onOpenQuickSearch={() => setIsSearchOpen(true)}
                onSelectStudent={id => setSelectedStudentId(id)}
              />
            ) : (
              <TeacherDashboard
                onNavigate={navigateTab}
                onOpenAddStudent={handleOpenAddStudent}
                onSelectStudent={id => setSelectedStudentId(id)}
              />
            )
          )}

          {currentTab === 'attendance' && (
            <AttendanceView
              initialClassId={extraParam?.classId}
              onSelectStudent={id => setSelectedStudentId(id)}
            />
          )}

          {currentTab === 'students' && (
            <StudentsView
              initialClassId={extraParam?.classId}
              onSelectStudent={id => setSelectedStudentId(id)}
              onOpenAddStudent={handleOpenAddStudent}
              onOpenEditStudent={handleOpenEditStudent}
              onOpenCollectFee={s => setCollectFeeStudent(s)}
            />
          )}

          {currentTab === 'fees' && (
            <FeesView
              onSelectStudent={id => setSelectedStudentId(id)}
              onOpenCollectFee={s => setCollectFeeStudent(s)}
            />
          )}

          {currentTab === 'teachers' && (
            <TeachersView
              onOpenAddTeacher={() => setIsAddTeacherOpen(true)}
              onNavigateToClass={classId => navigateTab('students', { classId })}
            />
          )}

          {currentTab === 'teacher-attendance' && <TeacherAttendanceView />}

          {currentTab === 'classes' && (
            <ClassesView
              onNavigateToStudents={classId => navigateTab('students', { classId })}
            />
          )}

          {currentTab === 'results' && (
            <ResultsView
              onSelectStudent={id => setSelectedStudentId(id)}
              onOpenAddResult={s => setAddResultStudent(s)}
            />
          )}

          {currentTab === 'performance' && (
            <PerformanceView
              onSelectStudent={id => setSelectedStudentId(id)}
              onOpenAddPerformance={s => setAddPerformanceStudent(s)}
            />
          )}

          {currentTab === 'reports' && <ReportsView />}

          {currentTab === 'academic-year' && <AcademicYearView />}

          {currentTab === 'activity-logs' && <ActivityLogsView />}

          {currentTab === 'settings' && <SchoolSettingsView />}

          {currentTab === 'my-attendance' && (
            <TeacherDashboard
              onNavigate={navigateTab}
              onOpenAddStudent={handleOpenAddStudent}
              onSelectStudent={id => setSelectedStudentId(id)}
            />
          )}
        </main>
      </div>

      {/* Floating Speed Dial Action Button (Mobile) */}
      <MobileQuickActionFAB
        onNavigateTab={navigateTab}
        onOpenAddStudent={handleOpenAddStudent}
        onOpenAddTeacher={() => setIsAddTeacherOpen(true)}
        onOpenQuickSearch={() => setIsSearchOpen(true)}
        onOpenWhatsAppBroadcast={() => setIsWhatsAppModalOpen(true)}
      />

      {/* Mobile Bottom Thumb Zone Bar */}
      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={navigateTab}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenWhatsApp={() => setIsWhatsAppModalOpen(true)}
      />

      {/* Global Modals & Overlays */}
      {selectedStudentId && (
        <StudentProfileModal
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
          onOpenCollectFee={s => {
            setSelectedStudentId(null);
            setCollectFeeStudent(s);
          }}
          onOpenAddResult={s => {
            setSelectedStudentId(null);
            setAddResultStudent(s);
          }}
          onOpenAddPerformance={s => {
            setSelectedStudentId(null);
            setAddPerformanceStudent(s);
          }}
          onOpenEditStudent={s => {
            setSelectedStudentId(null);
            handleOpenEditStudent(s);
          }}
        />
      )}

      {isAddStudentOpen && (
        <AddEditStudentModal
          isOpen={isAddStudentOpen}
          onClose={() => {
            setIsAddStudentOpen(false);
            setStudentToEdit(null);
          }}
          studentToEdit={studentToEdit}
          defaultClassId={extraParam?.classId}
        />
      )}

      {collectFeeStudent && (
        <CollectFeeModal
          isOpen={!!collectFeeStudent}
          onClose={() => setCollectFeeStudent(null)}
          student={collectFeeStudent}
        />
      )}

      {isAddTeacherOpen && (
        <AddTeacherModal
          isOpen={isAddTeacherOpen}
          onClose={() => setIsAddTeacherOpen(false)}
        />
      )}

      {addResultStudent && (
        <AddResultModal
          isOpen={!!addResultStudent}
          onClose={() => setAddResultStudent(null)}
          student={addResultStudent}
        />
      )}

      {addPerformanceStudent && (
        <AddPerformanceModal
          isOpen={!!addPerformanceStudent}
          onClose={() => setAddPerformanceStudent(null)}
          student={addPerformanceStudent}
        />
      )}

      {isSearchOpen && (
        <QuickSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectStudent={id => setSelectedStudentId(id)}
          onNavigateTab={navigateTab}
        />
      )}

      {isWhatsAppModalOpen && (
        <WhatsAppBroadcastModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          defaultClassId={extraParam?.classId}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <SchoolProvider>
      <MainLayout />
    </SchoolProvider>
  );
}
