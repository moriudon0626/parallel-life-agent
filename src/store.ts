import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: number;
}

interface AppState {
    // Settings
    apiKey: string;
    provider: 'openai' | 'anthropic';
    setApiKey: (key: string) => void;
    setProvider: (provider: 'openai' | 'anthropic') => void;

    // UI State
    isSettingsOpen: boolean;
    toggleSettings: () => void;
    isChatOpen: boolean;
    toggleChat: () => void;

    // Chat Data
    messages: Message[];
    addMessage: (msg: Message) => void;
    clearMessages: () => void;

    // Robot Memory
    memories: string[];
    addMemory: (memory: string) => void;
}

export const useStore = create<AppState>()(
    persist(
        (set) => ({
            apiKey: "",
            provider: "openai",
            setApiKey: (key) => set({ apiKey: key }),
            setProvider: (provider) => set({ provider }),

            isSettingsOpen: false,
            toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

            isChatOpen: true,
            toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),

            messages: [],
            addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
            clearMessages: () => set({ messages: [], memories: [] }),

            memories: [],
            addMemory: (memory) => set((state) => {
                const timestamp = new Date().toLocaleTimeString();
                const newMemory = `[${timestamp}] ${memory}`;
                const updated = [...state.memories, newMemory].slice(-50);
                return { memories: updated };
            }),
        }),
        {
            name: 'agent-storage',
            partialize: (state) => ({
                apiKey: state.apiKey,
                provider: state.provider,
                messages: state.messages,
                memories: state.memories
            }),
        }
    )
);
