// Media Center's backdrop: a deep field lit from the top left, with two wide soft ribbons drifting slowly across it.
// The engine writes the header and the uniform block (time, resolution and the params in theme.json); this is the body.
float band(vec2 uv, float y0, float tilt, float phase, float width)
{
    float y = y0 + tilt * (uv.x - 0.5) + 0.05 * sin(uv.x * 2.4 + phase) + 0.03 * sin(uv.x * 5.1 - phase * 0.7);
    float d = (uv.y - y) / width;
    return exp(-d * d);
}

void main()
{
    vec2 uv = qt_TexCoord0;
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 p = vec2((uv.x - 0.2) * aspect, uv.y - 0.1);
    float r = length(p / vec2(1.2 * aspect, 0.9));
    vec3 c = mix(surface.rgb, background.rgb, smoothstep(0.0, 0.6, r));
    float t = time * speed;
    float b1 = band(uv, 0.37, 0.07, t, 0.16);
    float b2 = band(uv, 0.67, -0.10, t * 0.73 + 2.0, 0.17);
    float along = smoothstep(0.1, 0.45, uv.x) * (1.0 - smoothstep(0.6, 0.95, uv.x));
    vec4 rib = mix(ribbon, ribbonAlt, uv.x);
    c = mix(c, rib.rgb, clamp((b1 + b2) * rib.a * 2.2 * (0.35 + along), 0.0, 1.0));
    fragColor = vec4(c, 1.0) * qt_Opacity;
}
