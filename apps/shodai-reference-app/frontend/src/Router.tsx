import * as React from "react";
import { Routes, Route, Navigate, Outlet } from "react-router";
import { useLogin } from "@/hooks/useLogin";
import Login from "@/routes/Login";
import LoginCode from "@/routes/LoginCode";
import Home from "@/routes/Home";
import Agreements from "@/routes/Agreements";
import CreateAgreement from "@/routes/CreateAgreement";
import TemplatePreview from "@/routes/TemplatePreview";
import Document from "@/routes/Document";
import Agreement from "@/routes/Agreement";
import ProtectedRoute from "@/components/ProtectedRoute";
import { DefaultPageLayout } from "@/subframe/layouts/DefaultPageLayout";
import ErrorBoundary from "@/components/ErrorBoundary";

const Router: React.FC = () => {
  const { isConnected } = useLogin();

  return (
    <ErrorBoundary>
      <>
        <Routes>
          {/* Root redirects to login if not connected, or home if connected */}
          <Route 
            index 
            element={
              isConnected ? (
                <Navigate to="/home" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          
          {/* Login page */}
          <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
          <Route path="/login/code" element={<ErrorBoundary><LoginCode /></ErrorBoundary>} />

          {/* Protected routes - require authentication */}
          <Route
            element={
              <DefaultPageLayout>
                <ProtectedRoute>
                  <ErrorBoundary>
                    <Outlet />
                  </ErrorBoundary>
                </ProtectedRoute>
              </DefaultPageLayout>
            }
          >
            <Route path="/home" element={<Home />} />
            <Route path="/agreements" element={<Agreements />} />
            <Route path="/create" element={<CreateAgreement />} />
            <Route path="/templates/:templateId" element={<TemplatePreview />} />
            <Route path="/document/:draftId" element={<Document />} />
            <Route path="/agreement/:id" element={<Agreement />} />
            <Route path="/agreement/:id/:tab" element={<Agreement />} />
          </Route>
        </Routes>
      </>
    </ErrorBoundary>
  );
}

export default Router;
