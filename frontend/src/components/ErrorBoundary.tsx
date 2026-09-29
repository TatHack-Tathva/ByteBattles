import { Component, type ReactNode } from "react";
import { button } from "./ui";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Something broke</h1>
          <p className="text-slate-400">The page hit an unexpected error.</p>
          <button className={button} onClick={() => location.assign("/")}>Back to problems</button>
        </div>
      </main>
    );
  }
}
