import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import type { Message } from '../store';
import { Send, Settings, User, Bot, Trash2, MessageCircle, X, Minimize2 } from 'lucide-react';
import clsx from 'clsx';
import { streamResponse } from '../lib/llm';

export const Interface = () => {
    const {
        messages,
        addMessage,
        clearMessages,
        apiKey,
        setApiKey,
        provider,
        setProvider,
        isSettingsOpen,
        toggleSettings,
        isChatOpen,
        toggleChat,
        memories
    } = useStore();

    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isChatOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !apiKey) return;

        const userMsg: Message = { role: 'user', content: input, createdAt: Date.now() };
        addMessage(userMsg);
        setInput("");

        try {
            const aiMsg: Message = { role: 'assistant', content: "...", createdAt: Date.now() };
            addMessage(aiMsg);

            let fullResponse = "";
            // Pass memories to LLM
            const stream = streamResponse(provider, apiKey, [...messages, userMsg], memories);

            for await (const chunk of stream) {
                fullResponse += chunk;
                // Direct store manipulation for performance/streaming
                useStore.setState((state) => ({
                    messages: state.messages.map((m, i) =>
                        i === state.messages.length - 1 ? { ...m, content: fullResponse } : m
                    )
                }));
            }
        } catch (error) {
            console.error(error);
            useStore.setState((state) => ({
                messages: [...state.messages.slice(0, -1), { role: 'assistant', content: `Error: ${(error as Error).message}`, createdAt: Date.now() }]
            }));
        }
    };

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">

            {/* Header / Settings Button (Global Top Right) */}
            <div className="absolute top-4 right-4 pointer-events-auto z-50">
                <button
                    onClick={toggleSettings}
                    className="p-3 bg-white/90 backdrop-blur-md rounded-full shadow-lg hover:bg-white transition-colors text-gray-700"
                    title="Settings"
                >
                    <Settings size={22} />
                </button>
            </div>

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md mx-4 transform transition-all animate-fade-in-up">
                        <h2 className="text-xl font-bold mb-4 text-gray-800 flex justify-between items-center">
                            Settings
                            <button onClick={toggleSettings}><X size={20} className="text-gray-500 hover:text-gray-800" /></button>
                        </h2>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => setProvider('openai')}
                                    className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors", provider === 'openai' ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                                >
                                    OpenAI
                                </button>
                                <button
                                    onClick={() => setProvider('anthropic')}
                                    className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors", provider === 'anthropic' ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                                >
                                    Anthropic
                                </button>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                API Key ({provider === 'openai' ? 'OpenAI' : 'Anthropic'})
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={provider === 'openai' ? "sk-..." : "sk-ant-..."}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                * Your key is stored locally in your browser.
                            </p>
                        </div>

                        <div className="flex justify-between items-center">
                            <button
                                onClick={clearMessages}
                                className="text-red-500 text-sm flex items-center gap-1 hover:text-red-700"
                            >
                                <Trash2 size={16} /> Data Reset
                            </button>
                            <button
                                onClick={toggleSettings}
                                className="px-6 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Widget Container (Bottom Right) */}
            <div className="absolute bottom-6 right-6 z-40 flex flex-col items-end gap-4 pointer-events-auto max-w-[90vw] w-[400px]">

                {/* Chat Window */}
                {isChatOpen && (
                    <div className="w-full bg-white/85 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[60vh] animate-slide-in-right origin-bottom-right transition-all">
                        {/* Chat Header */}
                        <div className="px-4 py-3 bg-white/50 border-b border-gray-100 flex justify-between items-center backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="font-semibold text-gray-700 text-sm">Unit-01</span>
                            </div>
                            <button
                                onClick={toggleChat}
                                className="text-gray-400 hover:text-gray-700 transition-colors"
                            >
                                <Minimize2 size={16} />
                            </button>
                        </div>

                        {/* Messages Area */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-4 space-y-3 bg-white/30 scrollbar-thin scrollbar-thumb-gray-200"
                        >
                            {messages.length === 0 && (
                                <div className="text-center text-gray-400 text-sm mt-8">
                                    <p>Connected.</p>
                                    <p>Say hello!</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={clsx(
                                        "flex items-end gap-2 max-w-[90%]",
                                        msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                                    )}
                                >
                                    <div className={clsx(
                                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm text-[10px]",
                                        msg.role === 'user' ? "bg-gray-800 text-white" : "bg-white text-blue-600"
                                    )}>
                                        {msg.role === 'user' ? 'U' : 'AI'}
                                    </div>
                                    <div className={clsx(
                                        "p-3 rounded-2xl text-sm shadow-sm",
                                        msg.role === 'user' ? "bg-gray-800 text-white rounded-br-none" : "bg-white text-gray-800 rounded-bl-none"
                                    )}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSubmit} className="p-3 bg-white/50 border-t border-gray-100">
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={apiKey ? "Message..." : "Set API Key first"}
                                    disabled={!apiKey}
                                    className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-500/50 outline-none transition-all shadow-sm text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || !apiKey}
                                    className="absolute right-1.5 p-2 bg-gray-900 rounded-full text-white hover:bg-black transition-colors disabled:opacity-30 disabled:scale-90"
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Floating Toggle Button (Always Visible) */}
                <button
                    onClick={toggleChat}
                    className={clsx(
                        "p-4 rounded-full shadow-xl transition-all duration-300 flex items-center justify-center",
                        isChatOpen
                            ? "bg-gray-200 text-gray-600 hover:bg-gray-300 rotate-0 scale-90"
                            : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-110 active:scale-95 rotate-0"
                    )}
                >
                    {isChatOpen ? <X size={24} /> : <MessageCircle size={28} />}
                </button>
            </div>
        </div>
    );
};
