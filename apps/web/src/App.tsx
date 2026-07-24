import { Route, Routes } from "react-router-dom";
import { ProtectedShell } from "./components/AppShell.js";
import { SessionProvider } from "./context/SessionProvider.js";
import { Activate } from "./routes/Activate.js";
import { ForgotPassword } from "./routes/ForgotPassword.js";
import { Home } from "./routes/Home.js";
import { Login } from "./routes/Login.js";
import { ResetPassword } from "./routes/ResetPassword.js";

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
        </Route>
      </Routes>
    </SessionProvider>
  );
}
