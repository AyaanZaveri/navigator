// The sampled menus remain SDR even when the video swap chain carries HDR10.
// ST.2084 is absolute luminance. Decode before averaging, then map BT.2020
// linear light to BT.709 and a bounded SDR sample. Main video is not processed here.
Texture2D image : register(t0);
SamplerState linearClamp : register(s0);
cbuffer SampleSize : register(b0) { float4 footprint; };
struct V { float4 position : SV_Position; float2 uv : TEXCOORD0; };

V vs(uint id : SV_VertexID) {
    V o;
    o.uv = float2((id << 1) & 2, id & 2);
    o.position = float4(o.uv * float2(2, -2) + float2(-1, 1), 0, 1);
    return o;
}

float3 pqNits(float3 value) {
    float3 p = pow(saturate(value), 1.0 / 78.84375);
    return 10000.0 * pow(max(p - 0.8359375, 0.0) /
        max(18.8515625 - 18.6875 * p, 0.000001), 1.0 / 0.1593017578125);
}

float3 menuSrgb(float3 nits) {
    float3 rgb = mul(float3x3(
         1.660491, -0.587641, -0.072850,
        -0.124550,  1.132900, -0.008349,
        -0.018151, -0.100579,  1.118730), nits / 203.0);
    rgb = max(rgb, 0.0);
    rgb /= 1.0 + max(rgb.r, max(rgb.g, rgb.b));
    return lerp(12.92 * rgb, 1.055 * pow(rgb, 1.0 / 2.4) - 0.055, step(0.0031308, rgb));
}

float4 ps(V input) : SV_Target {
    float3 sum = 0;
    [unroll] for (int y = 0; y < 2; y++) {
        [unroll] for (int x = 0; x < 2; x++) {
            float3 texel = image.SampleLevel(linearClamp,
                input.uv + (float2(x, y) * .50 - .250) * footprint.xy, 0).rgb;
            sum += footprint.z > 0.5 ? pqNits(texel) : texel;
        }
    }
    float3 rgb = footprint.z > 0.5 ? menuSrgb(sum / 4) : sum / 4;
    return float4(rgb.bgr, 1);
}
