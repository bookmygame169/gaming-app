'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] Caught error:', error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 bg-[#111113] border border-[#ff5c2b]/20 text-center">
          <div className="w-14 h-14 rounded-full bg-[#ff5c2b]/15 flex items-center justify-center">
            <AlertTriangle size={24} className="text-[#ff5c2b]" />
          </div>
          <div>
            <p className="text-[#f2f0ea] font-semibold text-base">Something went wrong</p>
            <p className="text-[#f2f0ea]/40 text-sm mt-1">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/70 hover:bg-[#f2f0ea]/[0.14] text-sm font-medium transition-colors"
          >
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
