import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useStore } from '../store';

export const PostProcessing = () => {
    const time = useStore(s => s.time);
    const weather = useStore(s => s.weather);

    const isNight = time < 6 || time > 18;
    // 夜はブルームを強めて発光オブジェクトを際立たせる
    const bloomIntensity = isNight ? 2.0 : 0.8;
    const bloomThreshold = isNight ? 0.4 : 0.85;

    const vignetteOffset = weather === 'rainy' ? 0.4 : (weather === 'snowy' ? 0.35 : 0.25);
    const vignetteDarkness = weather === 'rainy' ? 0.6 : 0.4;

    return (
        <EffectComposer>
            <Bloom
                intensity={bloomIntensity}
                luminanceThreshold={bloomThreshold}
                luminanceSmoothing={0.9}
                mipmapBlur
            />
            <Vignette offset={vignetteOffset} darkness={vignetteDarkness} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
    );
};
