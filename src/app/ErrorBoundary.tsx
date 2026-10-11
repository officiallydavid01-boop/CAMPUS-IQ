import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Application-level error boundary (Master Spec section 15: "never
 * silently swallow errors"). Catches render-time exceptions anywhere in
 * the tree and shows a real error state with a reload action, instead of
 * an unstyled React error screen or a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("CampusIQ render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ErrorState
            title="CampusIQ hit a snag."
            description="Please reload the page. If this keeps happening, contact support."
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
