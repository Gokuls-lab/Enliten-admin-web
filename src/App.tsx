
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Home from "./pages/landing/Home";
import Admin from "./pages/Admin";
import UserManagement from "./pages/UserManagement";
import ExamManagement from "./pages/ExamManagement";
import SubjectManagement from "./pages/SubjectManagement";
import QuestionManagement from "./pages/QuestionManagement";
import Analytics from "./pages/Analytics";
import SystemSettings from "./pages/SystemSettings";
import NotFound from "./pages/NotFound";
import FileManagement from "./pages/FileManagement";
import QuizModesManager from "@/components/QuizModesManager";
import AppVersionManager from '@/pages/AppVersionManager';
import NotificationManager from '@/pages/NotificationManager';
import EmailConfirmation from "./pages/EmailConfirmation";
import NewsManagement from "./pages/NewsManagement";
import Exams from "./pages/landing/Exams";
import About from "./pages/landing/About";
import TermsOfService from "./pages/landing/TermsOfService";
import RefundPolicy from "./pages/landing/RefundPolicy";
import PrivacyPolicy from "./pages/landing/PrivacyPolicy";

//landing
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/exams" element={<ExamManagement />} />
            <Route path="/admin/subjects" element={<SubjectManagement />} />
            <Route path="/admin/questions" element={<QuestionManagement />} />
            <Route path="/admin/analytics" element={<Analytics />} />
            <Route path="/admin/settings" element={<SystemSettings />} />
            <Route path="/admin/file-management" element={<FileManagement />} />
            <Route path="/admin/quiz-modes" element={<QuizModesManager />} />
            <Route path="/admin/app-version-manager" element={<AppVersionManager />} />
            <Route path="/admin/notification-manager" element={<NotificationManager />} />
            <Route path="/admin/news" element={<NewsManagement />} />
            <Route path="/email-confirmation" element={<EmailConfirmation />} />
            <Route path="/exams" element={<Exams />} />
            <Route path="/about" element={<About />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
