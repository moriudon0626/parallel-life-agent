import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import { useStore } from "../../store";

function lerpColor(a: Color3, b: Color3, t: number): Color3 {
  return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

export function createLighting(scene: Scene) {
  const sun = new DirectionalLight("sunLight", new Vector3(-1, -2, -1), scene);
  sun.intensity = 1.0;

  const shadowGen = new ShadowGenerator(1024, sun);
  shadowGen.usePercentageCloserFiltering = true;
  shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;

  const ambient = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.3;
  ambient.groundColor = new Color3(0.15, 0.15, 0.2);

  // Update lighting every frame
  scene.registerBeforeRender(() => {
    const time = useStore.getState().time;
    const weather = useStore.getState().weather;

    const inclination = (time / 24) * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(inclination);
    const sunDir = new Vector3(-Math.cos(inclination), -sunY, -0.25).normalize();
    sun.direction = sunDir;
    sun.position = sunDir.scale(-50);

    const night = new Color3(0.1, 0.1, 0.3);
    const sunrise = new Color3(1, 0.8, 0.67);
    const day = new Color3(1, 1, 1);
    const sunset = new Color3(1, 0.53, 0.27);
    let color: Color3;
    if (time < 5) color = night;
    else if (time < 7) color = lerpColor(night, sunrise, (time - 5) / 2);
    else if (time < 9) color = lerpColor(sunrise, day, (time - 7) / 2);
    else if (time < 16) color = day;
    else if (time < 18) color = lerpColor(day, sunset, (time - 16) / 2);
    else if (time < 20) color = lerpColor(sunset, night, (time - 18) / 2);
    else color = night;

    const weatherDim = weather === "rainy" ? 0.3 : weather === "cloudy" ? 0.75 : weather === "snowy" ? 0.4 : 1.0;
    sun.diffuse = color;
    sun.intensity = Math.max(0, sunY) * 1.5 * weatherDim;
    ambient.intensity = 0.05 + Math.max(0, sunY) * 0.25 + (1 - weatherDim) * 0.2;
    ambient.diffuse = color;

    // Fog
    const nightFog = new Color3(0, 0, 0.067);
    const dayFog = new Color3(0.667, 0.8, 0.933);
    let fogColor: Color3;
    if (time < 5 || time > 20) fogColor = nightFog;
    else if (time < 7) fogColor = lerpColor(nightFog, dayFog, (time - 5) / 2);
    else if (time < 18) fogColor = dayFog;
    else fogColor = lerpColor(dayFog, nightFog, (time - 18) / 2);

    if (weather === "rainy") fogColor = lerpColor(fogColor, new Color3(0.333, 0.333, 0.4), 0.8);
    else if (weather === "snowy") fogColor = lerpColor(fogColor, new Color3(0.867, 0.933, 1), 0.8);
    else if (weather === "cloudy") fogColor = lerpColor(fogColor, new Color3(0.533, 0.533, 0.6), 0.25);

    scene.fogMode = 3;
    scene.fogColor = fogColor;
    scene.fogStart = weather === "rainy" ? 1 : weather === "snowy" ? 2 : weather === "cloudy" ? 10 : 5;
    scene.fogEnd = weather === "rainy" ? 40 : weather === "snowy" ? 35 : weather === "cloudy" ? 90 : 100;
    scene.clearColor = new Color4(fogColor.r, fogColor.g, fogColor.b, 1);
  });

  return { sun, ambient, shadowGen };
}
