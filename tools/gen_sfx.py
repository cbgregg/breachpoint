#!/usr/bin/env python3
"""Generate the game's recorded sound effects with ElevenLabs' sound-effects model.

Each entry below becomes assets/audio/<id>_<n>.mp3 (n = take) and is added to assets/audio/manifest.json; the game
plays a random take of a recording instead of its synthesized sound whenever one exists (per weapon for 'shot_<id>',
per surface for 'step_<surface>' / 'impact_<surface>').

    EL_KEY=... python3 tools/gen_sfx.py            # generate what's missing
    EL_KEY=... python3 tools/gen_sfx.py shot_      # regenerate everything whose id starts with shot_

Takes are trimmed of leading silence, faded out, peak-normalized and saved as mono 44.1 kHz mp3 (needs ffmpeg).
"""
import json, os, subprocess, sys, tempfile, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'audio')
ONE = ' One single sound only, no music, no voices.'

# id, prompt, seconds, takes, peak dBFS
SFX = [
  # hit feedback
  ('headshot', "Cash register 'cha-ching': a mechanical key punch and drawer clack, then a bright ringing register bell. Close-up, dry.", 1.2, 2, -2),
  ('hit', 'A bullet striking body armor: a short, dull thwack with a crisp tick on top. Very short, close, dry.', 0.5, 3, -4),
  ('kill', 'A heavy, punchy bullet impact thud with a short crunchy snap. Close, dry, satisfying.', 0.6, 2, -3),
  ('hurt', 'A muffled close thump of something hitting a body armor plate, felt more than heard. Short.', 0.5, 2, -4),
  # gunfire (per weapon)
  ('shot_rifle', 'A single gunshot from a 5.56 assault carbine outdoors: sharp crack, punchy boom, short echo off buildings.', 1.4, 2, -1),
  ('shot_smg', 'A single gunshot from a 9mm submachine gun: snappy, tight report with a short echo.', 1.1, 2, -1),
  ('shot_shotgun', 'A single 12 gauge pump shotgun blast outdoors: deep, wide boom with an echo. No pumping sound.', 1.8, 2, -1),
  ('shot_sniper', 'A single .50 caliber bolt-action sniper rifle shot: huge thunderous crack with a long rolling echo across city buildings.', 2.5, 2, -1),
  ('shot_pistol', 'A single .45 pistol gunshot: sharp, loud pop with a short echo.', 1.0, 2, -1),
  ('shot_kv47', 'A single gunshot from an AK-47 7.62mm rifle: heavy, aggressive crack with a short echo.', 1.4, 2, -1),
  ('shot_br308', 'A single gunshot from a .308 battle rifle: powerful, deep crack with an echo.', 1.5, 2, -1),
  ('shot_hx60', 'A single gunshot from a belt-fed light machine gun: heavy, thumping report with an echo.', 1.4, 2, -1),
  ('shot_krv45', 'A single gunshot from a compact .45 ACP submachine gun: thumpy, compact pop.', 1.0, 2, -1),
  ('shot_mr14', 'A single gunshot from a 7.62 designated marksman rifle: sharp, loud crack with an echo.', 1.6, 2, -1),
  ('shot_sa12', 'A single blast from a semi-automatic 12 gauge combat shotgun: punchy boom with an echo.', 1.6, 2, -1),
  ('shot_d50', 'A single .50 AE hand cannon pistol gunshot: very loud, deep boom with an echo.', 1.6, 2, -1),
  ('shot_r357', 'A single .357 magnum revolver gunshot: loud, sharp bang with an echo.', 1.5, 2, -1),
  ('shot_mp18', 'A single gunshot from a 9mm machine pistol: small, sharp snap.', 0.9, 2, -1),
  ('shot_suppressed', 'A single suppressed rifle gunshot: muffled thump with the metallic clack of the bolt cycling. No echo.', 0.7, 2, -2),
  # the world
  ('explosion', 'A frag grenade exploding outdoors: deep concussive boom, debris, rolling echo between buildings.', 3.0, 2, -1),
  ('impact', 'A bullet hitting a concrete wall: sharp chip and crumble of dust. Very short.', 0.5, 3, -3),
  ('impact_metal', 'A bullet hitting sheet metal: sharp ping and clang. Short.', 0.6, 3, -3),
  ('impact_wood', 'A bullet hitting a wooden plank: dull splintering thock. Short.', 0.5, 2, -3),
  ('impact_glass', 'A bullet hitting a glass window: crack and small tinkling shatter.', 0.8, 2, -3),
  ('impact_dirt', 'A bullet hitting dirt ground: soft puff and thud. Short.', 0.5, 2, -4),
  ('step', 'A single combat boot footstep on concrete, close.', 0.5, 4, -6),
  ('step_metal', 'A single combat boot footstep on a metal grate deck, close.', 0.5, 3, -6),
  ('step_wood', 'A single combat boot footstep on wooden floorboards, close.', 0.5, 3, -6),
  ('step_dirt', 'A single combat boot footstep on dirt and gravel, close.', 0.5, 3, -6),
  ('step_grass', 'A single boot footstep on grass, close.', 0.5, 2, -7),
  ('step_tile', 'A single hard boot footstep on a tiled floor, close.', 0.5, 2, -6),
  ('jump', 'A soldier jumping: quick rustle of clothing and rattle of gear. Short.', 0.5, 2, -8),
  ('land', 'A soldier landing on the ground after a jump: heavy boot thud with gear rattle.', 0.5, 2, -5),
  ('slide', 'A soldier sliding across a concrete floor: cloth and gear scraping.', 1.0, 2, -6),
  ('melee', 'A fast knife swing whoosh through the air.', 0.5, 2, -5),
  ('meleehit', 'A hard punch impact thud into a body.', 0.5, 2, -4),
  ('pin', 'A grenade pin being pulled: metallic ping and the spoon flicking off.', 0.5, 2, -5),
  ('bounce', 'A metal grenade bouncing once on concrete: metallic clink.', 0.5, 2, -6),
  ('switch', 'Swapping weapons: rifle sling rustle and metal handling rattle.', 0.7, 2, -7),
  ('pickup', 'Picking up ammunition: magazines and metal clinking together.', 0.6, 1, -6),
  ('dry', 'An empty gun dry-firing: a single hollow trigger click.', 0.5, 2, -6),
  ('whiz', 'A bullet whizzing past close to the ear: supersonic snap and whoosh.', 0.5, 3, -4),
  ('casing', 'A single brass shell casing dropping onto concrete: small metallic tinkle.', 0.5, 3, -9),
  ('doorkick', 'A wooden door being kicked open: loud bang and slam against the wall.', 1.0, 2, -2),
  ('shatter', 'A glass window shattering, with shards falling to the ground.', 1.5, 2, -2),
]


def gen(prompt, seconds):
  key = os.environ['EL_KEY']
  body = json.dumps({'text': prompt + ONE, 'duration_seconds': seconds, 'prompt_influence': 0.6}).encode()
  req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', data=body,
                               headers={'xi-api-key': key, 'Content-Type': 'application/json'})
  with urllib.request.urlopen(req, timeout=120) as r:
    return r.read()


def finish(raw, path, peak):
  with tempfile.TemporaryDirectory() as d:
    src, mid = os.path.join(d, 'in.mp3'), os.path.join(d, 'mid.wav')
    open(src, 'wb').write(raw)
    # trim leading silence so the sound starts on the frame it's played, mono, then fade out the last 40 ms
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '44100',
                    '-af', 'silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.005', mid], check=True)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mid],
                               capture_output=True, text=True).stdout.strip() or 0)
    vol = subprocess.run(['ffmpeg', '-v', 'info', '-i', mid, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    mx = float(vol.split('max_volume:')[1].split('dB')[0]) if 'max_volume:' in vol else 0
    fade = f'afade=t=out:st={max(0, dur - 0.04):.3f}:d=0.04,' if dur > 0.1 else ''
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mid, '-af', f'{fade}volume={peak - mx:.2f}dB',
                    '-codec:a', 'libmp3lame', '-b:a', '96k', path], check=True)
    return dur


def main():
  only = sys.argv[1] if len(sys.argv) > 1 else None
  jobs = []
  for id_, prompt, sec, takes, peak in SFX:
    for n in range(1, takes + 1):
      path = os.path.join(OUT, f'{id_}_{n}.mp3')
      if (only and id_.startswith(only)) or (not only and not os.path.exists(path)):
        jobs.append((id_, n, prompt, sec, peak, path))
  print(f'{len(jobs)} takes, ~{sum(j[3] for j in jobs):.0f} s of audio')

  def run(j):
    id_, n, prompt, sec, peak, path = j
    try:
      d = finish(gen(prompt, sec), path, peak)
      return f'{id_}_{n}: {d:.2f}s'
    except Exception as e:
      return f'{id_}_{n}: FAILED {e}'
  with ThreadPoolExecutor(4) as ex:
    for line in ex.map(run, jobs):
      print(line, flush=True)

  mf = os.path.join(OUT, 'manifest.json')
  files = json.load(open(mf))['files']
  have = set(files)
  for id_, _, _, takes, _ in SFX:
    for n in range(1, takes + 1):
      k = f'{id_}_{n}'
      if k not in have and os.path.exists(os.path.join(OUT, k + '.mp3')):
        files.append(k)
  json.dump({'files': files}, open(mf, 'w'), indent=0)
  print('manifest:', len(files), 'files')


if __name__ == '__main__':
  main()
