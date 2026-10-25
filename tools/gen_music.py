#!/usr/bin/env python3
"""Generate the game's music with ElevenLabs Music.

    ELEVENLABS_API_KEY=... python3 tools/gen_music.py [--only menu] [--force]

Writes assets/music/<id>.mp3 for each track below (leading silence trimmed, loudness matched) and
assets/music/tracks.json, which the game reads: every track there is played instead of the synthesized score
(js/music.js keeps that as the fallback). For the countdown build-up it also finds where the closing hit lands, so
the game can line that hit up with the end of the countdown. The key is read from the environment only.

The score: grounded, dark hybrid orchestral and electronic, in the spirit of the Black Ops 2 era. No vocals.
"""
import json, os, subprocess, sys, time, urllib.error, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'music')
STYLE = ('Instrumental only, no vocals, no choir words. Modern military shooter video game score: dark hybrid orchestral '
         'and electronic, analog synth bass and pulses, low strings, industrial percussion, restrained and serious, '
         'not cheesy, not epic-trailer. ')

# id: (prompt, length in seconds, loudness LUFS, loops)
TRACKS = {
    'menu': (STYLE + 'Main menu theme. D minor, 90 BPM. Opens with a low synth drone and a slow, sparse piano motif, '
             'then pulsing arpeggiated synths and low staccato strings build into a steady, brooding groove with deep '
             'percussion hits; tension without release. Even energy throughout so it can loop.', 150, -18, True),
    'action_low': (STYLE + 'In-match tension bed, 110 BPM, D minor. Quiet and tense: a ticking synth pulse, muted '
                   'low strings, a soft sub-bass heartbeat, sparse metallic percussion, no big drums. Steady energy '
                   'throughout so it can loop.', 120, -20, True),
    'action_high': (STYLE + 'In-match firefight music, 110 BPM, D minor. Driving and aggressive: punchy electronic '
                    'drums and industrial percussion, a distorted synth bass riff, urgent staccato strings, short '
                    'brass stabs, glitchy synth textures. Steady high energy throughout so it can loop.', 120, -17, True),
    'infected': (STYLE + 'Survival horror tension for an infection game mode, 100 BPM, C minor. Unsettling: detuned '
                 'synth drones, a pounding low heartbeat drum, scraping string clusters, sparse metallic hits, a creeping '
                 'pulse that keeps building pressure. Steady throughout so it can loop.', 120, -18, True),
    # (a plain prompt gave two climaxes; a plan by sections gives one build and one hit)
    'intro': ({'composition_plan': {
        'positive_global_styles': ['dark hybrid orchestral and electronic military score', 'industrial percussion', 'analog synth', 'instrumental', 'cinematic tension'],
        'negative_global_styles': ['vocals', 'choir', 'melody', 'pop', 'cheesy', 'fanfare'],
        'sections': [
            {'section_name': 'Build', 'positive_local_styles': ['starts very quiet', 'single low drum hit every half second', 'steady crescendo', 'drums get faster and louder', 'rising synth riser', 'string swell', 'tension builds continuously'],
             'negative_local_styles': ['drops', 'climax', 'loud start', 'impacts'], 'duration_ms': 10000, 'lines': []},
            {'section_name': 'Impact', 'positive_local_styles': ['one single massive low impact hit', 'big reverb tail', 'then silence'],
             'negative_local_styles': ['drums continuing', 'melody', 'second hit'], 'duration_ms': 3000, 'lines': []}]}}, 13, -15, False),
    'win': (STYLE + 'A 7 second victory sting: one strong low hit, then a resolved, proud but restrained minor-to-major '
            'string and synth chord that rings out. Not triumphant fanfare.', 7, -16, False),
    'lose': (STYLE + 'A 7 second defeat sting: one heavy low hit, then a dark, somber descending low string and synth '
             'chord that fades out.', 7, -16, False),
    'muzak': ('Instrumental only, no vocals. Easy-listening supermarket background music: a gentle bossa nova in F major, '
              '116 BPM, electric piano comping, soft walking bass, brushed drums, a light vibraphone melody. Pleasant, '
              'bland and unobtrusive, like music in a grocery store. Even throughout so it can loop.', 120, -20, True),
}


def compose(prompt, seconds):
    # a prompt, or a plan by sections ({'composition_plan': ...}, which sets its own length)
    body = json.dumps(prompt if isinstance(prompt, dict) else {'prompt': prompt, 'music_length_ms': int(seconds * 1000)}).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', data=body,
                                 headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(4 * (attempt + 1))
                continue
            raise RuntimeError(f'{e.code} {e.read()[:300]}')


def finish(path, lufs):
    # trim leading silence, match loudness, 44.1 kHz stereo 128 kbit/s
    tmp = path + '.tmp.mp3'
    f = f'silenceremove=start_periods=1:start_threshold=-55dB,loudnorm=I={lufs}:TP=-1.5:LRA=14'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', f, '-ar', '44100', '-ac', '2', '-b:a', '128k', tmp], check=True)
    os.replace(tmp, path)


def trim_tail(path):
    # a loop shouldn't end on a fade-out or a silence (it would dip every time round): cut it back to its last
    # moment near its usual level; the game cross-fades the join
    import math, struct
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
    x = struct.unpack(f'<{len(pcm) // 2}h', pcm)
    fr = 4000
    db = [20 * math.log10(math.sqrt(sum(v * v for v in x[i:i + fr]) / fr) + 1) for i in range(0, len(x) - fr, fr)]
    med = sorted(db)[len(db) // 2]
    last = max(i for i, d in enumerate(db) if d >= med - 6)
    end = (last + 1) * fr / 8000
    if end < len(x) / 8000 - 0.75:
        tmp = path + '.tmp.mp3'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-t', f'{end:.2f}', '-c:a', 'libmp3lame', '-b:a', '128k', tmp], check=True)
        os.replace(tmp, path)


def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                                capture_output=True, text=True).stdout)


def hit_time(path):
    # where the build-up's closing hit lands (20 ms frames)
    import struct
    pcm = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True).stdout
    x = struct.unpack(f'<{len(pcm) // 2}h', pcm)
    fr = 160
    rms = [(sum(v * v for v in x[i:i + fr]) / fr) ** 0.5 for i in range(0, len(x) - fr, fr)]
    # (the first moment in the second half it gets near its loudest: the impact's onset, not some later peak in its tail)
    top = max(rms)
    at = next((i for i in range(len(rms) // 2, len(rms)) if rms[i] > 0.6 * top), len(rms) - 1)
    return round(at * fr / 8000, 3)


def main():
    if not os.environ.get('ELEVENLABS_API_KEY'):
        sys.exit('set ELEVENLABS_API_KEY')
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(OUT, 'tracks.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    for id_, (prompt, secs, lufs, loops) in TRACKS.items():
        if only and id_ != only:
            continue
        path = os.path.join(OUT, id_ + '.mp3')
        if os.path.exists(path) and not force:
            continue
        print(f'{id_}: composing {secs} s...', flush=True)
        audio = compose(prompt, secs)
        open(path, 'wb').write(audio)
        finish(path, lufs)
        if loops:
            trim_tail(path)
        meta[id_] = {'file': f'assets/music/{id_}.mp3', 'loop': loops, 'len': round(duration(path), 3)}
        if id_ == 'intro':
            meta[id_]['hit'] = hit_time(path)
        print(f'  {meta[id_]}', flush=True)
    json.dump(meta, open(meta_path, 'w'), indent=1)
    open(meta_path, 'a').write('\n')


if __name__ == '__main__':
    main()
