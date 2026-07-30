import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { App } from "./app/App";
import { ProjectProvider } from "./state/ProjectContext";
import { AuthProvider } from "./features/auth/AuthContext";
import { PlanProvider } from "./features/plan/PlanContext";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
  SignInPage,
  SignUpPage,
} from "./features/auth/AuthPages";
import { OAuthPopupCallback } from "./features/auth/OAuthPopupCallback";
import { PrivacyPage, TermsPage } from "./features/legal/LegalPages";
import { AccountPage } from "./features/account/AccountPage";
import "./app/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PlanProvider>
          <ProjectProvider>
          <Routes>
            <Route path="/auth/sign-in" element={<SignInPage />} />
            <Route path="/auth/sign-up" element={<SignUpPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/popup-callback" element={<OAuthPopupCallback />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/account" element={<AccountPage />} />
            {/* The editor is intentionally NOT auth-protected — anonymous
                users can build a full project; only export is gated. */}
            <Route path="*" element={<App />} />
          </Routes>
          </ProjectProvider>
        </PlanProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
