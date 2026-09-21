import React from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  CalendarCheck,
  UserCheck,
  CreditCard,
  Award,
  Sparkles,
  BarChart3,
  Calendar,
  History,
  Settings,
  ShieldCheck,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useSchool } from '../context/SchoolContext';
import { BuildStamp } from '../build';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  highlight?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { currentUser, adminImpersonation, exitAdminClassAccess, logout, db } = useSchool();
  const isPrincipal = currentUser?.role === 'principal';

  const principalNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Console Home', icon: LayoutDashboard },
    { id: 'teachers', label: 'Faculty Roster', icon: Users, badge: `${db.users.filter(u => u.role === 'teacher' && u.status === 'active').length}` },
    { id: 'classes', label: 'Class Sections', icon: BookOpen, badge: `${db.classes.length}` },
    { id: 'students', label: 'Student Directory', icon: GraduationCap, badge: `${db.students.filter(s => s.status === 'active').length}` },
    { id: 'attendance', label: 'Daily Attendance', icon: CalendarCheck },
    { id: 'teacher-attendance', label: 'Staff Attendance', icon: UserCheck },
    { id: 'fees', label: 'Fee Treasury', icon: CreditCard },
    { id: 'results', label: 'Marksheets & Exams', icon: Award, badge: db.results.length > 0 ? `${db.results.length}` : undefined },
    { id: 'performance', label: 'Growth Remarks', icon: Sparkles },
    { id: 'reports', label: 'Analytics & Insights', icon: BarChart3 },
    { id: 'academic-year', label: 'Session Promotion', icon: Calendar },
    { id: 'activity-logs', label: 'Audit Logs', icon: History },
    { id: 'settings', label: 'School Settings', icon: Settings },
  ];

  const teacherNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Classroom Console', icon: LayoutDashboard },
    { id: 'attendance', label: 'Mark Roll-Call', icon: CalendarCheck, highlight: true },
    { id: 'students', label: 'My Students', icon: Users },
    { id: 'results', label: 'Exams & Marks', icon: Award, badge: db.results.length > 0 ? `${db.results.length}` : undefined },
    { id: 'performance', label: 'Student Remarks', icon: Sparkles },
    { id: 'my-attendance', label: 'Faculty Check-In', icon: UserCheck },
    { id: 'reports', label: 'Class Analytics', icon: BarChart3 },
  ];

  const navItems = isPrincipal ? principalNavItems : teacherNavItems;

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-[#e5e5ea] bg-white p-4 min-h-[calc(100vh-6rem)] z-10 select-none">
      {/* Role Profile Card */}
      <div className="mb-4 bg-[#f5f5f7] border border-[#e5e5ea] rounded-[14px] p-3.5">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="h-4 w-4 text-[#0066cc] shrink-0" />
          <span className="text-[11px] font-semibold tracking-tight text-[#1d1d1f]">
            {isPrincipal ? 'Principal Administration' : 'Classroom Faculty'}
          </span>
        </div>
        <p className="mt-1 font-semibold text-xs text-[#1d1d1f] truncate">
          {currentUser?.name}
        </p>
        <p className="text-[11px] text-[#86868b] mt-0.5">
          {isPrincipal ? 'Super Admin Level' : `Class: ${currentUser?.assignedClassName || 'Class 5'}`}
        </p>

        {adminImpersonation && (
          <button
            onClick={exitAdminClassAccess}
            className="mt-2.5 w-full bg-[#ff3b30] text-white py-1 text-[11px] font-medium rounded-full hover:bg-[#e02d23] transition-all text-center"
          >
            Exit Class View
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`group flex w-full items-center justify-between px-3 py-2 text-[13px] rounded-full transition-all duration-150 ${
                isActive
                  ? 'bg-[#0066cc] text-white font-medium shadow-xs'
                  : 'text-[#1d1d1f] hover:bg-[#f5f5f7] font-normal'
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-[#86868b] group-hover:text-[#1d1d1f]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`px-2 py-0.5 text-[11px] rounded-full font-medium ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-[#e5e5ea] text-[#1d1d1f]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="mt-4 border-t border-[#f0f0f0] pt-3">
        <BuildStamp className="px-3 pb-2" />
        <button
          onClick={logout}
          className="flex w-full items-center justify-between px-3 py-2 text-[13px] font-normal text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-full transition-colors"
        >
          <div className="flex items-center space-x-2.5">
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </div>
          <ChevronRight className="h-4 w-4 text-[#ff3b30]/60 shrink-0" />
        </button>
      </div>
    </aside>
  );
};
