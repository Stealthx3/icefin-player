/*
 * hda-hdmi-sink: a virtual HDMI receiver for the Icefin Player lab (docs/LAB.md, "Virtual AV tier").
 *
 * An HDA codec with one digital converter and one HDMI pin, the shape of a GPU's HDMI audio codec.
 * Linux binds it with the stock "Generic HDMI" driver (snd-hda-codec-hdmi, vendor id 0x00000101), so the
 * guest reads its ELD through the standard HDA verbs and exposes /proc/asound/card*\/eld#*, exactly as for a
 * real TV or AV receiver. Nothing is played: every stream the guest sends is captured byte for byte, with
 * its format, the IEC958 non-audio bit, the HBR pin mode and the audio infoframe, so the lab can check
 * that a bitstream (AC-3, E-AC-3, DTS, TrueHD, DTS-HD) reached the "receiver" unchanged.
 *
 * Properties:
 *   eld=PATH        binary ELD the sink reports (settable at run time with qom-set; triggers a hotplug event)
 *   connected=on    monitor presence (settable at run time; on/off sends the hotplug event)
 *   capture=DIR     where streams go: seg-NNNN.raw + seg-NNNN.json per stream, events.jsonl for everything
 *   vendor-id=N     codec vendor id (default 0x00000101 = Linux's Generic HDMI)
 *   debug=N         verb trace on stderr
 *
 * Copyright (C) 2026 Icefin Player contributors.
 * The codec plumbing follows QEMU's hw/audio/hda-codec.c (Copyright (C) 2010 Red Hat, Inc., Gerd Hoffmann).
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the GNU General
 * Public License as published by the Free Software Foundation; either version 2 or (at your option) version 3
 * of the License.
 */

#include "qemu/osdep.h"
#include "qemu/host-utils.h"
#include "qemu/module.h"
#include "qemu/timer.h"
#include "qapi/error.h"
#include "hw/qdev-properties.h"
#include "migration/vmstate.h"
#include "intel-hda.h"
#include "intel-hda-defs.h"
#include "qom/object.h"

#ifndef AC_VERB_GET_DIGI_CONVERT_3
#define AC_VERB_GET_DIGI_CONVERT_3 0x0f3e
#endif
#ifndef AC_VERB_SET_DIGI_CONVERT_3
#define AC_VERB_SET_DIGI_CONVERT_3 0x73e
#endif
#ifndef AC_PINSENSE_PRESENCE
#define AC_PINSENSE_PRESENCE (1U << 31)
#endif
#ifndef AC_PINSENSE_ELDV
#define AC_PINSENSE_ELDV (1U << 30)
#endif
#ifndef AC_DIPSIZE_ELD_BUF
#define AC_DIPSIZE_ELD_BUF (1 << 3)
#endif
#ifndef AC_ELDD_ELD_VALID
#define AC_ELDD_ELD_VALID (1U << 31)
#endif
#ifndef AC_UNSOL_RES_PD
#define AC_UNSOL_RES_PD (1 << 0)
#endif
#ifndef AC_UNSOL_RES_ELDV
#define AC_UNSOL_RES_ELDV (1 << 1)
#endif

#define SINK_ELD_MAX     256
#define SINK_DIP_PACKETS 8
#define SINK_DIP_BYTES   32
#define SINK_TICK_NS     (SCALE_MS)

enum { NID_ROOT = 0, NID_AFG = 1, NID_CVT = 2, NID_PIN = 3, NID_COUNT = 4 };

/* converter and pin: digital, 8 channels (stereo + channel-count extension 3) */
#define SINK_CHANS_8 (AC_WCAP_STEREO | (3 << 13))
#define SINK_WCAP_CVT ((AC_WID_AUD_OUT << AC_WCAP_TYPE_SHIFT) | AC_WCAP_DIGITAL | AC_WCAP_FORMAT_OVRD | SINK_CHANS_8)
#define SINK_WCAP_PIN ((AC_WID_PIN << AC_WCAP_TYPE_SHIFT) | AC_WCAP_DIGITAL | AC_WCAP_CONN_LIST | \
                       AC_WCAP_UNSOL_CAP | SINK_CHANS_8)
#define SINK_PINCAP   (AC_PINCAP_OUT | AC_PINCAP_PRES_DETECT | AC_PINCAP_HDMI | AC_PINCAP_HBR)
/* 32-192 kHz; 16, 20, 24 bit */
#define SINK_PCM      (0x7f0 | AC_SUPPCM_BITS_16 | AC_SUPPCM_BITS_20 | AC_SUPPCM_BITS_24)
#define SINK_STREAM   (AC_SUPFMT_PCM | AC_SUPFMT_AC3)
/* jack, digital other out, connection type digital other, association 1 (a typical HDMI pin) */
#define SINK_PINCFG   0x18560010

#define TYPE_HDA_HDMI_SINK "hda-hdmi-sink"
OBJECT_DECLARE_SIMPLE_TYPE(HDMISinkState, HDA_HDMI_SINK)

struct HDMISinkState {
    HDACodecDevice hda;
    const char *name;

    /* properties */
    uint32_t debug;
    uint32_t vendor_id;
    char *capture_dir;
    char *eld_path;
    bool connected;

    uint8_t eld[SINK_ELD_MAX];
    uint32_t eld_len;

    /* converter */
    uint32_t stream, channel, format;
    uint8_t dig1, dig2, dig3;
    uint32_t chan_count;     /* SET_CVT_CHAN_COUNT payload (channels - 1) */
    bool running;

    /* pin */
    uint32_t pinctl, unsol;
    uint8_t chan_slot[8];    /* ASP slot -> converter channel */
    uint8_t dip[SINK_DIP_PACKETS][SINK_DIP_BYTES];
    uint8_t dip_xmit[SINK_DIP_PACKETS];
    uint32_t dip_packet, dip_byte;

    uint32_t power[NID_COUNT];
    bool stream_running[16];

    /* capture */
    QEMUTimer *timer;
    int64_t t_start;
    int64_t pos;
    FILE *seg;
    FILE *events;
    uint32_t seg_no;
    uint64_t seg_bytes;
    uint8_t buf[16384];
};

/* ------------------------------------------------------------------ format helpers */

static uint32_t fmt_rate(uint32_t f)
{
    uint32_t rate = (f & AC_FMT_BASE_44K) ? 44100 : 48000;
    rate *= ((f & AC_FMT_MULT_MASK) >> AC_FMT_MULT_SHIFT) + 1;
    rate /= ((f & AC_FMT_DIV_MASK) >> AC_FMT_DIV_SHIFT) + 1;
    return rate;
}

static uint32_t fmt_channels(uint32_t f)
{
    return ((f & AC_FMT_CHAN_MASK) >> AC_FMT_CHAN_SHIFT) + 1;
}

static uint32_t fmt_bits(uint32_t f)
{
    static const uint32_t bits[8] = { 8, 16, 20, 24, 32, 0, 0, 0 };
    return bits[(f & AC_FMT_BITS_MASK) >> 4];
}

static uint32_t fmt_container(uint32_t f)
{
    uint32_t b = fmt_bits(f);
    return b == 8 ? 1 : b == 16 ? 2 : 4;
}

static bool sink_non_pcm(HDMISinkState *s)
{
    return (s->format & AC_FMT_TYPE_NON_PCM) || (s->dig1 & AC_DIG1_NONAUDIO);
}

static bool sink_hbr(HDMISinkState *s)
{
    return (s->pinctl & 0x3) == 0x3;    /* AC_PINCTL_EPT_HBR */
}

/* ------------------------------------------------------------------ event log */

static void sink_event(HDMISinkState *s, const char *fmt, ...) G_GNUC_PRINTF(2, 3);
static void sink_event(HDMISinkState *s, const char *fmt, ...)
{
    va_list ap;

    if (!s->events) {
        return;
    }
    fprintf(s->events, "{\"t_ns\":%" PRId64 ",", qemu_clock_get_ns(QEMU_CLOCK_VIRTUAL));
    va_start(ap, fmt);
    vfprintf(s->events, fmt, ap);
    va_end(ap);
    fputs("}\n", s->events);
    fflush(s->events);
}

static void sink_hex(char *out, const uint8_t *in, size_t n)
{
    static const char digits[] = "0123456789abcdef";
    size_t i;

    for (i = 0; i < n; i++) {
        out[2 * i] = digits[in[i] >> 4];
        out[2 * i + 1] = digits[in[i] & 0xf];
    }
    out[2 * n] = 0;
}

/* ------------------------------------------------------------------ capture */

static uint64_t sink_bytes_per_second(HDMISinkState *s)
{
    return (uint64_t)fmt_rate(s->format) * fmt_channels(s->format) * fmt_container(s->format);
}

static void sink_write_meta(HDMISinkState *s, bool final)
{
    g_autofree char *path = NULL;
    char infoframe[SINK_DIP_BYTES * 2 + 1];
    FILE *f;

    if (!s->capture_dir) {
        return;
    }
    path = g_strdup_printf("%s/seg-%04u.json", s->capture_dir, s->seg_no);
    f = fopen(path, "w");
    if (!f) {
        return;
    }
    sink_hex(infoframe, s->dip[0], SINK_DIP_BYTES);
    fprintf(f,
            "{\"seg\":%u,\"raw\":\"seg-%04u.raw\",\"final\":%s,\"rate\":%u,\"channels\":%u,\"bits\":%u,"
            "\"container_bytes\":%u,\"format\":%u,\"non_pcm\":%s,\"dig1\":%u,\"dig2\":%u,\"dig3\":%u,"
            "\"hbr\":%s,\"pinctl\":%u,\"cvt_channels\":%u,"
            "\"chan_slots\":[%u,%u,%u,%u,%u,%u,%u,%u],\"infoframe\":\"%s\",\"infoframe_xmit\":%u,"
            "\"eld\":\"%s\",\"bytes\":%" PRIu64 "}\n",
            s->seg_no, s->seg_no, final ? "true" : "false", fmt_rate(s->format), fmt_channels(s->format),
            fmt_bits(s->format), fmt_container(s->format), s->format, sink_non_pcm(s) ? "true" : "false",
            s->dig1, s->dig2, s->dig3, sink_hbr(s) ? "true" : "false", s->pinctl, s->chan_count + 1,
            s->chan_slot[0], s->chan_slot[1], s->chan_slot[2], s->chan_slot[3],
            s->chan_slot[4], s->chan_slot[5], s->chan_slot[6], s->chan_slot[7],
            infoframe, s->dip_xmit[0], s->eld_path ? s->eld_path : "", s->seg_bytes);
    fclose(f);
}

static void sink_timer(void *opaque)
{
    HDMISinkState *s = opaque;
    int64_t now = qemu_clock_get_ns(QEMU_CLOCK_VIRTUAL);
    uint32_t frame = fmt_channels(s->format) * fmt_container(s->format);
    int64_t wanted;

    wanted = muldiv64(now - s->t_start, sink_bytes_per_second(s), NANOSECONDS_PER_SECOND);
    wanted -= wanted % frame;
    while (s->pos < wanted) {
        uint32_t chunk = MIN(wanted - s->pos, sizeof(s->buf) - sizeof(s->buf) % frame);
        if (!hda_codec_xfer(&s->hda, s->stream, true, s->buf, chunk)) {
            break;
        }
        if (s->seg) {
            fwrite(s->buf, 1, chunk, s->seg);
        }
        s->pos += chunk;
        s->seg_bytes += chunk;
    }
    if (s->running) {
        timer_mod_anticipate_ns(s->timer, now + SINK_TICK_NS);
    }
}

static void sink_set_running(HDMISinkState *s, bool running)
{
    if (s->running == running) {
        return;
    }
    s->running = running;
    if (running) {
        s->seg_no++;
        s->seg_bytes = 0;
        s->pos = 0;
        s->t_start = qemu_clock_get_ns(QEMU_CLOCK_VIRTUAL);
        if (s->capture_dir) {
            g_autofree char *path = g_strdup_printf("%s/seg-%04u.raw", s->capture_dir, s->seg_no);
            s->seg = fopen(path, "wb");
        }
        sink_write_meta(s, false);
        sink_event(s, "\"event\":\"stream-start\",\"seg\":%u,\"stream\":%u,\"rate\":%u,\"channels\":%u,"
                   "\"bits\":%u,\"non_pcm\":%s,\"hbr\":%s",
                   s->seg_no, s->stream, fmt_rate(s->format), fmt_channels(s->format), fmt_bits(s->format),
                   sink_non_pcm(s) ? "true" : "false", sink_hbr(s) ? "true" : "false");
        timer_mod_anticipate_ns(s->timer, s->t_start + SINK_TICK_NS);
    } else {
        timer_del(s->timer);
        if (s->seg) {
            fclose(s->seg);
            s->seg = NULL;
        }
        sink_write_meta(s, true);
        sink_event(s, "\"event\":\"stream-stop\",\"seg\":%u,\"bytes\":%" PRIu64, s->seg_no, s->seg_bytes);
    }
}

static void sink_update_running(HDMISinkState *s)
{
    sink_set_running(s, s->stream != 0 && s->stream_running[s->stream & 0xf]);
}

/* ------------------------------------------------------------------ ELD and hotplug */

static bool sink_load_eld(HDMISinkState *s, const char *path, Error **errp)
{
    g_autofree gchar *data = NULL;
    gsize len = 0;
    g_autoptr(GError) gerr = NULL;

    if (!path || !*path) {
        s->eld_len = 0;
        return true;
    }
    if (!g_file_get_contents(path, &data, &len, &gerr)) {
        error_setg(errp, "hda-hdmi-sink: cannot read ELD %s: %s", path, gerr->message);
        return false;
    }
    if (len < 20 || len > SINK_ELD_MAX) {
        error_setg(errp, "hda-hdmi-sink: ELD %s has %zu bytes (20-%d allowed)", path, (size_t)len, SINK_ELD_MAX);
        return false;
    }
    memcpy(s->eld, data, len);
    s->eld_len = len;
    return true;
}

static uint32_t sink_pin_sense(HDMISinkState *s)
{
    if (!s->connected) {
        return 0;
    }
    return AC_PINSENSE_PRESENCE | (s->eld_len ? AC_PINSENSE_ELDV : 0);
}

static void sink_hotplug(HDMISinkState *s)
{
    uint32_t res;

    sink_event(s, "\"event\":\"hotplug\",\"connected\":%s,\"eld\":\"%s\",\"eld_bytes\":%u",
               s->connected ? "true" : "false", s->eld_path ? s->eld_path : "", s->eld_len);
    if (!DEVICE(s)->realized || !(s->unsol & AC_USRSP_EN)) {
        return;
    }
    res = ((s->unsol & 0x3f) << 26);
    if (s->connected) {
        res |= AC_UNSOL_RES_PD | (s->eld_len ? AC_UNSOL_RES_ELDV : 0);
    }
    hda_codec_response(&s->hda, false, res);
}

static char *sink_get_eld(Object *obj, Error **errp)
{
    return g_strdup(HDA_HDMI_SINK(obj)->eld_path ? HDA_HDMI_SINK(obj)->eld_path : "");
}

static void sink_set_eld(Object *obj, const char *value, Error **errp)
{
    HDMISinkState *s = HDA_HDMI_SINK(obj);

    if (!sink_load_eld(s, value, errp)) {
        return;
    }
    g_free(s->eld_path);
    s->eld_path = g_strdup(value);
    sink_hotplug(s);
}

static bool sink_get_connected(Object *obj, Error **errp)
{
    return HDA_HDMI_SINK(obj)->connected;
}

static void sink_set_connected(Object *obj, bool value, Error **errp)
{
    HDMISinkState *s = HDA_HDMI_SINK(obj);

    s->connected = value;
    sink_hotplug(s);
}

/* ------------------------------------------------------------------ parameters */

static bool sink_param(HDMISinkState *s, uint32_t nid, uint32_t id, uint32_t *val)
{
    switch (nid) {
    case NID_ROOT:
        switch (id) {
        case AC_PAR_VENDOR_ID:     *val = s->vendor_id; return true;
        case AC_PAR_SUBSYSTEM_ID:  *val = 0x1af40101; return true;
        case AC_PAR_REV_ID:        *val = 0x00100100; return true;
        case AC_PAR_NODE_COUNT:    *val = (NID_AFG << 16) | 1; return true;
        }
        return false;
    case NID_AFG:
        switch (id) {
        case AC_PAR_FUNCTION_TYPE: *val = AC_GRP_AUDIO_FUNCTION | AC_FGT_UNSOL_CAP; return true;
        case AC_PAR_SUBSYSTEM_ID:  *val = 0x1af40101; return true;
        case AC_PAR_NODE_COUNT:    *val = (NID_CVT << 16) | 2; return true;
        case AC_PAR_AUDIO_FG_CAP:  *val = 0; return true;
        case AC_PAR_PCM:           *val = SINK_PCM; return true;
        case AC_PAR_STREAM:        *val = SINK_STREAM; return true;
        case AC_PAR_AMP_IN_CAP:
        case AC_PAR_AMP_OUT_CAP:
        case AC_PAR_GPIO_CAP:      *val = 0; return true;
        case AC_PAR_POWER_STATE:   *val = AC_PWRST_D0SUP | AC_PWRST_D3SUP; return true;
        }
        return false;
    case NID_CVT:
        switch (id) {
        case AC_PAR_AUDIO_WIDGET_CAP: *val = SINK_WCAP_CVT; return true;
        case AC_PAR_PCM:              *val = SINK_PCM; return true;
        case AC_PAR_STREAM:           *val = SINK_STREAM; return true;
        case AC_PAR_AMP_IN_CAP:
        case AC_PAR_AMP_OUT_CAP:      *val = 0; return true;
        case AC_PAR_POWER_STATE:      *val = AC_PWRST_D0SUP | AC_PWRST_D3SUP; return true;
        }
        return false;
    case NID_PIN:
        switch (id) {
        case AC_PAR_AUDIO_WIDGET_CAP: *val = SINK_WCAP_PIN; return true;
        case AC_PAR_PIN_CAP:          *val = SINK_PINCAP; return true;
        case AC_PAR_CONNLIST_LEN:     *val = 1; return true;
        case AC_PAR_AMP_IN_CAP:
        case AC_PAR_AMP_OUT_CAP:      *val = 0; return true;
        case AC_PAR_POWER_STATE:      *val = AC_PWRST_D0SUP | AC_PWRST_D3SUP; return true;
        }
        return false;
    }
    return false;
}

/* ------------------------------------------------------------------ verbs */

static void sink_command(HDACodecDevice *hda, uint32_t nid, uint32_t data)
{
    HDMISinkState *s = HDA_HDMI_SINK(hda);
    uint32_t verb, payload, r = 0;

    if ((data & 0x70000) == 0x70000) {
        verb = (data >> 8) & 0xfff;     /* 12-bit verb, 8-bit payload */
        payload = data & 0xff;
    } else {
        verb = (data >> 8) & 0xf00;     /* 4-bit verb, 16-bit payload */
        payload = data & 0xffff;
    }
    if (s->debug) {
        fprintf(stderr, "%s: nid %u verb 0x%03x payload 0x%04x\n", s->name, nid, verb, payload);
    }
    if (nid >= NID_COUNT) {
        goto out;
    }

    switch (verb) {
    case AC_VERB_PARAMETERS:
        if (!sink_param(s, nid, payload, &r)) {
            r = 0;
        }
        break;
    case AC_VERB_GET_SUBSYSTEM_ID:
        r = 0x1af40101;
        break;
    case AC_VERB_GET_POWER_STATE:
        r = (s->power[nid] << 4) | s->power[nid];
        break;
    case AC_VERB_SET_POWER_STATE:
        s->power[nid] = payload & 0xf;
        if (nid == NID_AFG) {
            s->power[NID_CVT] = s->power[NID_PIN] = s->power[nid];
        }
        break;

    /* converter */
    case AC_VERB_SET_CHANNEL_STREAMID:
        if (nid == NID_CVT) {
            sink_set_running(s, false);
            s->stream = (payload >> 4) & 0xf;
            s->channel = payload & 0xf;
            sink_update_running(s);
        }
        break;
    case AC_VERB_GET_CONV:
        r = (s->stream << 4) | s->channel;
        break;
    case AC_VERB_SET_STREAM_FORMAT:
        if (nid == NID_CVT && s->format != payload) {
            bool was = s->running;
            sink_set_running(s, false);   /* a format change starts a new segment */
            s->format = payload;
            if (was) {
                sink_update_running(s);
            }
        }
        break;
    case AC_VERB_GET_STREAM_FORMAT:
        r = s->format;
        break;
    case AC_VERB_GET_DIGI_CONVERT_1:
        r = s->dig1 | (s->dig2 << 8) | (s->dig3 << 16);
        break;
    case AC_VERB_SET_DIGI_CONVERT_1:
        if (s->dig1 != payload) {
            sink_event(s, "\"event\":\"digi-convert\",\"dig1\":%u,\"non_audio\":%s",
                       payload, (payload & AC_DIG1_NONAUDIO) ? "true" : "false");
        }
        s->dig1 = payload;
        break;
    case AC_VERB_SET_DIGI_CONVERT_2:
        s->dig2 = payload;
        break;
    case AC_VERB_SET_DIGI_CONVERT_3:
        s->dig3 = payload;
        break;
    case AC_VERB_GET_CVT_CHAN_COUNT:
        r = s->chan_count;
        break;
    case AC_VERB_SET_CVT_CHAN_COUNT:
        s->chan_count = payload;
        break;

    /* pin */
    case AC_VERB_GET_CONFIG_DEFAULT:
        r = nid == NID_PIN ? SINK_PINCFG : 0;
        break;
    case AC_VERB_GET_CONNECT_LIST:
        r = nid == NID_PIN && payload == 0 ? NID_CVT : 0;
        break;
    case AC_VERB_GET_PIN_WIDGET_CONTROL:
        r = s->pinctl;
        break;
    case AC_VERB_SET_PIN_WIDGET_CONTROL:
        if ((s->pinctl & 0x3) != (payload & 0x3)) {
            sink_event(s, "\"event\":\"pin-mode\",\"hbr\":%s", (payload & 0x3) == 0x3 ? "true" : "false");
        }
        s->pinctl = payload;
        break;
    case AC_VERB_GET_UNSOLICITED_RESPONSE:
        r = s->unsol;
        break;
    case AC_VERB_SET_UNSOLICITED_ENABLE:
        s->unsol = payload;
        break;
    case AC_VERB_GET_PIN_SENSE:
        r = sink_pin_sense(s);
        break;
    case AC_VERB_GET_HDMI_DIP_SIZE:
        if (payload & AC_DIPSIZE_ELD_BUF) {
            r = s->eld_len;
        } else {
            r = (payload & 0x7) == 0 ? SINK_DIP_BYTES : 0;
        }
        break;
    case AC_VERB_GET_HDMI_ELDD:
        if (s->connected && payload < s->eld_len) {
            r = AC_ELDD_ELD_VALID | s->eld[payload];
        }
        break;
    case AC_VERB_GET_HDMI_DIP_INDEX:
        r = (s->dip_packet << 5) | s->dip_byte;
        break;
    case AC_VERB_SET_HDMI_DIP_INDEX:
        s->dip_packet = (payload >> 5) & 0x7;
        s->dip_byte = payload & 0x1f;
        break;
    case AC_VERB_GET_HDMI_DIP_DATA:
        r = s->dip[s->dip_packet][s->dip_byte];
        s->dip_byte = (s->dip_byte + 1) % SINK_DIP_BYTES;
        break;
    case AC_VERB_SET_HDMI_DIP_DATA:
        s->dip[s->dip_packet][s->dip_byte] = payload;
        s->dip_byte = (s->dip_byte + 1) % SINK_DIP_BYTES;
        break;
    case AC_VERB_GET_HDMI_DIP_XMIT:
        r = s->dip_xmit[s->dip_packet];
        break;
    case AC_VERB_SET_HDMI_DIP_XMIT:
        s->dip_xmit[s->dip_packet] = payload;
        if (s->dip_packet == 0) {
            char hex[SINK_DIP_BYTES * 2 + 1];
            sink_hex(hex, s->dip[0], SINK_DIP_BYTES);
            sink_event(s, "\"event\":\"infoframe\",\"xmit\":%u,\"bytes\":\"%s\"", payload, hex);
        }
        break;
    case AC_VERB_GET_HDMI_CHAN_SLOT:
        r = (s->chan_slot[payload & 0x7] << 4) | (payload & 0xf);
        break;
    case AC_VERB_SET_HDMI_CHAN_SLOT:
        s->chan_slot[payload & 0x7] = (payload >> 4) & 0xf;
        break;

    default:
        /* amps, EAPD, stripe control, connection select, ...: accept and answer 0 */
        break;
    }
out:
    hda_codec_response(hda, true, r);
}

static void sink_stream(HDACodecDevice *hda, uint32_t stnr, bool running, bool output)
{
    HDMISinkState *s = HDA_HDMI_SINK(hda);

    if (!output) {
        return;
    }
    s->stream_running[stnr & 0xf] = running;
    if (s->stream == stnr) {
        sink_update_running(s);
    }
}

/* ------------------------------------------------------------------ lifecycle */

static void sink_init(HDACodecDevice *hda, Error **errp)
{
    HDMISinkState *s = HDA_HDMI_SINK(hda);
    int i;

    s->name = object_get_typename(OBJECT(s));
    if (s->eld_path && !s->eld_len && !sink_load_eld(s, s->eld_path, errp)) {
        return;
    }
    if (s->capture_dir) {
        g_autofree char *path = g_strdup_printf("%s/events.jsonl", s->capture_dir);
        if (g_mkdir_with_parents(s->capture_dir, 0755) < 0 || !(s->events = fopen(path, "a"))) {
            error_setg_errno(errp, errno, "hda-hdmi-sink: cannot open %s", path);
            return;
        }
    }
    for (i = 0; i < 8; i++) {
        s->chan_slot[i] = i;
    }
    s->format = AC_FMT_TYPE_PCM | AC_FMT_BITS_16 | (1 << AC_FMT_CHAN_SHIFT);
    s->timer = timer_new_ns(QEMU_CLOCK_VIRTUAL, sink_timer, s);
    sink_event(s, "\"event\":\"realize\",\"connected\":%s,\"eld\":\"%s\",\"eld_bytes\":%u",
               s->connected ? "true" : "false", s->eld_path ? s->eld_path : "", s->eld_len);
}

static void sink_exit(HDACodecDevice *hda)
{
    HDMISinkState *s = HDA_HDMI_SINK(hda);

    sink_set_running(s, false);
    timer_free(s->timer);
    if (s->events) {
        fclose(s->events);
        s->events = NULL;
    }
}

static void sink_reset(DeviceState *dev)
{
    HDMISinkState *s = HDA_HDMI_SINK(dev);

    sink_set_running(s, false);
    memset(s->stream_running, 0, sizeof(s->stream_running));
    s->stream = s->channel = 0;
    s->unsol = 0;
    s->pinctl = 0;
}

static const VMStateDescription vmstate_hdmi_sink = {
    .name = TYPE_HDA_HDMI_SINK,
    .unmigratable = 1,
};

static const Property hdmi_sink_properties[] = {
    DEFINE_PROP_UINT32("debug", HDMISinkState, debug, 0),
    DEFINE_PROP_UINT32("vendor-id", HDMISinkState, vendor_id, 0x00000101),
    DEFINE_PROP_STRING("capture", HDMISinkState, capture_dir),
};

static void hdmi_sink_class_init(ObjectClass *klass, void *data)
{
    DeviceClass *dc = DEVICE_CLASS(klass);
    HDACodecDeviceClass *k = HDA_CODEC_DEVICE_CLASS(klass);

    k->init = sink_init;
    k->exit = sink_exit;
    k->command = sink_command;
    k->stream = sink_stream;
    dc->desc = "HDA HDMI sink (virtual TV / AV receiver with ELD and stream capture)";
    dc->vmsd = &vmstate_hdmi_sink;
    set_bit(DEVICE_CATEGORY_SOUND, dc->categories);
    device_class_set_legacy_reset(dc, sink_reset);
    device_class_set_props(dc, hdmi_sink_properties);
    object_class_property_add_str(klass, "eld", sink_get_eld, sink_set_eld);
    object_class_property_add_bool(klass, "connected", sink_get_connected, sink_set_connected);
}

static const TypeInfo hdmi_sink_info = {
    .name          = TYPE_HDA_HDMI_SINK,
    .parent        = TYPE_HDA_CODEC_DEVICE,
    .instance_size = sizeof(HDMISinkState),
    .class_init    = hdmi_sink_class_init,
};

static void hdmi_sink_register_types(void)
{
    type_register_static(&hdmi_sink_info);
}

type_init(hdmi_sink_register_types)
