import { Route, Routes } from "react-router-dom";
import { ProtectedShell } from "./components/AppShell.js";
import { SessionProvider } from "./context/SessionProvider.js";
import { Activate } from "./routes/Activate.js";
import { AlumniDashboard } from "./routes/AlumniDashboard.js";
import { AlumniDirectory } from "./routes/AlumniDirectory.js";
import { AlumniDirectoryProfile } from "./routes/AlumniDirectoryProfile.js";
import { AlumniManagement } from "./routes/AlumniManagement.js";
import { AlumniProfileWizard } from "./routes/AlumniProfileWizard.js";
import { AuditLog } from "./routes/AuditLog.js";
import { CollegeProfile } from "./routes/CollegeProfile.js";
import { CreateCollege } from "./routes/CreateCollege.js";
import { Dashboard } from "./routes/Dashboard.js";
import { DegreeManagement } from "./routes/DegreeManagement.js";
import { ForgotPassword } from "./routes/ForgotPassword.js";
import { Home } from "./routes/Home.js";
import { ImportWizard } from "./routes/ImportWizard.js";
import { InviteStudent } from "./routes/InviteStudent.js";
import { Login } from "./routes/Login.js";
import { MyRequests } from "./routes/MyRequests.js";
import { PlatformDashboard } from "./routes/PlatformDashboard.js";
import { ReinviteCollegeAdmin } from "./routes/ReinviteCollegeAdmin.js";
import { ResetPassword } from "./routes/ResetPassword.js";
import { StudentManagement } from "./routes/StudentManagement.js";
import { StudentProfile } from "./routes/StudentProfile.js";

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/activate" element={<Activate />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedShell />}>
          <Route path="/" element={<Home />} />
          <Route path="/admin/colleges/new" element={<CreateCollege />} />
          <Route path="/admin/colleges/reinvite" element={<ReinviteCollegeAdmin />} />
          <Route path="/admin/dashboard" element={<PlatformDashboard />} />
          <Route path="/college/profile" element={<CollegeProfile />} />
          <Route path="/college/import" element={<ImportWizard targetRole="student" />} />
          <Route path="/college/import/:jobId" element={<ImportWizard targetRole="student" />} />
          <Route path="/college/import-alumni" element={<ImportWizard targetRole="alumni" />} />
          <Route path="/college/import-alumni/:jobId" element={<ImportWizard targetRole="alumni" />} />
          <Route path="/college/invite-student" element={<InviteStudent />} />
          <Route path="/college/degrees" element={<DegreeManagement />} />
          <Route path="/college/dashboard" element={<Dashboard />} />
          <Route path="/college/students" element={<StudentManagement />} />
          <Route path="/college/alumni" element={<AlumniManagement />} />
          <Route path="/college/audit-log" element={<AuditLog />} />
          <Route path="/profile" element={<StudentProfile />} />
          {/* Phase 2: alumni role */}
          <Route path="/alumni/dashboard" element={<AlumniDashboard />} />
          <Route path="/alumni/profile" element={<AlumniProfileWizard />} />
          {/* Phase 2: student-facing alumni network */}
          <Route path="/alumni-directory" element={<AlumniDirectory />} />
          <Route path="/alumni-directory/:id" element={<AlumniDirectoryProfile />} />
          <Route path="/requests" element={<MyRequests />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
