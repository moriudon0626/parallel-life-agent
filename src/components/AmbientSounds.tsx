import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { getAmbientAudio } from '../lib/ambientAudio';

export const AmbientSounds = () => {
    const initRef = useRef(false);
    const manager = useRef(getAmbientAudio());

    // Sync store settings
    const ambientEnabled = useStore(s => s.ambientSoundsEnabled);
    const ambientVolume = useStore(s => s.ambientSoundsVolume);

    useEffect(() => {
        manager.current.enabled = ambientEnabled;
    }, [ambientEnabled]);

    useEffect(() => {
        manager.current.volume = ambientVolume;
    }, [ambientVolume]);

    // Init AudioContext on first user interaction
    useEffect(() => {
        const initAudio = () => {
            if (!initRef.current) {
                initRef.current = true;
                manager.current.init();
            }
        };
        window.addEventListener('click', initAudio, { once: true });
        window.addEventListener('keydown', initAudio, { once: true });
        return () => {
            window.removeEventListener('click', initAudio);
            window.removeEventListener('keydown', initAudio);
        };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            manager.current.dispose();
        };
    }, []);

    // Update every frame
    useFrame(() => {
        const state = useStore.getState();
        const isNight = state.time >= 18 || state.time < 6;
        manager.current.update(state.time, state.weather, isNight);
    });

    return null;
};
