import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-50 p-6 text-red-900 overflow-auto">
                    <div className="max-w-2xl w-full bg-white p-8 rounded-xl shadow-xl border border-red-200">
                        <h2 className="text-2xl font-bold mb-4 text-red-600">エラーが発生しました</h2>

                        <div className="mb-6">
                            <h3 className="font-semibold mb-2">エラーメッセージ:</h3>
                            <pre className="bg-red-50 p-4 rounded-lg text-sm font-mono overflow-auto whitespace-pre-wrap border border-red-100">
                                {this.state.error?.toString()}
                            </pre>
                        </div>

                        {this.state.errorInfo && (
                            <div className="mb-6">
                                <h3 className="font-semibold mb-2">コンポーネントスタック:</h3>
                                <pre className="bg-gray-50 p-4 rounded-lg text-xs font-mono overflow-auto whitespace-pre-wrap border border-gray-200 text-gray-600 max-h-64">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-md"
                        >
                            ページを再読み込み
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
