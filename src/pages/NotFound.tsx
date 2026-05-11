import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Star, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <Star className="h-10 w-10 text-primary mx-auto mb-4 opacity-60" />
        <h1 className="text-3xl font-bold font-display mb-2">Lost in the cosmos</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The page <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{location.pathname}</span> doesn't exist.
        </p>
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Slate
        </button>
      </div>
    </div>
  );
};

export default NotFound;
