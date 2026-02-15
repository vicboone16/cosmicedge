import { lazy, Suspense } from "react";

// Re-use the existing AdminImportPage content but rendered as a component (no outer shell)
const AdminImportPage = lazy(() => import("@/pages/AdminImportPage"));

export default function AdminImportContent() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading imports...</div>}>
      <AdminImportPageInner />
    </Suspense>
  );
}

// We import and render the page content directly
function AdminImportPageInner() {
  // Dynamically import all the content from AdminImportPage
  // Since it's a full page, we embed it with reduced padding
  return (
    <div className="[&>div]:min-h-0 [&>div]:p-0 [&>div>h1]:hidden">
      <AdminImportPage />
    </div>
  );
}
