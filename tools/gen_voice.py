#!/usr/bin/env python3
"""Generate every voice line in the game, and check each one by ear (speech-to-text).

    ELEVENLABS_API_KEY=... AZURE_SPEECH_KEY=... [AZURE_SPEECH_REGION=westus2] python3 tools/gen_voice.py
                                                        [--only vo/link] [--force] [--no-verify] [--verify-all]

The announcers and operators are ElevenLabs voices (they act: an acting tag in front of each line, [shouting],
[panicked], [dry]..., sets the delivery and isn't spoken); the Link announcements are Azure's, in the calm,
unhurried Sound Transit style. Azure's speech-to-text checks every clip either way.

Writes assets/audio/<id>.mp3 (24 kHz, 48 kbit/s mono MP3, padding trimmed, long pauses shortened, loudness matched) for each line below
and lists every file that exists in assets/audio/manifest.json, which is what the game loads. Lines that already
have a file are skipped unless --force. Every clip made is transcribed back and re-made (up to three more times)
until the transcript matches the script; --verify-all re-checks the clips already there too. The key is read from
the environment only: never put them in this file.

What there is:
  vo/announcer/<pack>/<id>_<n>   five announcers, each with two or three ways of saying every announcement; the
                                 player picks one in Options (or a random one each match)
  vo/chatter/<voice>/<kind>_<n>  twelve operator voices (six women, six men), three takes of every callout and
                                 five banter lines each; every character keeps one voice for the match
  vo/link/<id>                   the Link light rail announcements ("Please hold on." is a real recording)
"""
import difflib, json, os, re, subprocess, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor
from xml.sax.saxutils import escape

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'audio')
FORMAT = 'audio-24khz-48kbitrate-mono-mp3'


# ---------- voices ----------
# Link: Azure's Dragon HD voices (a voice is its name). Announcers and operators: ElevenLabs voices, el(voice id).
# Azure's natural voices can't act (asked to whisper or shout they measure the same as plain speech), and its
# voices that can sounded synthetic; ElevenLabs' v4 model takes acting tags and speaks at a natural pace.
EL_MODEL = 'eleven_v4'


def el(voice_id, speed=1.06):
    return ('el', voice_id, speed)


def hd(name):
    return f'en-US-{name}:DragonHDLatestNeural'


ONBOARD = hd('Ava')           # Link: on-board announcements
PLATFORM = hd('Andrew')       # Link: platform PA and "please hold on"
SEMTEX = '<phoneme alphabet="ipa" ph="ˈsɛmtɛks">Semtex</phoneme>'


def ssml(name, body):
    return ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" '
            f'xml:lang="en-US"><voice name="{name}">{body}</voice></speak>')


def t(text):
    return escape(text).replace('Semtex', SEMTEX)


TAG = re.compile(r'\[[^\]]*\]\s*')   # an ElevenLabs acting tag: [shouting] (never spoken)


LINES = {}   # id -> (voice, ssml body)
# lines recorded by a person: never generated over, even with --force (the script stays here for reference)
RECORDED = {'vo/link/hold_on'}


def add(id_, voice, body):
    LINES[id_] = (voice, body)


# ---------- 1. announcers ----------
# Every pack says every announcement; takes are picked at random. Grounded and terse, like Black Ops 2: no hype,
# no jokes. Lines heard by both teams (bomb planted, team eliminated, flag captured...) don't take a side.
# round_<n> uses {n}.
NUM = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
ANNOUNCERS = {
    # Control: a calm, clipped mission controller
    'control': (el('pNInz6obpgDQGcFmaJgB'), {       # Adam
        'mode_tdm': ['Team Deathmatch. Eliminate the enemy team.', 'Team Deathmatch. First team to the score limit wins.'],
        'mode_ffa': ['Free-for-all. Every operator is hostile.', 'Free-for-all. Trust no one.'],
        'mode_gunfight': ['Gunfight. One life. Same loadout.', 'Gunfight. Identical loadouts. No respawns.'],
        'mode_snd': ['Search and Destroy. Plant the bomb, or stop them.', 'Search and Destroy. One life per round.'],
        'mode_gungame': ['Gun Game. Every kill, a new weapon.', 'Gun Game. Work through the weapons. The last one wins it.'],
        'mode_infected': ['Infected. Survive, or join them.', 'Infected. Hold out as long as you can.'],
        'fight': ['Go.', 'Begin.', 'Move out.'],
        'one_minute': ['One minute remaining.', 'Sixty seconds.'],
        'lead_taken': ["We've taken the lead.", 'We have the lead.'],
        'lead_lost': ["We've lost the lead.", "They've taken the lead."],
        'victory': ['Mission accomplished.', 'Victory.', 'Good work. Mission complete.'],
        'defeat': ['Mission failed.', 'Defeat.', "Mission failed. We'll regroup."],
        'double_kill': ['Double kill.', 'Two down.'],
        'triple_kill': ['Triple kill.', 'Three down.'],
        'fury_kill': ['Fury kill.', 'Four down. Fury kill.'],
        'frenzy_kill': ['Frenzy kill.', 'Five down. Frenzy kill.'],
        'killstreak': ['Killstreak.', 'Three in a row.'],
        'killing_spree': ['Killing spree.', 'Five in a row.'],
        'rampage': ['Rampage.', 'Ten in a row.'],
        'unstoppable': ['Unstoppable.', 'Fifteen in a row.'],
        'legendary': ['Legendary.', 'Twenty in a row. Legendary.'],
        'new_weapon': ['New weapon.', 'Weapon upgraded.', 'Next weapon.'],
        'final_weapon': ['Final weapon.', 'Final weapon. One more kill.'],
        'humiliated': ['Humiliated.', 'Humiliation.'],
        'you_are_infected': ['You are infected. Kill the survivors.', "You've turned. Hunt the survivors."],
        'infected': ['Infected.', 'Another one has turned.'],
        'last_survivor': ["You're the last survivor.", 'Last survivor. Hold on.'],
        'round': ['Round {n}.', 'Round {n}. Stand by.'],
        'final_round': ['Final round.', 'Final round. This decides it.'],
        'match_point': ['Match point.', 'Match point. One round to go.'],
        'switching_sides': ['Switching sides.', 'Halftime. Switching sides.'],
        'overtime': ['Overtime. Capture the flag.', 'Overtime. Take the flag.'],
        'round_won': ['You won the round.', 'The round is ours.'],
        'round_lost': ['You lost the round.', 'Round lost.'],
        'round_draw': ['Round drawn.', 'Draw.'],
        'bomb_planted': ['Bomb planted.', 'The bomb has been planted.'],
        'bomb_defused': ['Bomb defused.', 'The bomb has been defused.'],
        'target_destroyed': ['Target destroyed.', 'Detonation confirmed. Target destroyed.'],
        'team_eliminated': ['Team eliminated.', 'Last operator down. Team eliminated.'],
        'flag_captured': ['Flag captured.', 'The flag has been captured.'],
        'bomb_dropped': ['Bomb dropped.', "The bomb's been dropped. Recover it."],
        'you_have_the_bomb': ['You have the bomb.', "You're carrying the bomb."],
        'bomb_picked_up': ['Bomb picked up.', 'We have the bomb.'],
    }),
    # Sable: a cool, clipped British intelligence officer
    'sable': (el('pFZP5JQG7iQjIQuC4Bku'), {         # Lily
        'mode_tdm': ['Team Deathmatch. Take them all down.', 'Team Deathmatch. Their team, our team. Make it count.'],
        'mode_ffa': ['Free-for-all. No allies out there.', 'Free-for-all. Everyone is a target.'],
        'mode_gunfight': ['Gunfight. Same kit, one life. No excuses.', 'Gunfight. Everyone gets the same weapons. Prove yourself.'],
        'mode_snd': ["Search and Destroy. One life. Don't waste it.", 'Search and Destroy. Plant it, or defuse it.'],
        'mode_gungame': ['Gun Game. A new weapon with every kill.', 'Gun Game. Kill, upgrade, repeat.'],
        'mode_infected': ['Infected. Keep moving. Stay alive.', "Infected. Someone's already turned. Don't be next."],
        'fight': ['Go.', 'Move.', 'Weapons free.'],
        'one_minute': ['One minute left. Make it count.', 'One minute.'],
        'lead_taken': ["We're ahead. Keep it that way.", "We've taken the lead."],
        'lead_lost': ["We've lost the lead. Push.", "They're ahead. Sort it out."],
        'victory': ['Victory. Well done.', 'Job done. Victory.', 'Victory. Clean work.'],
        'defeat': ['Defeat. Regroup.', "Defeat. We'll have them next time.", "We've lost. Fall back."],
        'double_kill': ['Double kill.', 'Two at once. Nice.'],
        'triple_kill': ['Triple kill.', 'Three. Impressive.'],
        'fury_kill': ['Fury kill.', 'Fury kill. Keep going.'],
        'frenzy_kill': ['Frenzy kill.', 'Frenzy kill. Outstanding.'],
        'killstreak': ['Killstreak.', 'Three without a scratch.'],
        'killing_spree': ['Killing spree.', "Five. They can't touch you."],
        'rampage': ['Rampage.', 'Ten in a row. Rampage.'],
        'unstoppable': ['Unstoppable.', 'Fifteen. Unstoppable.'],
        'legendary': ['Legendary.', 'Twenty. Legendary.'],
        'new_weapon': ['New weapon.', 'Upgrade.', 'Next weapon.'],
        'final_weapon': ['Final weapon. Finish it.', 'Last weapon.'],
        'humiliated': ['Humiliated.', 'Humiliated. Unfortunate.'],
        'you_are_infected': ["You're infected. Hunt them down.", "You've turned. Find the survivors."],
        'infected': ['Infected.', "Another one's turned."],
        'last_survivor': ["You're the last one left. Stay alive.", 'Last survivor. Everything rests on you.'],
        'round': ['Round {n}.', 'Round {n}. Focus.'],
        'final_round': ['Final round.', 'Final round. Everything on this one.'],
        'match_point': ['Match point.', 'Match point. Close it out.'],
        'switching_sides': ['Switching sides.', 'Halftime. Swap sides.'],
        'overtime': ['Overtime. Take the flag.', 'Overtime. Whoever takes the flag wins.'],
        'round_won': ['We take the round.', "That round's ours.", 'You won the round.'],
        'round_lost': ['Round lost.', 'We lost that one. Next.', 'You lost the round.'],
        'round_draw': ['Round drawn.', "It's a draw."],
        'bomb_planted': ['The bomb is planted.', "Bomb's down. Clock's running."],
        'bomb_defused': ['Bomb defused.', "The bomb's been defused."],
        'target_destroyed': ['Target destroyed.', 'Detonation. Target destroyed.'],
        'team_eliminated': ['Team eliminated.', "That's the whole team. Eliminated."],
        'flag_captured': ['Flag captured.', "The flag's been taken."],
        'bomb_dropped': ["The bomb's down. Recover it.", "Bomb's been dropped."],
        'you_have_the_bomb': ["You've got the bomb. Don't lose it.", 'You have the bomb.'],
        'bomb_picked_up': ['Bomb picked up.', "We've got the bomb back."],
    }),
    # Ghost: a gruff veteran sergeant
    'ghost': (el('Bj9UqZbhQsanLzgalpEG'), {         # Austin Knox
        'mode_tdm': ['Team Deathmatch. Put them down.', 'Team Deathmatch. Stay with your squad and drop every one of them.'],
        'mode_ffa': ['Free-for-all. Every soldier for themselves.', "Free-for-all. Nobody's got your back out here."],
        'mode_gunfight': ['Gunfight. One life. Same rifle as the other guy. Earn it.', 'Gunfight. No second chances.'],
        'mode_snd': ['Search and Destroy. You die, you stay dead.', 'Search and Destroy. Plant it, or stop it.'],
        'mode_gungame': ['Gun Game. Every kill, new iron.', 'Gun Game. Work your way up.'],
        'mode_infected': ['Infected. Dig in. Stay alive.', "Infected. They're coming. Don't let them in."],
        'fight': ['Move, move, move!', 'Go, go, go!', 'Move out!'],
        'one_minute': ['One minute left. Pick up the pace.', 'Sixty seconds. Move it.'],
        'lead_taken': ["We've got the lead. Keep it.", "We're out in front. Don't let up."],
        'lead_lost': ["We've lost the lead. Get it back.", "They're ahead. Fix it."],
        'victory': ['Victory. Good work, soldiers.', "That's how it's done. Victory.", 'Victory. Outstanding.'],
        'defeat': ['Defeat. Get up and do it again.', 'Defeat. Back to training.', 'Defeat. Regroup.'],
        'double_kill': ['Double kill.', 'Double kill. Good.'],
        'triple_kill': ['Triple kill.', 'Triple kill. Keep firing.'],
        'fury_kill': ['Fury kill.', "Fury kill. Now that's aggression."],
        'frenzy_kill': ['Frenzy kill.', 'Frenzy kill. Outstanding.'],
        'killstreak': ['Killstreak.', 'Three down. Keep it going.'],
        'killing_spree': ['Killing spree.', 'Killing spree. Keep it rolling.'],
        'rampage': ['Rampage.', 'Rampage. Nobody can touch you.'],
        'unstoppable': ['Unstoppable.', 'Unstoppable. Hell of a job.'],
        'legendary': ['Legendary.', "Legendary. Never seen anything like it."],
        'new_weapon': ['New weapon.', 'Fresh iron.', 'Next weapon.'],
        'final_weapon': ['Final weapon. Finish the job.', 'Last weapon. Bring it home.'],
        'humiliated': ['Humiliated. Get your head in the game.', 'Humiliated.'],
        'you_are_infected': ["You're infected. Hunt down every survivor.", "You've turned. Go get them."],
        'infected': ['Infected.', 'We lost another one.'],
        'last_survivor': ["You're the last one standing. Hold the line.", "Last survivor. Don't you quit on me."],
        'round': ['Round {n}.', 'Round {n}. Lock and load.'],
        'final_round': ['Final round. Leave it all out there.', 'Final round.'],
        'match_point': ['Match point. Close it out.', 'Match point.'],
        'switching_sides': ['Switching sides.', 'Halftime. Switch it up.'],
        'overtime': ['Overtime. Take that flag.', 'Overtime. Capture the flag and end this.'],
        'round_won': ['We take the round. Good work.', 'You won the round. Outstanding.'],
        'round_lost': ['Round lost. Shake it off.', 'You lost the round. Get it back.'],
        'round_draw': ['Round drawn.', "It's a draw. Nobody wins."],
        'bomb_planted': ['Bomb planted.', 'The bomb is planted.'],
        'bomb_defused': ['Bomb defused.', 'That bomb is defused.'],
        'target_destroyed': ['Target destroyed.', "Target's gone."],
        'team_eliminated': ['Team eliminated.', 'That whole team is down.'],
        'flag_captured': ['Flag captured.', 'The flag is taken.'],
        'bomb_dropped': ["The bomb's been dropped. Get it back.", "Bomb's down. Somebody grab it."],
        'you_have_the_bomb': ["You've got the bomb. Move.", 'You have the bomb. Get to a site.'],
        'bomb_picked_up': ['Bomb picked up.', "We've got the bomb again."],
    }),
    # Warden: an older commanding officer, measured and grave
    'warden': (el('pqHfZKP75CvOlQylNhV4'), {        # Bill
        'mode_tdm': ['Team Deathmatch. Eliminate the opposing force.', 'Team Deathmatch. Hold together, and win this.'],
        'mode_ffa': ['Free-for-all. There are no allies in this one.', 'Free-for-all. Everyone for themselves.'],
        'mode_gunfight': ['Gunfight. Equal arms, one life apiece.', 'Gunfight. Same weapons on both sides. Skill decides.'],
        'mode_snd': ['Search and Destroy. Each life counts. Each round counts.', 'Search and Destroy. Deliver the charge, or deny it.'],
        'mode_gungame': ['Gun Game. Each kill earns a new weapon.', 'Gun Game. Advance through the arsenal.'],
        'mode_infected': ['Infected. Survive by any means.', 'Infected. Hold your ground as long as you can.'],
        'fight': ['Begin.', 'Proceed.', 'Engage.'],
        'one_minute': ['One minute remains.', 'One minute. Finish this.'],
        'lead_taken': ['We hold the lead.', 'We have the advantage.'],
        'lead_lost': ['We have lost the lead.', 'The enemy has the advantage.'],
        'victory': ['Victory. Well fought.', 'The day is ours.', 'Victory. A fine effort.'],
        'defeat': ['Defeat.', 'Defeat. We withdraw and regroup.', 'The day is theirs. Defeat.'],
        'double_kill': ['Double kill.', 'Double kill. Well done.'],
        'triple_kill': ['Triple kill.', 'Triple kill. Excellent.'],
        'fury_kill': ['Fury kill.', 'Fury kill. Remarkable.'],
        'frenzy_kill': ['Frenzy kill.', 'Frenzy kill. Extraordinary.'],
        'killstreak': ['Killstreak.', 'Three without falling.'],
        'killing_spree': ['Killing spree.', 'Killing spree. Keep pressing.'],
        'rampage': ['Rampage.', 'Rampage. They cannot stop you.'],
        'unstoppable': ['Unstoppable.', 'Unstoppable. Fifteen in a row.'],
        'legendary': ['Legendary.', 'Legendary. Twenty without falling.'],
        'new_weapon': ['New weapon.', 'Weapon issued.', 'Next weapon.'],
        'final_weapon': ['Final weapon.', 'The final weapon. One more.'],
        'humiliated': ['Humiliated.', 'A humiliating loss.'],
        'you_are_infected': ['You are infected. Hunt the survivors.', 'You have turned. Find the survivors.'],
        'infected': ['Infected.', 'Another has turned.'],
        'last_survivor': ['You are the last survivor. Endure.', 'Last survivor. Hold on.'],
        'round': ['Round {n}.', 'Round {n}. Begin.'],
        'final_round': ['Final round.', 'The final round. Make it count.'],
        'match_point': ['Match point.', 'Match point. One round remains.'],
        'switching_sides': ['Switching sides.', 'Halftime. Change sides.'],
        'overtime': ['Overtime. Capture the flag.', 'Overtime. The flag decides it.'],
        'round_won': ['You won the round.', 'The round is ours.'],
        'round_lost': ['You lost the round.', 'The round is theirs.'],
        'round_draw': ['Round drawn.', 'A drawn round.'],
        'bomb_planted': ['The bomb has been planted.', 'Bomb planted.'],
        'bomb_defused': ['The bomb has been defused.', 'Bomb defused.'],
        'target_destroyed': ['Target destroyed.', 'The target has been destroyed.'],
        'team_eliminated': ['Team eliminated.', 'A team has been eliminated.'],
        'flag_captured': ['Flag captured.', 'The flag has been taken.'],
        'bomb_dropped': ['The bomb has been dropped.', 'Bomb dropped. Recover it.'],
        'you_have_the_bomb': ['You have the bomb.', 'You carry the bomb. Get it to a site.'],
        'bomb_picked_up': ['Bomb recovered.', 'We have the bomb.'],
    }),
    # Echo: a crisp tactical radio operator
    'echo': (el('XrExE9yKIg1WjnnlVkGX'), {          # Matilda
        'mode_tdm': ['Team Deathmatch. Engage and eliminate.', 'Team Deathmatch. First team to the limit wins.'],
        'mode_ffa': ['Free-for-all. All contacts hostile.', 'Free-for-all. No friendlies on the field.'],
        'mode_gunfight': ['Gunfight. One life, matched loadouts.', 'Gunfight. Same gear on both sides. Good luck.'],
        'mode_snd': ['Search and Destroy. Plant the bomb, or prevent it.', 'Search and Destroy. One life per round. Be advised.'],
        'mode_gungame': ['Gun Game. Each kill, new weapon.', 'Gun Game. Climb the list. The last weapon wins.'],
        'mode_infected': ['Infected. Survivors, stay together.', 'Infected. Do not get caught.'],
        'fight': ['Go, go.', 'Weapons free.', 'Engage.'],
        'one_minute': ['One minute remaining.', 'Be advised. One minute.'],
        'lead_taken': ["We've taken the lead.", 'The lead is ours.'],
        'lead_lost': ["We've lost the lead.", 'The enemy has the lead.'],
        'victory': ['Victory. Nice work, everyone.', 'Victory confirmed.', 'Mission success.'],
        'defeat': ['Defeat.', 'Mission failed.', 'Defeat. Regroup.'],
        'double_kill': ['Double kill.', 'Double kill confirmed.'],
        'triple_kill': ['Triple kill.', 'Triple kill confirmed.'],
        'fury_kill': ['Fury kill.', 'Fury kill. Nice.'],
        'frenzy_kill': ['Frenzy kill.', 'Frenzy kill. Incredible.'],
        'killstreak': ['Killstreak.', 'Three confirmed. Killstreak.'],
        'killing_spree': ['Killing spree.', 'Five confirmed. Killing spree.'],
        'rampage': ['Rampage.', 'Ten confirmed. Rampage.'],
        'unstoppable': ['Unstoppable.', 'Fifteen confirmed. Unstoppable.'],
        'legendary': ['Legendary.', 'Twenty confirmed. Legendary.'],
        'new_weapon': ['New weapon.', 'New weapon issued.', 'Next weapon.'],
        'final_weapon': ['Final weapon.', 'Final weapon. One to go.'],
        'humiliated': ['Humiliated.', 'Humiliated. Ouch.'],
        'you_are_infected': ["You're infected. Find the survivors.", "You've turned. Hunt them down."],
        'infected': ['Infected.', 'Another one infected.'],
        'last_survivor': ["You're the last survivor.", 'Last survivor. Hang on.'],
        'round': ['Round {n}.', 'Round {n}. Ready up.'],
        'final_round': ['Final round.', 'Final round. Make it count.'],
        'match_point': ['Match point.', 'Match point. Be advised.'],
        'switching_sides': ['Switching sides.', 'Halftime. Switching sides.'],
        'overtime': ['Overtime. Capture the flag.', 'Overtime. The flag decides the round.'],
        'round_won': ['You won the round.', 'The round is ours.'],
        'round_lost': ['You lost the round.', 'Round lost.'],
        'round_draw': ['Round drawn.', 'Draw.'],
        'bomb_planted': ['Bomb planted.', 'Be advised, bomb planted.'],
        'bomb_defused': ['Bomb defused.', 'The bomb has been defused.'],
        'target_destroyed': ['Target destroyed.', 'Target destroyed. Detonation confirmed.'],
        'team_eliminated': ['Team eliminated.', 'Team eliminated. Round over.'],
        'flag_captured': ['Flag captured.', 'The flag has been captured.'],
        'bomb_dropped': ['Bomb dropped.', 'The bomb is down. Recover it.'],
        'you_have_the_bomb': ['You have the bomb.', "You've got the bomb. Get it to a site."],
        'bomb_picked_up': ['Bomb picked up.', 'Bomb recovered.'],
    }),
}
# how each one talks, and the mood of the moment (a line that starts with its own [tag] keeps it)
MANNER = {'control': '[calm, measured]', 'sable': '[cool, clipped]', 'ghost': '[gruff, barking]',
          'warden': '[authoritative, grave]', 'echo': '[crisp radio operator]'}
MEDALS = {'double_kill', 'triple_kill', 'fury_kill', 'frenzy_kill', 'killstreak', 'killing_spree', 'rampage', 'unstoppable', 'legendary'}
MOOD = {'victory': '[satisfied]', 'defeat': '[grim]', 'lead_lost': '[urgent]', 'round_lost': '[grim]', 'one_minute': '[urgent]',
        'last_survivor': '[tense]', 'bomb_planted': '[tense]', 'you_are_infected': '[cold]', 'mode_infected': '[ominous]', 'final_round': '[intense]',
        'match_point': '[intense]', 'overtime': '[intense]', **{m: '[approving]' for m in MEDALS}}


def act(pack, id_, line):
    mood = MOOD.get(id_, '')
    return line if line.startswith('[') else f'{MANNER[pack]} {mood} {line}'.replace('  ', ' ')


for pack, (voice, lines) in ANNOUNCERS.items():
    for id_, takes in lines.items():
        if id_ == 'round':   # round_3_1, round_3_2: takes of round_3 (and never of a bare "round")
            for i, w in enumerate(NUM, 1):
                for k, line in enumerate(takes, 1):
                    add(f'vo/announcer/{pack}/round_{i}_{k}', voice, act(pack, id_, line.format(n=w)))
            continue
        for k, line in enumerate(takes, 1):
            add(f'vo/announcer/{pack}/{id_}_{k}', voice, act(pack, id_, line))

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

# ---------- 3. operators: callouts and banter ----------
# The order matters: js/game.js gives each character one of these by its name (VOICES there lists the same keys).
# A line is plain text with an acting tag in front.
SQUAD = {   # (ElevenLabs voice, how fast they talk)
    'sarah': el('EXAVITQu4vr4xnSDxMaL'), 'harry': el('SOYHLrjzK2X1ezoPC6cr'), 'laura': el('FGY2WhTYpPnrIDTdsKH5'),
    'liam': el('TX3LPaxmHKxFdv7VOQHJ'), 'allison': el('xctasy8XvGp2cVO9HL9k'), 'charlie': el('IKne3meq5aSn9XLyUdCD'),
    'piper': el('DtsPFCrhbCbbJkwZsb3d'), 'callum': el('N2lVS1w4EtoT3dr4eOWO'), 'hope': el('uYXf8XasLslADfZ2MB4u'),
    'aiden': el('4zVVKJJRwoOAAeUwtCQ1'), 'samantha': el('KTbNvEb5YONPDyllJN8N'), 'chris': el('iP95p4xoKVk53GoZ742B'),
    'brian': el('nPczCjzI2devNBz1zQrb'), 'roger': el('CwhRBWXzGAHq8TQ4Fs17'), 'eric': el('cjVigY5qzO86Huf0OWal'),
    'daniel': el('onwK4e9ZLuTAKqWW03F9'), 'mark': el('UgBBYS2sOqTuMpoF3BR0'), 'harrison': el('Xy9y0JxjEv2IW22iF26U'),
}
KIND = {'reloading': '[urgent]', 'frag_out': '[shouting]', 'semtex_out': '[shouting]', 'knife_out': '[sharp]', 'shock_out': '[shouting]',
        'stun_out': '[shouting]', 'contact': '[alert, sharp]', 'enemy_down': '[calm, clipped]', 'man_down': '[urgent, shaken]',
        'hit': '[in pain, strained]', 'planting': '[urgent]', 'defusing': '[tense, focused]', 'last_alive': '[quiet, steady]',
        'grenade': '[alarmed, shouting]'}
CHATTER = {   # terse, the way a squad talks in a firefight. Each voice gets three of each pool, from a different place
    'reloading': ['Reloading!', 'Changing mags!', "I'm dry!", 'Reloading, cover me!', 'Mag out!', 'Cover me!', 'Out of ammo!',
                  'Swapping mags!', 'Reloading now!', 'Reloading, hold them!', 'Need a second, reloading!', 'Last mag!'],
    'frag_out': ['Frag out!', 'Grenade out!', 'Frag out, get down!', 'Fire in the hole!', 'Throwing frag!', 'Frag out, frag out!',
                 'Grenade!', 'Frag, clear!', 'Fire in the hole, move!', 'Frag going in!', 'Grenade out, heads down!', 'Throwing grenade!'],
    'semtex_out': ['Semtex out!', 'Sticky out!', 'Throwing sticky!', 'Semtex, get clear!', 'Sticky grenade!', 'Semtex going in!',
                   'Sticky out, move!', 'Throwing Semtex!', 'Semtex!', 'Sticky going in!', 'Semtex thrown!', 'Sticky, clear!'],
    'knife_out': ['Knife!', 'Throwing knife!', 'Knife out!', 'Blade out!', 'Knife thrown!', 'Throwing!', 'Knife going in!', 'Blade!',
                  'Throwing blade!', 'Knife, heads up!', 'Knife away!', 'Blade thrown!'],
    'shock_out': ['Shock stick out!', 'Shock stick!', 'Throwing shock stick!', 'Shock stick going in!', 'Shock out!', 'Shock stick, clear!',
                  'Shock stick thrown!', 'Shock stick, heads up!', 'Throwing shock!', 'Shock, shock!', 'Shock stick away!', 'Shock going in!'],
    'stun_out': ['Stun out!', 'Flash out!', 'Flashbang!', 'Stun grenade!', 'Flash out, eyes!', 'Stun going in!', 'Flashing!', 'Stun, stun!',
                 'Flashbang out!', 'Throwing stun!', 'Throwing flash!', 'Stun grenade out!'],
    'contact': ['Contact!', 'Enemy spotted!', 'Eyes on!', 'Contact front!', 'Hostile spotted!', 'Enemy, right there!', 'I see one!',
                'Tango spotted!', 'Contact, contact!', 'Got movement!', 'Enemy!', 'Hostile!'],
    'enemy_down': ['Enemy down.', 'Got one.', 'Tango down.', 'Scratch one.', 'Target down.', "They're down.", 'Kill confirmed.',
                   "That's one.", 'Hostile down.', 'Down.', 'Enemy neutralized.', 'Got them.'],
    'man_down': ['Man down!', 'We lost one!', 'They got one of ours!', 'Operator down!', 'Friendly down!', "We've got one down!",
                 'Teammate down!', 'Lost one!', "We're one short!", 'Man down, man down!', 'Squadmate down!', "They're picking us off!"],
    'hit': ["I'm hit!", 'Taking fire!', "I'm hit, I'm hit!", 'Taking heavy fire!', "I'm hurt!", 'Under fire!', "I'm wounded!",
            'Need cover!', "They've got me pinned!", 'Hit! I need cover!', "I'm bleeding!", 'Taking hits!'],
    'planting': ['Planting the bomb!', 'Planting, cover me!', 'Setting the charge!', 'Planting!', 'Arming the bomb!',
                 'Bomb going down, cover me!', 'Planting now!', 'Charge going down!', 'Cover me, planting!', 'Setting it up!',
                 'Planting, watch my back!', 'Arming it now!'],
    'defusing': ['Defusing!', 'Defusing, cover me!', "I'm on the bomb!", 'Defusing now!', 'Cover me, defusing!', 'Working on it!',
                 'Disarming!', 'On the bomb, cover me!', 'Defusing, watch my back!', 'Disarming the bomb!', 'Keep them off me!', 'Defusing the bomb!'],
    'last_alive': ["It's just me.", "I'm the last one.", "I'm alone out here.", 'Last one standing.', "It's on me now.", "I'm all that's left.",
                   'Just me left.', 'On my own now.', "I'm the last.", 'All on me.', 'Nobody left but me.', 'Just me. Alright.'],
    'grenade': ['Grenade!', 'Grenade! Move!', 'Grenade, get clear!', 'Incoming grenade!', 'Frag! Move!', 'Grenade! Get back!',
                'Grenade at my feet!', 'Move, grenade!', 'Grenade, grenade!', 'Get clear!', 'Frag on the ground!', 'Incoming!'],
}
# banter: dry, deadpan, played completely straight (Airplane!, not a sitcom); five per voice
BANTER = ['[deadpan] The enemy has us surrounded. Good. Now we can shoot in any direction.',
          '[completely serious] Remember, if you get shot, try not to.',
          "[deadpan] I've been in worse situations. I just can't remember any.",
          '[completely serious] Stay calm. Panicking is for after the match.',
          '[deadpan] Intel says the enemy is heavily armed. I asked with what. They said guns.',
          "[completely serious] Whatever happens out there, don't get killed. It's very bad for morale.",
          '[deadpan] My doctor told me to avoid stress. So I joined this unit.',
          '[completely serious] If anyone asks, this was always the plan.',
          "[deadpan] The good news is, we have a plan. The bad news is, it's this one.",
          "[completely serious] Check your gear. Check your ammo. Check your shoelaces. That last one's important.",
          "[deadpan] I'm not saying we're outnumbered. I'm saying there's more of them.",
          "[completely serious] Keep your head down. You'll want it later.",
          '[deadpan] Last time I was this nervous, I was also here.',
          "[completely serious] Command says this will be easy. Command also said that last time.",
          "[deadpan] What's our exit strategy? Winning. That's the whole strategy.",
          '[completely serious] Nobody move. Except toward the enemy. Then shoot.',
          "[deadpan] I packed a lunch. In case we're out here for a while.",
          '[completely serious] I want a clean, professional operation. And afterwards, pie.',
          "[deadpan] I've trained my whole life for this. Well, since Tuesday.",
          "[completely serious] Remember your training. If you don't, remember mine.",
          "[deadpan] The map says we're here. I'm choosing to believe it.",
          "[completely serious] Don't worry. I've done this hundreds of times. In my head.",
          "[deadpan] They say the enemy can smell fear. So I've switched deodorant.",
          '[completely serious] If I go down, take my rifle. And my parking spot.',
          "[deadpan] I asked for backup. They sent you. So that's where we are.",
          "[completely serious] Stay sharp. And if you can't stay sharp, stay behind me.",
          "[deadpan] Funny thing about plans. They never survive me.",
          '[completely serious] We do this by the book. Has anyone actually read the book?',
          "[deadpan] Statistically, one of us is going to do something brave. My money's not on me.",
          "[completely serious] This is not a drill. Unless it's a drill. Nobody tells me anything.",
          "[deadpan] I'm not superstitious. But nobody say the word easy.",
          "[completely serious] Think of the enemy as a target. Because they are.",
          "[deadpan] For the record, I'm wearing my lucky socks. Both of them.",
          '[completely serious] Ammo check. Everybody have ammo? Good. Use it on them, not me.',
          '[deadpan] I had a dream about this match. In it, I was taller.',
          '[completely serious] Shoot first. Ask questions never. Questions slow you down.',
          "[deadpan] Relax. We've got them right where they want us.",
          "[completely serious] Whatever you do, don't look down. Also don't look up. Just look forward.",
          "[deadpan] My grandmother could clear that room. She's very fast.",
          '[completely serious] If this goes wrong, I was never here. Neither were you.',
          "[deadpan] Don't worry, I've got a backup plan. It's the first plan, but louder.",
          "[completely serious] Keep comms clear. Unless it's important. Or funny.",
          '[deadpan] The last squad that tried this got a medal. A small one. Mostly for showing up.',
          '[completely serious] We go in quiet. We come out quiet. In between, very loud.',
          "[deadpan] I'd like to thank my rifle. It's been there for me.",
          '[completely serious] Move fast, stay low, and if anyone offers you coffee, decline.',
          '[deadpan] Somebody said this would be a walk in the park. The park has guns.',
          "[completely serious] Ready? Good. Neither am I. Let's go.",
          '[deadpan] I read the briefing. It was mostly about snacks.',
          '[completely serious] Eyes open. Mouth shut. Trigger finger, use your judgment.',
          "[deadpan] I'm feeling good about this. That worries me.",
          "[completely serious] Nobody panic. I'll let you know when to panic.",
          "[deadpan] If we win, drinks are on me. If we lose, drinks are on the floor.",
          "[completely serious] The enemy is expecting us. So let's be early.",
          "[deadpan] They told me there'd be a briefing. This is it. Good luck.",
          '[completely serious] Check your corners. All of them. Even the round ones.',
          "[deadpan] I had a bad feeling about this. I had one about breakfast too, and that was fine.",
          "[completely serious] Let's make this quick. I left the oven on.",
          "[deadpan] I'm told the enemy is very dangerous. I'm told that about everybody.",
          "[completely serious] When this is over, nobody talk about what happened. Mostly what I did.",
          "[deadpan] I've seen the enemy's plan. It's a lot like ours, but it works.",
          "[completely serious] Stay together. If we get separated, stay together separately.",
          "[deadpan] They gave me one job. I'm still looking for it.",
          '[completely serious] Watch for snipers. If you see one, he has already seen you. Wave.',
          "[deadpan] I was told there would be a chair.",
          "[completely serious] We have the element of surprise. Mainly because nobody told us either.",
          "[deadpan] I'd say I've got your back, but I've seen your aim.",
          '[completely serious] Follow my lead. I will be following yours.',
          "[deadpan] Good news. I found the objective. Bad news. It's the other way.",
          "[completely serious] If you hear a loud bang, that's probably important.",
          "[deadpan] My mother wanted me to be a dentist. I'm still not sure she was wrong.",
          '[completely serious] This is a two person job. We have five. So it should be fine.',
          "[deadpan] Last week I was on vacation. This is nothing like that.",
          '[completely serious] Do not, under any circumstances, do what I would do.',
          "[deadpan] I've got a feeling we're going to win. I've had that feeling every time.",
          "[completely serious] Keep moving. A moving target is harder to hit. Or so I'm told.",
          "[deadpan] The radio says it's going to be a nice day. The radio is not here.",
          '[completely serious] Fan out. Not that far. Come back a little.',
          "[deadpan] I didn't sign up for this. I signed up for the dental plan.",
          "[completely serious] Remember, we're professionals. Act like it until somebody shoots.",
          "[deadpan] I counted the enemy. Then I stopped counting.",
          '[completely serious] Somebody grab the door. Not literally. Okay, literally.',
          "[deadpan] We've been through a lot together. Mostly this map.",
          "[completely serious] Command wants this done quickly, quietly, and on budget. Pick one.",
          "[deadpan] I'm not lost. I'm exploring with a rifle.",
          '[completely serious] Stack up on the door. Not on me. On the door.',
          "[deadpan] I asked for a raise. They gave me this.",
          "[completely serious] If it moves, it's the enemy. If it doesn't move, check again.",
          "[deadpan] Somewhere, someone is having a quiet day. Good for them.",
          "[completely serious] Alright. Let's go to work. Try to look like you meant it."]
for v, (name, voice) in enumerate(SQUAD.items()):
    for kind, pool in CHATTER.items():
        for k in range(3):
            add(f'vo/chatter/{name}/{kind}_{k + 1}', voice, f'{KIND[kind]} {pool[(v * 3 + k) % len(pool)]}')
    for k in range(5):
        add(f'vo/chatter/{name}/banter_{k + 1}', voice, BANTER[v * 5 + k])

# explicit language (Options > Audio, or chosen when the account is made): the same moments with the swearing a
# squad actually does under fire. Profane, never hateful: no slurs, nothing aimed at who anyone is.
# x_<kind> takes play in place of the clean ones about half the time when it's on.
CHATTER_X = {
    'reloading': ['Reloading, shit!', "Fuck, I'm dry!", 'Changing mags, cover my ass!', "Shit, I'm empty!", 'Reloading, God damn it!',
                  'Out of fucking ammo!', 'Mag out, cover me, damn it!', 'Shit, reloading!', "I'm dry, fuck!", "Hold them off, I'm fucking reloading!",
                  'Empty! Shit!', 'Reloading, hold the damn line!'],
    'contact': ['Contact, shit!', 'Fuck, contact!', 'Enemy, right fucking there!', "Shit, they're here!", 'Contact front, God damn it!',
                'Right there, shit!', 'Fuck, I see one!', 'Hostile, shit, hostile!', 'Contact! Son of a bitch!', "There's one, fuck!",
                'Shit, eyes on!', 'Damn it, contact!'],
    'enemy_down': ['Got the bastard.', 'Fucker is down.', 'Scratch that son of a bitch.', 'Down, and stay down.', 'Hell yeah, got one.',
                   'Eat that.', "That one's fucked.", 'Down. Damn right.', 'Bye, asshole.', 'Enemy down, fuck yeah.', 'Stay down, prick.',
                   'Got you, you bastard.'],
    'man_down': ['Shit, man down!', 'Fuck, we lost one!', 'God damn it, they got one of ours!', 'Man down, shit!', "Son of a bitch, we're one short!",
                 'Fuck! Friendly down!', 'Damn it, man down!', "They're picking us off, shit!", 'Shit, shit, man down!', 'Bastards got one of ours!',
                 'God damn it, operator down!', 'Fuck, teammate down!'],
    'hit': ["Fuck, I'm hit!", "Shit, I'm hit!", 'Ah, God damn it!', "Son of a bitch, I'm hit!", 'Fuck, that hurt!', 'Shit, taking fire!',
            'Fuck! Need cover!', "Damn it, I'm hit!", "Shit, shit, I'm hit!", 'Bastards hit me!', "Fuck, I'm bleeding!", 'God damn it, taking hits!'],
    'grenade': ['Grenade! Shit!', 'Fuck, grenade!', 'Shit, get clear!', 'Grenade, fuck, move!', 'Oh shit, grenade!', 'Fuck! Frag!',
                'Move, God damn it, grenade!', 'Shit! Incoming!', 'Grenade, fucking move!', 'Oh fuck, grenade!', 'Get back, shit!', 'Frag at my feet, fuck!'],
    'last_alive': ["Well, shit. It's just me.", "Fuck. I'm the last one.", 'Great. Just me. Fantastic.', 'Shit. All on me now.', 'Just me left. Fuck it.',
                   "Damn it. I'm alone.", 'Well, fuck. Last one standing.', "Of course it's me. Shit.", 'Alright. Just me. Hell.', 'Fuck. Nobody left but me.',
                   'Last one. God damn it.', "It's on me. Shit."],
    'frag_out': ['Frag out, eat this!', 'Fire in the hole, motherfuckers!', 'Frag out, fuck you!', 'Grenade out, get some!', 'Eat this, frag out!',
                 'Frag out, shit, get down!', 'Fire in the hole, damn it!', 'Catch, assholes!', 'Frag out! Suck on that!', 'Grenade out, eat it!',
                 'Frag going in, fuckers!', 'Catch this, frag out!'],
}
BANTER_X = ["[deadpan] I was told this would be a shit show. I was not told I'd be running it.",
            "[completely serious] Whatever happens, don't fuck it up. That's the whole briefing.",
            '[deadpan] My therapist said I should swear less. My therapist has never been here.',
            '[completely serious] Stay frosty. Or at least be less shit than last time.',
            "[deadpan] The plan is simple. Go in, shoot the bad guys, don't get fucking shot.",
            "[completely serious] If you die, I'm keeping your shit.",
            '[deadpan] Well. This is a hell of a way to spend a Tuesday.',
            '[completely serious] Nobody panic. Panic later. On your own damn time.',
            "[deadpan] I didn't get out of bed for this shit. Actually, I did.",
            '[completely serious] We are going to kick their ass. Politely. Then very rudely.',
            '[deadpan] Command says morale is high. Command can kiss my ass.',
            "[completely serious] Check your corners. Last guy didn't. He's a fucking statistic now.",
            "[deadpan] I've got a bad feeling about this. I've also got a gun, so, fuck it.",
            '[completely serious] Remember your training. Or just shoot the bastards. Either works.',
            '[deadpan] Hell of a day for it.',
            '[completely serious] If anyone asks, this was always the fucking plan.',
            "[deadpan] I'm not saying we're screwed. I'm saying I've stopped counting.",
            "[completely serious] Rule one. Don't shoot me. Rule two. See rule one, damn it.",
            '[deadpan] They gave us the shit map again. Lovely.',
            '[completely serious] Keep your head down and your mouth shut. Mostly the damn mouth.',
            '[deadpan] I asked for backup. They sent me you sorry bastards.',
            '[completely serious] Today we make history. Or a hell of a mess.',
            '[deadpan] Did somebody bring snacks? No? Then what the hell are we doing.',
            "[completely serious] Let's go to work. And try not to fuck up the paint.",
            '[deadpan] The enemy is well armed, well trained, and extremely pissed off. So are we, mostly.',
            '[completely serious] I want this clean. Clean as hell.',
            "[deadpan] Good news, we've got them surrounded. Bad news, shit, it's from the inside.",
            "[completely serious] If I go down, tell my mother I said a lot of bad words. She'll understand.",
            "[deadpan] I was promised a parade. Where's my damn parade.",
            '[completely serious] Nobody touch anything. Especially the shit that ticks.',
            '[deadpan] Last time we did this, it went to hell in four seconds. New record to beat.',
            "[completely serious] Move like you mean it. Shoot like you're pissed.",
            "[deadpan] I'm getting too old for this shit. And I'm the youngest one here.",
            '[completely serious] Whatever you hear on the radio, ignore it. Except me, damn it.',
            "[deadpan] We're the best they've got. That's a terrifying fucking sentence.",
            "[completely serious] Alright, everybody. Let's go ruin somebody's God damn day."]
for v, (name, voice) in enumerate(SQUAD.items()):
    for kind, pool in CHATTER_X.items():
        for k in range(2):
            add(f'vo/chatter/{name}/x_{kind}_{k + 1}', voice, f'{KIND[kind]} {pool[(v * 2 + k * 5) % len(pool)]}')
    for k in range(2):
        add(f'vo/chatter/{name}/x_banter_{k + 1}', voice, BANTER_X[v * 2 + k])


# ---------- making and checking ----------
def synth(key, region, voice, body):
    if isinstance(voice, tuple):
        return synth_el(voice, body)
    req = urllib.request.Request(f'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1', data=ssml(voice, body).encode('utf-8'),
                                 headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml',
                                          'X-Microsoft-OutputFormat': FORMAT, 'User-Agent': 'breachpoint-voice'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            code = getattr(e, 'code', 0)
            if code in (0, 429, 500, 502, 503, 504) and attempt < 5:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f'{code} {e}')


def synth_el(voice, text):
    _, vid, speed = voice
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128',
                                 data=json.dumps({'text': text, 'model_id': EL_MODEL, 'voice_settings': {'speed': speed}}).encode(),
                                 headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            code = getattr(e, 'code', 0)
            if code in (0, 429, 500, 502, 503, 504) and attempt < 5:
                time.sleep(2 ** attempt + 1)
                continue
            raise RuntimeError(f'{code} {e.read()[:300] if hasattr(e, "read") else e}')


def finish(path):
    # cut the padding to 40 ms at each end, shorten any pause inside a line to about 0.2 s (long gaps between
    # sentences sound slow and awkward in a game), and bring every voice to the same loudness (-16 LUFS)
    tmp = path + '.tmp.mp3'
    f = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,'
         'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,'
         'silenceremove=stop_periods=-1:stop_threshold=-45dB:stop_duration=0.22:stop_silence=0.18,'   # no pause over ~0.2 s
         'loudnorm=I=-16:TP=-1.5:LRA=11')
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', f, '-ar', '24000', '-ac', '1', '-b:a', '48k', tmp])
    if r.returncode == 0 and os.path.getsize(tmp) > 400:
        os.replace(tmp, path)
    elif os.path.exists(tmp):
        os.remove(tmp)


SAME = {'1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
        '11': 'eleven', '12': 'twelve', '13': 'thirteen', '14': 'fourteen', '15': 'fifteen', '20': 'twenty', '60': 'sixty', 'ok': 'okay',
        'killstreak': 'kill streak', 'overtime': 'over time', 'diffused': 'defused', 'diffuse': 'defuse', 'gonna': 'going to', 'wanna': 'want to', 'hooah': 'hoo ah', 'kaboom': 'ka boom',
        'goddamn': 'god damn', 'goddamned': 'god damned', 'shitshow': 'shit show', 'motherfuckers': 'mother fuckers'}


def words(s):
    s = TAG.sub(' ', re.sub(r'<[^>]+>', ' ', s.replace('&apos;', "'").replace('&amp;', '&'))).lower().replace('-', ' ')
    s = re.sub(r"[^a-z0-9' ]", ' ', s).replace("'", '')
    return ' '.join(SAME.get(w, w) for w in s.split()).split()


def heard(key, region, path):
    # speech-to-text drops the first word of a clip with no lead-in: give it 0.6 s of silence either side
    wav = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-af', 'adelay=600,apad=pad_dur=0.6', '-ar', '16000', '-ac', '1', '-f', 'wav', '-'],
                         capture_output=True).stdout
    req = urllib.request.Request(f'https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple&profanity=raw',
                                 data=wav, headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read()).get('DisplayText', '')
        except Exception:
            time.sleep(2 + 2 * attempt)
    return None   # couldn't check


def score(body, text):
    a, b = words(body), words(text or '')
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, ' '.join(a), ' '.join(b)).ratio()


lock = threading.Lock()


def make(key, region, id_, verify, regen=True):
    voice, body = LINES[id_]
    path = os.path.join(OUT, id_ + '.mp3')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    best, best_s, got = None, -1, ''
    for attempt in range(4 if verify else 1):
        if regen or attempt:
            audio = synth(key, region, voice, body)
            if len(audio) < 800:
                raise RuntimeError(f'{id_}: suspiciously short audio ({len(audio)} bytes)')
            with open(path, 'wb') as f:
                f.write(audio)
            finish(path)
        if not verify:
            return id_, 1.0, ''
        text = heard(key, region, path)
        if text is None:
            return id_, None, 'not checked'
        s = score(body, text)
        if s > best_s:
            best_s, got = s, text
            with open(path, 'rb') as f:
                best = f.read()
        if s == 1.0:
            break
    with open(path, 'wb') as f:   # the closest take of the ones made
        f.write(best)
    return id_, best_s, got


def main():
    key, region = os.environ.get('AZURE_SPEECH_KEY'), os.environ.get('AZURE_SPEECH_REGION', 'westus2')
    if not key or not os.environ.get('ELEVENLABS_API_KEY'):
        sys.exit('set AZURE_SPEECH_KEY and ELEVENLABS_API_KEY')
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    force, verify, verify_all = '--force' in sys.argv, '--no-verify' not in sys.argv, '--verify-all' in sys.argv
    jobs = []
    for id_ in LINES:
        if (only and not id_.startswith(only)) or id_ in RECORDED:
            continue
        exists = os.path.exists(os.path.join(OUT, id_ + '.mp3'))
        if force or not exists:
            jobs.append((id_, True))
        elif verify_all:
            jobs.append((id_, False))
    off = []
    with ThreadPoolExecutor(4) as pool:
        for n, (id_, s, got) in enumerate(pool.map(lambda j: make(key, region, j[0], verify, j[1]), jobs), 1):
            with lock:
                print(f'[{n}/{len(jobs)}] {id_}' + ('' if s in (1.0, None) else f'   (closest: "{got}")'), flush=True)
            if s is not None and s < 1.0:
                off.append((s, id_, got))
    # the manifest: every recording that exists (generated or added by hand)
    files = sorted(os.path.relpath(os.path.join(d, f), OUT)[:-4].replace(os.sep, '/')
                   for d, _, fs in os.walk(OUT) for f in fs if f.endswith('.mp3'))
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'files': files}, f, indent=0)
        f.write('\n')
    print(f'{len(jobs)} made or checked, {len(files)} in the manifest')
    if off:
        print(f'{len(off)} never transcribed exactly (listen to these):')
        for s, id_, got in sorted(off):
            print(f'  {s:.2f}  {id_}  script: "{TAG.sub("", re.sub(r"<[^>]+>", "", LINES[id_][1]))}"  heard: "{got}"')


if __name__ == '__main__':
    main()
