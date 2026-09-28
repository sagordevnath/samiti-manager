import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-wide error boundary: a render crash in any page shows a recoverable
 * Bangla-first screen instead of a white screen. Reload clears the state;
 * the error is logged to the console for diagnosis.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Replace with Sentry.captureException when the monitoring module lands.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md space-y-4 rounded-lg border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">কিছু একটা ভুল হয়েছে / Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            পৃষ্ঠাটি দেখানোর সময় একটি ত্রুটি হয়েছে। আবার চেষ্টা করুন বা সমস্যা থাকলে প্রশাসকের সাথে যোগাযোগ করুন।
          </p>
          <p className="truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground" title={this.state.error.message}>
            {this.state.error.message}
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })} variant="outline">
              আবার চেষ্টা করুন
            </Button>
            <Button onClick={() => window.location.assign('/')}>হোমে ফিরুন</Button>
          </div>
        </div>
      </div>
    );
  }
}
