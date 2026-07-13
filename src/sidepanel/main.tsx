import React from "react";
import ReactDOM from "react-dom/client";
import { SidePanel } from "./SidePanel";
import "./styles/theme.css";
import "./styles/sidepanel.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found.");
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: 'red', background: '#333', height: '100vh', overflow: 'auto' }}>
          <h2>Something went wrong.</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SidePanel />
    </ErrorBoundary>
  </React.StrictMode>
);
