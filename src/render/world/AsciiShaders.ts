const ATMOSPHERE = /* glsl */ `
uniform float uDaylight;
uniform float uFogDensity;
uniform vec3 uSkyTint;
uniform vec3 uSunDirection;
uniform float uIndoor;
vec3 atmosphere(vec3 color, vec3 position, float localLight) {
  float light = mix(0.22 + 0.78 * uDaylight, 1.0, clamp(localLight, 0.0, 1.0));
  float haze = 1.0 - exp(-pow(length(position.xz - uPlayerPos.xz) * uFogDensity, 2.0));
  return mix(color * light * uSkyTint, vec3(0.075, 0.10, 0.095) * (0.4 + uDaylight * 0.6), haze * 0.88);
}
`

export const ASCII_COMMON = /* glsl */ `
uniform sampler2D uAsciiTex;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTime;
uniform vec3 uPlayerPos;
uniform vec3 uTorchPos;
uniform float uTorchPower;
uniform vec4 uWorldLights[8];
${ATMOSPHERE}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
  a += dot(a, a + 34.45);
  return fract(vec2(a.x * a.y, a.y * a.z));
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float sampleAsciiGlyph(float charIndex, vec2 cellUV) {
  float idx = clamp(floor(charIndex), 0.0, 63.0);
  float col = mod(idx, 8.0);
  float row = floor(idx / 8.0);
  vec2 uv = (vec2(col, 7.0 - row) + cellUV) / 8.0;
  return texture2D(uAsciiTex, uv).r;
}

float worldGlowAt(vec2 xz) {
  float glow = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 lightData = uWorldLights[i];
    if (lightData.z > 0.001) {
      float d = length(xz - lightData.xy) / max(0.1, lightData.w);
      glow += lightData.z * exp(-d * d * 3.2);
    }
  }
  return clamp(glow, 0.0, 1.4);
}

void asciiGrid(vec3 worldPos, out vec2 cellId, out vec2 cellUv, out vec3 quantWorld) {
  vec2 ortho = vec2(dot(worldPos, uCamRight), dot(worldPos, uCamUp));
  vec2 cellSize = vec2(0.105, 0.145);
  vec2 gridPos = ortho / cellSize;
  cellId = floor(gridPos);
  cellUv = fract(gridPos);
  vec2 delta = (cellId + 0.5 - gridPos) * cellSize;
  quantWorld = worldPos + uCamRight * delta.x + uCamUp * delta.y;
}
`

export const groundVertexShader = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const groundFragmentShader = /* glsl */ `
${ASCII_COMMON}
uniform vec4 uRipples[18];
uniform vec4 uRoadSegments[64];
uniform float uRoadCount;
varying vec3 vWorldPos;

float riverCenterZ(float x) {
  return -x * 0.58 - 5.5 + sin(x * 0.11) * 1.65 + cos(x * 0.05) * 1.1;
}

float lineSegmentDistance(vec2 p, vec4 segment) {
  vec2 a = segment.xy;
  vec2 b = segment.zw;
  vec2 ab = b - a;
  float denom = max(dot(ab, ab), 0.0001);
  float t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
  return length(p - (a + ab * t));
}

float roadDistance(vec2 p) {
  float best = 999.0;
  for (int i = 0; i < 64; i++) {
    if (float(i) < uRoadCount) best = min(best, lineSegmentDistance(p, uRoadSegments[i]));
  }
  return best;
}

float shadowCaster(vec2 xz, vec2 center, float width, float lengthValue) {
  vec2 lightDir = normalize(vec2(1.25, 0.82));
  vec2 d = xz - center;
  float proj = dot(d, lightDir);
  float perp = length(d - lightDir * proj);
  if (proj <= 0.0 || proj >= lengthValue) return 1.0;
  return smoothstep(width * 0.6, width * 1.25, perp + proj * 0.04);
}

float obstacleShadow(vec2 xz) {
  float shadow = 1.0;
  shadow = min(shadow, shadowCaster(xz, vec2(-8.5, 4.2), 1.0, 7.2));
  shadow = min(shadow, shadowCaster(xz, vec2(-8.5, -15.6), 0.95, 6.8));
  shadow = min(shadow, shadowCaster(xz, vec2(12.5, -13.8), 2.0, 4.5));
  shadow = min(shadow, shadowCaster(xz, uPlayerPos.xz, 0.45, 2.6));
  return shadow;
}

void main() {
  vec2 cellID;
  vec2 cellUV;
  vec3 quantWorld;
  asciiGrid(vWorldPos, cellID, cellUV, quantWorld);
  vec2 xz = quantWorld.xz;

  float cz = riverCenterZ(xz.x);
  float distRiver = (xz.y - cz) * 0.86;
  float absDist = abs(distRiver);
  float halfWidth = 6.8;

  float distToTorch = length(xz - uTorchPos.xz);
  float flicker = 0.94 + 0.06 * sin(uTime * 17.0) * cos(uTime * 9.3);
  float torch = uTorchPower * flicker * exp(-distToTorch * distToTorch * 0.038);
  float worldGlow = worldGlowAt(xz) * (0.9 + 0.1 * sin(uTime * 6.7));
  float rnd = hash21(cellID);

  if (absDist < halfWidth) {
    vec2 flowDir = normalize(vec2(-1.0, 0.58));
    float along = dot(xz, flowDir);
    float across = distRiver;

    vec2 pebbleUV = xz * 0.58;
    vec2 pCell = floor(pebbleUV);
    vec2 pFract = fract(pebbleUV);
    float minDist = 8.0;
    vec2 bestCenter = vec2(0.0);
    vec2 bestId = vec2(0.0);
    for (int yy = -1; yy <= 1; yy++) {
      for (int xx = -1; xx <= 1; xx++) {
        vec2 n = vec2(float(xx), float(yy));
        vec2 point = hash22(pCell + n);
        vec2 diff = n + point - pFract;
        float d = length(diff);
        if (d < minDist) {
          minDist = d;
          bestCenter = diff;
          bestId = pCell + n;
        }
      }
    }

    float stoneRadius = 0.34 + 0.18 * hash21(bestId * 1.7);
    float stone = 1.0 - smoothstep(stoneRadius - 0.12, stoneRadius, minDist);
    float stoneHighlight = clamp(0.55 + dot(normalize(bestCenter + vec2(0.001)), vec2(-0.6, -0.8)) * 0.55, 0.15, 1.0);

    float warp = valueNoise(vec2(along * 0.45 - uTime * 1.6, across * 0.8));
    float streamCoord = across * 1.85 + sin(along * 0.55 - uTime * 2.1 + warp * 2.6) * 0.85;
    float streamLine = 1.0 - smoothstep(0.0, 0.13, abs(fract(streamCoord * 0.35) - 0.5));
    streamLine *= smoothstep(0.42, 0.68, valueNoise(vec2(along * 0.3 - uTime * 1.8, across * 0.5)));

    float shimmer = valueNoise(vec2(along * 1.8 - uTime * 4.2, across * 2.4));
    float shimmerMask = smoothstep(0.68, 0.88, shimmer);

    float rippleSum = 0.0;
    for (int i = 0; i < 18; i++) {
      vec4 rip = uRipples[i];
      if (rip.w > 0.01) {
        float dRip = length(xz - rip.xy);
        rippleSum += (1.0 - smoothstep(0.0, 0.32, abs(dRip - rip.z))) * rip.w;
      }
    }
    rippleSum = clamp(rippleSum, 0.0, 1.35);

    float activity = max(streamLine * 0.95, rippleSum * 1.1) + shimmerMask * 0.35;
    float bankEdge = smoothstep(halfWidth - 0.9, halfWidth, absDist);

    float lum = 0.08;
    float charIdx = 3.0;
    if (activity > 0.23) {
      lum = clamp(0.36 + activity * 0.62, 0.0, 1.0);
      charIdx = 16.0 + mod(floor(lum * 36.0 + rnd * 19.0 + floor(uTime * 7.0)), 42.0);
    } else if (stone > 0.15) {
      lum = stone * stoneHighlight * (0.42 + torch * 0.9 + worldGlow * 0.5);
      charIdx = 18.0 + mod(floor(rnd * 29.0 + stoneHighlight * 14.0), 34.0);
    } else if (bankEdge > 0.16 || rnd > 0.72) {
      lum = 0.18 + bankEdge * 0.26;
      charIdx = 4.0 + mod(floor(rnd * 22.0), 28.0);
    }

    float glyph = sampleAsciiGlyph(charIdx, cellUV);
    vec3 waterBg = vec3(0.015, 0.022, 0.03);
    vec3 coldStone = mix(vec3(0.18, 0.23, 0.28), vec3(0.66, 0.72, 0.78), stoneHighlight);
    vec3 coldWave = vec3(0.73, 0.82, 0.90);
    vec3 warmStone = mix(vec3(0.48, 0.32, 0.12), vec3(1.0, 0.78, 0.30), stoneHighlight);
    vec3 warmWave = vec3(1.0, 0.88, 0.40);
    float warm = clamp(torch * 1.5 + worldGlow * 0.9, 0.0, 1.0);
    vec3 stoneCol = mix(coldStone, warmStone, warm);
    vec3 waveCol = mix(coldWave, warmWave, warm);
    vec3 charCol = mix(stoneCol * (0.55 + lum), waveCol, clamp(activity, 0.0, 1.0));
    charCol += vec3(0.8, 0.48, 0.12) * worldGlow * 0.18;
    gl_FragColor = vec4(atmosphere(mix(waterBg, charCol, glyph * clamp(lum * 1.8, 0.18, 1.0)), vWorldPos, torch + worldGlow), 1.0);
    return;
  }

  float shadow = obstacleShadow(xz);
  float bank = 1.0 - smoothstep(halfWidth, halfWidth + 2.5, absDist);
  float noise = valueNoise(xz * 0.45);
  float roadDist = roadDistance(xz);
  float roadMask = 1.0 - smoothstep(1.25, 2.35, roadDist);
  float roadEdge = (1.0 - smoothstep(0.0, 0.75, abs(roadDist - 1.45))) * roadMask;
  float roadNoise = valueNoise(xz * 1.15 + vec2(valueNoise(xz * 0.18) * 2.0));

  float charIdx = 5.0 + mod(floor(rnd * 37.0 + noise * 13.0), 45.0);
  float glyph = sampleAsciiGlyph(charIdx, cellUV);
  float roadCharIdx = 12.0 + mod(floor(rnd * 23.0 + roadNoise * 18.0), 37.0);
  float roadGlyph = sampleAsciiGlyph(roadCharIdx, cellUV);

  vec3 soil = vec3(0.022, 0.034, 0.024);
  vec3 grass = mix(vec3(0.09, 0.17, 0.085), vec3(0.26, 0.38, 0.20), noise);
  vec3 bankStone = vec3(0.42, 0.46, 0.47);
  vec3 lit = mix(grass, bankStone, bank * 0.72);
  lit += vec3(0.78, 0.56, 0.16) * torch * 0.7;
  lit += vec3(0.88, 0.56, 0.19) * worldGlow * 0.62;
  lit *= 0.3 + 0.7 * shadow;

  vec3 roadDark = vec3(0.055, 0.052, 0.044);
  vec3 roadLight = vec3(0.24, 0.22, 0.17);
  vec3 roadCol = mix(roadDark, roadLight, roadNoise * 0.75 + roadEdge * 0.35);
  roadCol += vec3(0.42, 0.28, 0.1) * worldGlow * 0.45;
  vec3 groundCol = mix(soil * (0.55 + 0.45 * shadow), lit, glyph * (0.52 + bank * 0.22 + torch * 0.25));
  groundCol = mix(groundCol, mix(roadDark, roadCol, roadGlyph * 0.82), roadMask * 0.94);
  gl_FragColor = vec4(atmosphere(groundCol, vWorldPos, torch + worldGlow), 1.0);
}
`

export const objectVertexShader = /* glsl */ `
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 localPosition = vec4(position, 1.0);
  vec3 localNormal = normal;
  #ifdef USE_INSTANCING
    localPosition = instanceMatrix * localPosition;
    localNormal = mat3(instanceMatrix) * localNormal;
  #endif
  vec4 worldPosition = modelMatrix * localPosition;
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * localNormal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

export const objectFragmentShader = /* glsl */ `
${ASCII_COMMON}
uniform vec3 uBaseColor;
uniform vec3 uDarkColor;
uniform float uCharOffset;
uniform float uEmissive;
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vec2 cellID;
  vec2 cellUV;
  vec3 quantWorld;
  asciiGrid(vWorldPos, cellID, cellUV, quantWorld);

  vec3 sunDir = normalize(uSunDirection);
  float diff = clamp(dot(normalize(vNormal), sunDir), 0.0, 1.0);
  vec3 toTorch = uTorchPos - vWorldPos;
  float distTorch = length(toTorch);
  float torchDiff = clamp(dot(normalize(vNormal), normalize(toTorch + vec3(0.001))), 0.0, 1.0);
  float torch = uTorchPower * (0.35 + 0.65 * torchDiff) * exp(-distTorch * distTorch * 0.045);
  float worldGlow = worldGlowAt(vWorldPos.xz) * (0.92 + 0.08 * sin(uTime * 6.7));
  float totalLight = clamp(0.15 + diff * 0.82 + uIndoor * 0.3 + torch * 0.9 + worldGlow * 0.6 + uEmissive, 0.04, 1.0);

  float rnd = hash21(cellID + uCharOffset);
  float charIdx = clamp(floor(totalLight * 52.0 + (rnd - 0.5) * 11.0), 2.0, 62.0);
  float glyph = sampleAsciiGlyph(charIdx, cellUV);

  vec3 lit = mix(uDarkColor, uBaseColor, totalLight);
  lit += vec3(0.95, 0.72, 0.28) * torch * 0.58;
  lit += vec3(1.0, 0.58, 0.16) * worldGlow * 0.55;
  vec3 bg = uDarkColor * 0.16;
  gl_FragColor = vec4(atmosphere(mix(bg, lit * 1.15, glyph), vWorldPos, torch + worldGlow + uEmissive), 1.0);
}
`

export const grassVertexShader = /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aScaleRot;
uniform float uTime;
uniform vec3 uPlayerPos;
uniform float uSwingTime;
varying float vHeightFrac;
varying float vFlower;
varying float vShade;
varying vec3 vWorldPos;

void main() {
  vHeightFrac = position.y;
  vFlower = aScaleRot.z;
  vec3 pos = position;
  pos.y *= aScaleRot.x;

  float wind = sin(aOffset.x * 0.55 + aOffset.z * 0.45 + uTime * 2.4 + aScaleRot.y * 6.283) * 0.16;
  wind += cos(aOffset.x * 0.25 - uTime * 1.6) * 0.08;

  vec2 away = aOffset.xz - uPlayerPos.xz;
  float d = length(away);
  float pushRadius = 1.2 + uSwingTime * 1.4;
  float push = 1.0 - smoothstep(0.14, pushRadius, d);
  vec2 dir = normalize(away + vec2(0.001));
  float bend = pow(vHeightFrac, 1.5);
  pos.x += (wind + dir.x * push * 0.78) * bend;
  pos.z += (wind * 0.45 + dir.y * push * 0.78) * bend;
  pos.y *= 1.0 - push * 0.34 * bend;

  vWorldPos = pos + aOffset;
  vShade = 0.55 + 0.45 * sin(aScaleRot.y * 6.283);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
}
`

export const grassFragmentShader = /* glsl */ `
uniform vec3 uPlayerPos;
${ATMOSPHERE}
uniform vec3 uTorchPos;
uniform float uTorchPower;
uniform vec4 uWorldLights[8];
uniform float uTime;
varying float vHeightFrac;
varying float vFlower;
varying float vShade;
varying vec3 vWorldPos;

float worldGrassGlow(vec2 xz) {
  float glow = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 lightData = uWorldLights[i];
    if (lightData.z > 0.001) {
      float d = length(xz - lightData.xy) / max(0.1, lightData.w);
      glow += lightData.z * exp(-d * d * 3.2);
    }
  }
  return clamp(glow, 0.0, 1.2);
}

void main() {
  float distTorch = length(vWorldPos.xz - uTorchPos.xz);
  float torch = uTorchPower * exp(-distTorch * distTorch * 0.042);
  float worldGlow = worldGrassGlow(vWorldPos.xz) * (0.92 + 0.08 * sin(uTime * 6.7));
  vec3 root = vec3(0.018, 0.038, 0.022);
  vec3 tip = mix(vec3(0.11, 0.23, 0.11), vec3(0.30, 0.45, 0.22), vShade);
  vec3 col = mix(root, tip, pow(vHeightFrac, 1.3));
  if (vFlower > 0.5 && vHeightFrac > 0.72) {
    col = vFlower > 1.5 ? vec3(0.94, 0.82, 0.34) : vec3(0.84, 0.88, 0.82);
  }
  col += vec3(0.72, 0.53, 0.18) * torch * (0.3 + 0.7 * vHeightFrac);
  col += vec3(0.92, 0.54, 0.14) * worldGlow * (0.18 + 0.82 * vHeightFrac);
  gl_FragColor = vec4(atmosphere(col, vWorldPos, torch + worldGlow), 1.0);
}
`