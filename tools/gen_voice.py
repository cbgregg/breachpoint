#!/usr/bin/env python3
"""Generate every voice line in docs/voice-lines.md with Azure text-to-speech.

    AZURE_SPEECH_KEY=... [AZURE_SPEECH_REGION=westus2] python3 tools/gen_voice.py [--only vo/link] [--force]

Writes assets/audio/<id>.mp3 (24 kHz, 48 kbit/s mono MP3) for each line below and lists every file that exists
in assets/audio/manifest.json, which is what the game loads. Lines that already have a file are skipped unless
--force. The key is read from the environment only: never put it in this file.
"""
import json, os, sys, time, urllib.request, urllib.error
from xml.sax.saxutils import escape

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'audio')
FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

# ---------- voices ----------
# Azure's Dragon HD voices: they read the line for its meaning (a "Double kill!" comes out excited, a "Defeat."
# flat) and sound like a person, where the older neural voices with styles and pitch shifts sounded synthetic.
# HD voices take no styles and no prosody changes, so a voice here is just its name. Link keeps Ava on board and
# Andrew on the platform; the announcer and the squad are other voices so they never sound like the train.
def hd(name):
    return f'en-US-{name}:DragonHDLatestNeural'


ANNOUNCER = hd('Brian')       # match flow: calm, clipped mission controller
MEDALS = ANNOUNCER            # the same man; the exclamation marks give the medals their energy
ONBOARD = hd('Ava')           # Link: on-board announcements
PLATFORM = hd('Andrew')       # Link: platform PA and "please hold on"
SQUAD = [hd('Davis'), hd('Steffan'), hd('Adam'), hd('Tyler')]
SQUAD_LOW = SQUAD
BANTER = SQUAD + [hd('Emma')]

# takes that speech-to-text couldn't make out with their first voice, re-voiced (checked by transcribing every clip)
OVERRIDE = {}
SEMTEX = '<phoneme alphabet="ipa" ph="ˈsɛmtɛks">Semtex</phoneme>'


def ssml(name, body):
    return ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" '
            f'xml:lang="en-US"><voice name="{name}">{body}</voice></speak>')


def t(text):
    return escape(text)


LINES = {}   # id -> (voice, ssml body)


def add(id_, voice, body):
    LINES[id_] = (voice, body)


# ---------- 1. announcer ----------
for mode, line in [('tdm', 'Team Deathmatch. Eliminate the enemy team.'), ('ffa', 'Free-for-all. Trust no one.'),
                   ('gunfight', 'Gunfight. One life. Same loadout. Win the round.'), ('snd', 'Search and Destroy. Plant the bomb, or stop them.'),
                   ('gungame', 'Gun Game. Every kill, a new weapon.')]:
    add(f'vo/announcer/mode_{mode}', ANNOUNCER, t(line))
add('vo/announcer/mode_infected', ANNOUNCER, 'Infected. Survive<break time="350ms"/> or join them.')
add('vo/announcer/fight', MEDALS, t('Fight!'))
add('vo/announcer/one_minute', ANNOUNCER, t('One minute remaining.'))
add('vo/announcer/lead_taken', ANNOUNCER, t("We've taken the lead."))
add('vo/announcer/lead_lost', ANNOUNCER, t("We've lost the lead."))
add('vo/announcer/victory', ANNOUNCER, t('Victory.'))
add('vo/announcer/defeat', ANNOUNCER, t('Defeat.'))
for id_, line in [('double_kill', 'Double kill!'), ('triple_kill', 'Triple kill!'), ('fury_kill', 'Fury kill!'), ('frenzy_kill', 'Frenzy kill!'),
                  ('killstreak', 'Killstreak!'), ('killing_spree', 'Killing spree!'), ('rampage', 'Rampage!'), ('unstoppable', 'Unstoppable!'),
                  ('legendary', 'Legendary!')]:
    add(f'vo/announcer/{id_}', MEDALS, t(line))
add('vo/announcer/new_weapon', ANNOUNCER, t('New weapon.'))
add('vo/announcer/final_weapon', MEDALS, t('Final weapon.'))
add('vo/announcer/humiliated', MEDALS, t('Humiliated.'))
add('vo/announcer/you_are_infected', ANNOUNCER, 'You are infected.<break time="250ms"/> Kill the survivors.')
add('vo/announcer/infected', ANNOUNCER, t('Infected.'))
add('vo/announcer/last_survivor', ANNOUNCER, "You're the last survivor.<break time=\"250ms\"/> Hold on.")
NUM = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
for i, w in enumerate(NUM, 1):   # round_3_1: one take of round_3 (a bare round_3 would load as take 3 of "round")
    add(f'vo/announcer/round_{i}_1', ANNOUNCER, t(f'Round {w}.'))
for id_, line in [('final_round', 'Final round.'), ('switching_sides', 'Switching sides.'), ('overtime', 'Overtime. Capture the flag.'),
                  ('round_won', 'You won the round.'), ('round_lost', 'You lost the round.'), ('round_draw', 'Round drawn.'), ('bomb_planted', 'Bomb planted.'),
                  ('bomb_defused', 'Bomb defused.'), ('target_destroyed', 'Target destroyed.'), ('team_eliminated', 'Team eliminated.'),
                  ('flag_captured', 'Flag captured.'), ('bomb_dropped', "The bomb's been dropped."), ('you_have_the_bomb', 'You have the bomb.'),
                  ('bomb_picked_up', 'Bomb picked up.')]:
    add(f'vo/announcer/{id_}', ANNOUNCER, t(line))

# ---------- 2. Link light rail ----------
STATIONS = {
    'pioneer': ('Pioneer Square', 'Pioneer Square Station', 'Transfer available to First Hill Streetcar.'),
    'symphony': ('Symphony', 'Symphony Station', None),
    'chinatown': ('International District, Chinatown', 'International District, Chinatown Station',
                  'Transfer available to Sounder Commuter Rail and Amtrak at King Street Station.'),
}
add('vo/link/hold_on', PLATFORM, t('Please hold on.'))
add('vo/link/doors_closing', ONBOARD, 'Please stand clear.<break time="300ms"/> The doors are closing.')
for key, (short, full, transfer) in STATIONS.items():
    add(f'vo/link/this_is_{key}', ONBOARD, f'{t(full)}.')
    for side in ('left', 'right'):
        body = f'Next stop, {t(full if key == "symphony" else short)}.<break time="400ms"/>'
        if transfer:
            body += f'{t(transfer)}<break time="300ms"/>'
        body += t(f'Doors open on the {side}.')
        add(f'vo/link/next_{key}_{side}', ONBOARD, body)
    add(f'vo/link/pa_arriving_{key}', PLATFORM, f'Now arriving: 1 Line to {t(short)}.<break time="400ms"/>Please step back from the edge of the platform.')

# ---------- 3. squad chatter (four voices, a take each) ----------
CHATTER = {
    'reloading': (SQUAD, ['Reloading!', 'Changing mags!', 'Cover me, reloading!', "I'm dry!"]),
    'frag_out': (SQUAD, ['Frag out!', 'Grenade!', 'Frag, frag!', 'Frag out, heads down!']),
    'semtex_out': (SQUAD, ['Semtex out!', 'Sticky out!', 'Semtex!', 'Sticky, sticky!']),
    'knife_out': (SQUAD, ['Knife!', 'Throwing!', 'Knife out!', 'Blade!']),
    'shock_out': (SQUAD, ['Shock stick out!', 'Zapper out!', 'Shock out!', 'Zapping!']),
    'stun_out': (SQUAD, ['Stun out!', 'Flash!', 'Stunning!', 'Stun, stun!']),
    'contact': (SQUAD, ['Contact!', 'Enemy spotted!', 'Got eyes on one!', 'Tango!']),
    'enemy_down': (SQUAD_LOW, ['Enemy down.', 'Got him.', 'Tango down.', 'Scratch one.']),
    'man_down': (SQUAD, ['Man down!', 'We lost one!', 'They got him!', 'Man down, man down!']),
}
for kind, (voices, takes) in CHATTER.items():
    for i, line in enumerate(takes, 1):
        id_ = f'vo/chatter/{kind}_{i}'
        add(id_, OVERRIDE.get(id_, voices[(i - 1) % len(voices)]), t(line).replace('Semtex', SEMTEX))
BANTER_LINES = ['Same as last time. Nobody dies.', 'Check your corners.', 'Anyone else hungry?', "I've got a good feeling about this.",
                'Stay tight, stay quiet.', 'Light them up.', 'Who brought the snacks?', 'Eyes up, people.', "Let's make it quick.", 'Last one back buys.']
for i, line in enumerate(BANTER_LINES, 1):
    add(f'vo/chatter/banter_{i}', OVERRIDE.get(f'vo/chatter/banter_{i}', BANTER[(i - 1) % len(BANTER)]), t(line))


def synth(key, region, voice, body):
    req = urllib.request.Request(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml(voice, body).encode('utf-8'),
                                 headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                                          'X-Microsoft-OutputFormat': FORMAT, 'User-Agent': 'breachpoint-voice'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f'{e.code} {e.read()[:200]!r}')


def trim(path):
    # the service pads every clip with most of a second of silence: cut it to 40 ms at each end (same format)
    import shutil, subprocess
    if not shutil.which('ffmpeg'):
        return
    tmp = path + '.tmp.mp3'
    f = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse'
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', f, '-ar', '24000', '-ac', '1', '-b:a', '48k', tmp])
    if r.returncode == 0 and os.path.getsize(tmp) > 400:
        os.replace(tmp, path)
    elif os.path.exists(tmp):
        os.remove(tmp)


def main():
    key, region = os.environ.get('AZURE_SPEECH_KEY'), os.environ.get('AZURE_SPEECH_REGION', 'westus2')
    if not key:
        sys.exit('set AZURE_SPEECH_KEY')
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force = '--force' in sys.argv
    if '--trim-all' in sys.argv:
        for id_ in LINES:
            p = os.path.join(OUT, id_ + '.mp3')
            if os.path.exists(p):
                trim(p)
    made = 0
    for id_, (voice, body) in LINES.items():
        if only and not id_.startswith(only):
            continue
        path = os.path.join(OUT, id_ + '.mp3')
        if os.path.exists(path) and not force:
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        audio = synth(key, region, voice, body)
        if len(audio) < 800:
            raise RuntimeError(f'{id_}: suspiciously short audio ({len(audio)} bytes)')
        with open(path, 'wb') as f:
            f.write(audio)
        trim(path)
        made += 1
        print(f'{id_}  ({len(audio) // 1024} KB)')
    # the manifest: every recording that exists (generated or added by hand)
    files = sorted(os.path.relpath(os.path.join(d, f), OUT)[:-4].replace(os.sep, '/')
                   for d, _, fs in os.walk(OUT) for f in fs if f.endswith('.mp3'))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'files': files}, f, indent=1)
        f.write('\n')
    print(f'{made} generated, {len(files)} in the manifest')


if __name__ == '__main__':
    main()
