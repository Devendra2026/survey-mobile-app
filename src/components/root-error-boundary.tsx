import { AppErrorBoundary } from '@/components/app-error-boundary';
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches startup crashes outside expo-router's route ErrorBoundary. */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <AppErrorBoundary error={this.state.error} retry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
