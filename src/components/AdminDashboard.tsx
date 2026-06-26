
import React from 'react';
import icon from "../../images/icon.jpeg";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  BookOpen,
  FileQuestion,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  FolderOpen,
  ClipboardList,
  Bell,
  Newspaper
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { title } from 'process';

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const [usersResult, examsResult, questionsResult, sessionsResult, subjectsResult, filesResult, modesResult, notificationsResult] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact' }),
        supabase.from('exams').select('id', { count: 'exact' }),
        supabase.from('questions').select('id', { count: 'exact' }),
        supabase.from('quiz_sessions').select('id', { count: 'exact' }),
        supabase.from('subjects').select('id', { count: 'exact' }),
        supabase.from('file_resources').select('id', { count: 'exact' }),
        supabase.from('quiz_modes' as any).select('id', { count: 'exact' }),
        supabase.from('notifications' as any).select('id', { count: 'exact' })
      ]);

      return {
        totalUsers: usersResult.count || 0,
        totalExams: examsResult.count || 0,
        totalQuestions: questionsResult.count || 0,
        totalSessions: sessionsResult.count || 0,
        totalSubjects: subjectsResult.count || 0,
        totalFiles: filesResult.count || 0,
        totalModes: modesResult.count || 0,
        totalNotifications: notificationsResult.count || 0,
      };
    },
  });

  const handleSignOut = async () => {
    await signOut();
  };

  const dashboardCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      icon: Users,
      description: 'Registered users in the system',
      color: 'text-blue-600',
      route: '/admin/users',
    },
    {
      title: 'Total Exams',
      value: stats?.totalExams || 0,
      icon: BookOpen,
      description: 'Available exam categories',
      color: 'text-green-600',
      route: '/admin/exams',
    },
    {
      title: 'Subjects',
      value: stats?.totalSubjects || 0,
      icon: FolderOpen,
      description: 'Subject categories',
      color: 'text-cyan-600',
      route: '/admin/subjects',
    },
    {
      title: 'Total Questions',
      value: stats?.totalQuestions || 0,
      icon: FileQuestion,
      description: 'Questions in the database',
      color: 'text-purple-600',
      route: '/admin/questions',
    },
    {
      title: 'Quiz Sessions',
      value: stats?.totalSessions || 0,
      icon: BarChart3,
      description: 'Completed quiz sessions',
      color: 'text-orange-600',
      route: '/admin/analytics',
    },
    {
      title: 'File Management',
      value: stats?.totalFiles,
      icon: Settings,
      description: 'Configure system preferences',
      color: 'text-gray-600',
      route: '/admin/file-management',
    },
    {
      title: 'Quiz Modes',
      value: stats?.totalModes || 0,
      icon: ClipboardList,
      description: 'Configure system preferences',
      color: 'text-pink-600',
      route: '/admin/quiz-modes',
    },
    {
      title: 'Notifications',
      value: stats?.totalNotifications || 0,
      icon: Bell,
      description: 'System notifications',
      color: 'text-indigo-600',
      route: '/admin/notification-manager',
    },
    {
      title: 'Current Affairs',
      value: '4h',
      icon: Newspaper,
      description: 'AI-powered news for UPSC/TNPSC',
      color: 'text-teal-600',
      route: '/admin/news',
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              {/* <Shield className="h-8 w-8 text-blue-600 mr-3" /> */}
              <img src={icon} alt="Logo" className="h-8 w-8 mr-3 rounded-full" />
              <h1 className="text-xl font-semibold text-gray-900 hidden md:inline">The Cyber Cruciora | Admin</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Welcome, {user?.email}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {dashboardCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(card.route)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {card.title}
                  </CardTitle>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-gray-500">{card.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate('/admin/users')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span>Manage Users</span>
              </CardTitle>
              <CardDescription>
                View, edit, and manage user accounts and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/users'); }}>
                Go to Users
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate('/admin/exams')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BookOpen className="h-5 w-5 text-green-600" />
                <span>Manage Exams</span>
              </CardTitle>
              <CardDescription>
                Create, edit, and organize exam categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/exams'); }}>
                Go to Exams
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate('/admin/subjects')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FolderOpen className="h-5 w-5 text-cyan-600" />
                <span>Manage Subjects</span>
              </CardTitle>
              <CardDescription>
                Create and organize subjects within exam categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/subjects'); }}>
                Go to Subjects
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate('/admin/questions')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileQuestion className="h-5 w-5 text-purple-600" />
                <span>Manage Questions</span>
              </CardTitle>
              <CardDescription>
                Add, edit, and organize questions and answer options
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/questions'); }}>
                Go to Questions
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate('/admin/analytics')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-orange-600" />
                <span>Analytics</span>
              </CardTitle>
              <CardDescription>
                View detailed analytics and user performance reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/analytics'); }}>
                View Analytics
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate('/admin/file-management')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FolderOpen className="h-5 w-5 text-gray-600" />
                <span>File Management</span>
              </CardTitle>
              <CardDescription>
                Upload and manage files, documents, and learning resources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/file-management'); }}>
                Manage Files
              </Button>
            </CardContent>
          </Card>

          {/* Quiz Modes Management Card */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/admin/quiz-modes')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ClipboardList className="h-5 w-5 text-pink-600" />
                <span>Quiz Modes Management</span>
              </CardTitle>
              <CardDescription>
                Add, edit, reorder, and manage quiz modes available for quizzes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/quiz-modes'); }}>
                Manage Quiz Modes
              </Button>
            </CardContent>
          </Card>

          {/* App Version Manager Card */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/admin/app-version-manager')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ClipboardList className="h-5 w-5 text-blue-500" />
                <span>App Version Manager</span>
              </CardTitle>
              <CardDescription>
                Add, edit, and manage app versions for Android & iOS
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/app-version-manager'); }}>
                Manage App Versions
              </Button>
            </CardContent>
          </Card>

          {/* Notification Manager Card */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/admin/notification-manager')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="h-5 w-5 text-indigo-500" />
                <span>Notification Manager</span>
              </CardTitle>
              <CardDescription>
                Create, edit, and manage system notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/notification-manager'); }}>
                Manage Notifications
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate('/admin/settings')}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5 text-gray-600" />
                <span>System Settings</span>
              </CardTitle>
              <CardDescription>
                Configure system settings and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate('/admin/settings'); }}>
                Go to Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
