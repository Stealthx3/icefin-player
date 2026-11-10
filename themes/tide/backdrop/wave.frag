// Tide's backdrop: a gradient whose colours follow the month (palettes in tokens.json), soft ribbons of sine waves
// drifting across it, and a shade that follows the time of day. The engine writes the header and the uniform block
// (time, resolution and the params declared in theme.json); this is the body.
void main()
{
    vec2 uv = qt_TexCoord0;
    vec3 bg = mix(colorTop.rgb, colorBottom.rgb, uv.y);
    float t = time * speed;
    float px = 1.0 / max(resolution.y, 1.0);
    float glow = 0.0;
    for (int k = 0; k < 14; ++k) {
        float fk = float(k);
        float y = 0.55 + sin(uv.x * 5.2 + t + fk * 0.18) * 0.08
                       + sin(uv.x * 11.0 - t * 0.63 + fk * 0.4) * 0.025
                       + (fk - 7.0) * 0.006;
        float d = abs(uv.y - y);
        float width = (mod(fk, 4.0) < 0.5 ? 2.0 : 1.0) * px;
        glow += smoothstep(width * 1.5, 0.0, d) * (0.08 + 0.05 * sin(fk));
        glow += smoothstep(0.06, 0.0, d) * 0.012;
    }
    vec3 c = mix(bg, lineColor.rgb, clamp(glow * lineColor.a * 2.0, 0.0, 1.0));
    c = mix(c, shade.rgb, shade.a);
    fragColor = vec4(c, 1.0) * qt_Opacity;
}
