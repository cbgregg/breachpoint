#!/usr/bin/env python3
"""Generate every voice line in the game with Azure text-to-speech, and check each one by ear (speech-to-text).

    AZURE_SPEECH_KEY=... [AZURE_SPEECH_REGION=westus2] python3 tools/gen_voice.py [--only vo/link] [--force]
                                                                                  [--no-verify] [--verify-all]

Writes assets/audio/<id>.mp3 (24 kHz, 48 kbit/s mono MP3, padding trimmed, loudness matched) for each line below
and lists every file that exists in assets/audio/manifest.json, which is what the game loads. Lines that already
have a file are skipped unless --force. Every clip made is transcribed back and re-made (up to three more times)
until the transcript matches the script; --verify-all re-checks the clips already there too. The key is read from
the environment only: never put it in this file.

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
# Azure's Dragon HD voices: they read a line for its meaning, so the emotion is in the writing (an exclamation, a
# "Phew!", a dry aside) rather than in styles and pitch shifts, which made the older voices sound synthetic and
# which HD voices ignore anyway. A voice here is just its name.
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


LINES = {}   # id -> (voice, ssml body)
# lines recorded by a person: never generated over, even with --force (the script stays here for reference)
RECORDED = {'vo/link/hold_on'}


def add(id_, voice, body):
    LINES[id_] = (voice, body)


# ---------- 1. announcers ----------
# Every pack says every announcement; takes are picked at random. Lines heard by both teams (bomb planted, team
# eliminated, flag captured...) don't take a side. round_<n> uses {n}.
NUM = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
ANNOUNCERS = {
    # a calm, clipped mission controller
    'control': (hd('Brian'), {
        'mode_tdm': ['Team Deathmatch. Eliminate the enemy team.', 'Team Deathmatch. First team to the score limit wins. Stay sharp.'],
        'mode_ffa': ['Free-for-all. Trust no one.', 'Free-for-all. Every operator is a target. Good luck.'],
        'mode_gunfight': ['Gunfight. One life. Same loadout. Win the round.', 'Gunfight. Identical loadouts, no respawns. Make every shot count.'],
        'mode_snd': ['Search and Destroy. Plant the bomb, or stop them.', 'Search and Destroy. One life per round. Protect the objective.'],
        'mode_gungame': ['Gun Game. Every kill, a new weapon.', 'Gun Game. Climb the ladder. The last weapon wins it.'],
        'mode_infected': ['Infected. Survive, or join them.', "Infected. Hold out as long as you can. Don't get caught."],
        'fight': ['Fight!', 'Go, go, go!', 'Engage!'],
        'one_minute': ['One minute remaining.', 'Sixty seconds left. Finish it.'],
        'lead_taken': ["We've taken the lead.", "We're in front. Keep the pressure on."],
        'lead_lost': ["We've lost the lead.", "They've pulled ahead. Regroup and push."],
        'victory': ['Victory. Outstanding work.', 'Victory. Mission accomplished.', 'Victory.'],
        'defeat': ['Defeat.', "Defeat. We'll get them next time.", 'Mission failed. Defeat.'],
        'double_kill': ['Double kill!', 'Double kill. Nice.'],
        'triple_kill': ['Triple kill!', 'Triple kill. Impressive.'],
        'fury_kill': ['Fury kill!', 'Fury kill. Keep moving.'],
        'frenzy_kill': ['Frenzy kill!', 'Frenzy kill. Unbelievable.'],
        'killstreak': ['Killstreak!', 'Three in a row. Killstreak.'],
        'killing_spree': ['Killing spree!', "Killing spree. They can't stop you."],
        'rampage': ['Rampage!', 'Ten straight. Rampage.'],
        'unstoppable': ['Unstoppable!', 'Fifteen without dying. Unstoppable.'],
        'legendary': ['Legendary!', 'Twenty in a row. Legendary.'],
        'new_weapon': ['New weapon.', 'Weapon upgraded.', 'Next weapon.'],
        'final_weapon': ['Final weapon.', 'Final weapon. One more kill.'],
        'humiliated': ['Humiliated.', "Humiliated. That one's going to sting."],
        'you_are_infected': ['You are infected. Kill the survivors.', "You've turned. Hunt down the survivors."],
        'infected': ['Infected.', 'Another one has turned.'],
        'last_survivor': ["You're the last survivor. Hold on.", "Last survivor. Everything's on you now."],
        'round': ['Round {n}.', 'Round {n}. Stand by.'],
        'final_round': ['Final round.', 'Final round. This decides it.'],
        'match_point': ['Match point.', 'Match point. One round from the end.'],
        'switching_sides': ['Switching sides.', 'Halftime. Switching sides.'],
        'overtime': ['Overtime. Capture the flag.', 'Overtime. Take the flag to win the round.'],
        'round_won': ['You won the round.', 'The round is ours. Good work.'],
        'round_lost': ['You lost the round.', 'Round lost. Reset and go again.'],
        'round_draw': ['Round drawn.', "It's a draw."],
        'bomb_planted': ['Bomb planted.', 'The bomb has been planted.'],
        'bomb_defused': ['Bomb defused.', 'The bomb has been defused.'],
        'target_destroyed': ['Target destroyed.', 'Detonation confirmed. Target destroyed.'],
        'team_eliminated': ['Team eliminated.', 'Last operator down. Team eliminated.'],
        'flag_captured': ['Flag captured.', 'The flag has been captured.'],
        'bomb_dropped': ["The bomb's been dropped.", 'Bomb carrier down. Recover the bomb.'],
        'you_have_the_bomb': ['You have the bomb.', "You're carrying the bomb. Get it to a site."],
        'bomb_picked_up': ['Bomb picked up.', 'We have the bomb again.'],
    }),
    # a cool, dry, slightly sarcastic commander
    'sable': (hd('Jane'), {
        'mode_tdm': ['Team Deathmatch. Kill more of them than they kill of you. Simple.', 'Team Deathmatch. Their team, our team. You know what to do.'],
        'mode_ffa': ['Free-for-all. No friends out here.', "Free-for-all. Everyone's an enemy. Even the nice ones."],
        'mode_gunfight': ['Gunfight. Same guns, one life. No excuses.', "Gunfight. Everyone gets the same kit. Prove you're better."],
        'mode_snd': ["Search and Destroy. One life. Don't waste it.", 'Search and Destroy. Plant it, or defuse it. Try not to die.'],
        'mode_gungame': ['Gun Game. A new gun every kill. Try to keep up.', 'Gun Game. Kill, upgrade, repeat.'],
        'mode_infected': ['Infected. Run. Hide. Or become one of them.', "Infected. Somebody's already sick. Don't let it be you."],
        'fight': ['Fight.', 'Go. Now.', 'Move out.'],
        'one_minute': ['One minute left. Make it count.', 'One minute. Stop wasting time.'],
        'lead_taken': ["We're ahead. Don't get comfortable.", "We've taken the lead. Finally."],
        'lead_lost': ["We've lost the lead. Fix that.", "They're ahead. I'm not impressed."],
        'victory': ['Victory. I knew you had it in you.', 'Victory. Not bad. Not bad at all.', 'We win. Of course we do.'],
        'defeat': ["Defeat. Let's never speak of this.", 'Defeat. That was painful to watch.', 'We lost. Shake it off.'],
        'double_kill': ['Double kill. Nice.', 'Double kill!', 'Two at once. Lovely.'],
        'triple_kill': ["Triple kill. Now we're talking.", 'Triple kill!'],
        'fury_kill': ['Fury kill. Remind me never to annoy you.', 'Fury kill!'],
        'frenzy_kill': ['Frenzy kill. Okay, show off.', 'Frenzy kill!'],
        'killstreak': ['Killstreak. Keep going.', 'Three down. Killstreak.'],
        'killing_spree': ["Killing spree. They're scared of you now.", 'Killing spree!'],
        'rampage': ['Rampage. Somebody stop them. Not us, obviously.', 'Rampage!'],
        'unstoppable': ["Unstoppable. I'm actually impressed.", 'Unstoppable!'],
        'legendary': ["Legendary. I'll be telling people about this.", 'Legendary!'],
        'new_weapon': ['New weapon.', "Upgrade. Don't drop it.", 'Next gun.'],
        'final_weapon': ['Final weapon. Finish it.', "Last weapon. One kill and we're done."],
        'humiliated': ['Humiliated. Ouch.', 'Humiliated. How embarrassing.'],
        'you_are_infected': ["You're infected. Go hunt them down.", "You've turned. Enjoy it. Kill the survivors."],
        'infected': ['Infected.', "Another one's turned."],
        'last_survivor': ["Last survivor. It's all on you. No pressure.", "You're the last one left. Don't let me down."],
        'round': ['Round {n}.', 'Round {n}. Focus.'],
        'final_round': ['Final round. Everything on this one.', 'Final round.'],
        'match_point': ['Match point. Close it out.', 'Match point.'],
        'switching_sides': ['Switching sides.', 'Halftime. Swap sides.'],
        'overtime': ['Overtime. Grab the flag.', 'Overtime. Whoever takes the flag wins.'],
        'round_won': ["That round's ours. Good.", 'We take the round.', 'You won the round.'],
        'round_lost': ['Round lost. Sloppy.', 'We lost that one. Next.', 'You lost the round.'],
        'round_draw': ['A draw. How dull.', 'Round drawn.'],
        'bomb_planted': ['The bomb is planted.', "Bomb's down. Clock's ticking."],
        'bomb_defused': ['Bomb defused.', "The bomb's been defused."],
        'target_destroyed': ['Target destroyed.', 'Boom. Target destroyed.'],
        'team_eliminated': ['Team eliminated.', "That's the whole team. Eliminated."],
        'flag_captured': ['Flag captured.', "The flag's been taken. Captured."],
        'bomb_dropped': ["The bomb's been dropped. Go get it.", "Bomb's on the ground. Pick it up."],
        'you_have_the_bomb': ["You've got the bomb. Don't lose it.", 'You have the bomb. Get it planted.'],
        'bomb_picked_up': ['Bomb picked up.', "We've got the bomb back."],
    }),
    # a gruff old drill sergeant
    'ghost': (hd('Vance'), {
        'mode_tdm': ['Team Deathmatch! Put the enemy in the dirt!', 'Team Deathmatch. Stick with your squad and drop every one of them.'],
        'mode_ffa': ['Free-for-all! Every soldier for themselves!', "Free-for-all. Nobody's got your back out here. Move!"],
        'mode_gunfight': ['Gunfight. One life, same rifle as the other guy. Earn it.', 'Gunfight! No second chances!'],
        'mode_snd': ['Search and Destroy. You die, you stay dead. Plant it or stop it!', 'Search and Destroy! Get that bomb where it belongs!'],
        'mode_gungame': ['Gun Game! Every kill, a new piece of iron!', 'Gun Game. Work your way up, recruit!'],
        'mode_infected': ['Infected! Dig in and stay alive!', "Infected. They're coming for you. Don't let them in!"],
        'fight': ['Move, move, move!', 'Go! Go! Go!', 'Fight!'],
        'one_minute': ['One minute left! Pick up the pace!', 'Sixty seconds! Move it!'],
        'lead_taken': ["We've got the lead! Keep it!", "We're out in front! Don't let up!"],
        'lead_lost': ["We've lost the lead! Get it back!", "They're ahead! Are you going to let that stand?"],
        'victory': ['Victory! Outstanding, soldiers!', "Victory! That's how it's done!", 'Victory. Mission complete!'],
        'defeat': ['Defeat! Get up and do it again!', 'Defeat. Pathetic. Back to training.', 'Defeat. Regroup!'],
        'double_kill': ['Double kill!', 'Double kill! Outstanding!'],
        'triple_kill': ['Triple kill!', 'Triple kill! Keep firing!'],
        'fury_kill': ['Fury kill!', "Fury kill! Now that's aggression!"],
        'frenzy_kill': ['Frenzy kill!', 'Frenzy kill! Holy smokes!'],
        'killstreak': ['Killstreak!', 'Three down! Killstreak!'],
        'killing_spree': ['Killing spree!', 'Killing spree! Keep it rolling!'],
        'rampage': ['Rampage!', 'Rampage! Nobody can touch you!'],
        'unstoppable': ['Unstoppable!', "Unstoppable! Nobody's stopping you now!"],
        'legendary': ['Legendary!', "Legendary! I've never seen anything like it!"],
        'new_weapon': ['New weapon!', 'Fresh iron! Use it!', 'Next weapon!'],
        'final_weapon': ['Final weapon! Finish the job!', 'Last weapon! Bring it home!'],
        'humiliated': ['Humiliated! Get your head in the game!', 'Humiliated!'],
        'you_are_infected': ["You're infected! Hunt down every survivor!", "You've turned! Now go get them!"],
        'infected': ['Infected!', 'We lost another one! Infected!'],
        'last_survivor': ["You're the last one standing! Hold the line!", "Last survivor! Don't you quit on me!"],
        'round': ['Round {n}!', 'Round {n}. Lock and load!'],
        'final_round': ['Final round! Leave it all out there!', 'Final round!'],
        'match_point': ['Match point! Close it out!', 'Match point!'],
        'switching_sides': ['Switching sides!', 'Halftime! Switch it up!'],
        'overtime': ['Overtime! Take that flag!', 'Overtime! Capture the flag and end this!'],
        'round_won': ['We take the round! Good work!', 'You won the round! Outstanding!'],
        'round_lost': ['Round lost! Shake it off!', 'You lost the round! Get it back!'],
        'round_draw': ['Round drawn!', "It's a draw! Nobody wins!"],
        'bomb_planted': ['Bomb planted!', 'The bomb is planted!'],
        'bomb_defused': ['Bomb defused!', 'That bomb is defused!'],
        'target_destroyed': ['Target destroyed!', 'Target is gone! Destroyed!'],
        'team_eliminated': ['Team eliminated!', 'That whole team is down! Eliminated!'],
        'flag_captured': ['Flag captured!', 'The flag is taken!'],
        'bomb_dropped': ["The bomb's been dropped! Get it back!", "Bomb's down! Somebody grab it!"],
        'you_have_the_bomb': ["You've got the bomb! Move!", 'You have the bomb! Get to a site!'],
        'bomb_picked_up': ['Bomb picked up!', "We've got the bomb again!"],
    }),
    # an esports arena caster
    'hype': (hd('Alloy'), {
        'mode_tdm': ["Ladies and gentlemen, it's Team Deathmatch! Let's go!", 'Team Deathmatch is on! Two teams, one winner!'],
        'mode_ffa': ["It's Free-for-all! Everybody against everybody!", 'Free-for-all, folks! No teams, no mercy!'],
        'mode_gunfight': ['Gunfight! Same loadouts, one life, pure skill!', "It's Gunfight time! Who's got the aim?"],
        'mode_snd': ['Search and Destroy! Every life matters, every round counts!', "It's Search and Destroy! Plant it or stop it!"],
        'mode_gungame': ['Gun Game! Every kill, a brand new weapon!', 'Welcome to Gun Game! Climb that ladder!'],
        'mode_infected': ['Infected! Survivors, start running!', "It's Infected! Who's going to make it out alive?"],
        'fight': ["Let's go!", 'Here we go!', 'Fight!'],
        'one_minute': ['One minute left on the clock!', "Sixty seconds to go! It's not over!"],
        'lead_taken': ['And we take the lead!', "We've taken the lead! What a turnaround!"],
        'lead_lost': ["Oh! We've lost the lead!", 'The lead is gone! Can we come back?'],
        'victory': ['Victory! What a game!', 'Victory! Unbelievable performance!', "And that's the game! Victory!"],
        'defeat': ['Defeat! So close!', "Oh, that's a defeat! Heartbreaking!", "Defeat! We'll want that one back!"],
        'double_kill': ['Double kill!', 'Ohh, double kill!', 'Two for one! Double kill!'],
        'triple_kill': ['Triple kill!', 'Oh my! Triple kill!'],
        'fury_kill': ['Fury kill!', 'Fury kill! Are you kidding me?'],
        'frenzy_kill': ['Frenzy kill!', 'Frenzy kill! The crowd goes wild!'],
        'killstreak': ['Killstreak!', 'Three in a row! Killstreak!'],
        'killing_spree': ['Killing spree!', 'Killing spree! Somebody stop them!'],
        'rampage': ['Rampage!', "It's a rampage! Incredible!"],
        'unstoppable': ['Unstoppable!', 'Unstoppable! This is insane!'],
        'legendary': ['Legendary!', 'Legendary! History in the making!'],
        'new_weapon': ['New weapon!', 'Upgrade!', "Next weapon, let's go!"],
        'final_weapon': ['Final weapon! One kill from glory!', "It's the final weapon!"],
        'humiliated': ["Humiliated! Oh, that's got to hurt!", 'Humiliated! Brutal!'],
        'you_are_infected': ["You're infected! Go get those survivors!", "You've turned! Time to hunt!"],
        'infected': ['Infected!', "Another one's infected!"],
        'last_survivor': ['Last survivor! Can you hold on?', 'It all comes down to you! Last survivor!'],
        'round': ['Round {n}!', 'Round {n}, here we go!'],
        'final_round': ['Final round! This is it!', "It's the final round!"],
        'match_point': ['Match point! It all comes down to this!', 'Match point!'],
        'switching_sides': ['Switching sides!', 'Halftime! Switching sides!'],
        'overtime': ['Overtime! Capture the flag to win it!', "We're going to overtime!"],
        'round_won': ['That round is ours! Beautiful!', 'You won the round!'],
        'round_lost': ['Round lost! Shake it off!', 'You lost the round!'],
        'round_draw': ["It's a draw!", 'Round drawn!'],
        'bomb_planted': ['The bomb is planted!', 'Bomb planted! Tick tock!'],
        'bomb_defused': ['Bomb defused!', 'Defused! What a clutch!'],
        'target_destroyed': ['Target destroyed!', 'Boom! Target destroyed!'],
        'team_eliminated': ['Team eliminated!', 'Wiped out! Team eliminated!'],
        'flag_captured': ['Flag captured!', 'The flag is captured!'],
        'bomb_dropped': ["The bomb's been dropped!", "Bomb's on the floor! Who's grabbing it?"],
        'you_have_the_bomb': ["You've got the bomb!", 'You have the bomb! Make it count!'],
        'bomb_picked_up': ['Bomb picked up!', "We've got the bomb back!"],
    }),
    # upbeat and playful
    'nova': (hd('Nova'), {
        'mode_tdm': ['Team Deathmatch! Stick together and have fun out there!', "Team Deathmatch! Let's show them how it's done!"],
        'mode_ffa': ["Free-for-all! It's every operator for themselves!", 'Free-for-all! No teammates, no problem!'],
        'mode_gunfight': ['Gunfight! Same gear, one life. Ready?', 'Gunfight! May the best aim win!'],
        'mode_snd': ['Search and Destroy! Careful, you only get one life!', "Search and Destroy! The bomb goes boom, or it doesn't!"],
        'mode_gungame': ['Gun Game! Ooh, every kill gets you a new toy!', 'Gun Game! Work your way up to the slingshot!'],
        'mode_infected': ['Infected! Oh no, hide!', 'Infected! Survive, or join the horde!'],
        'fight': ['Go get them!', "Let's do this!", 'Fight!'],
        'one_minute': ['Only one minute left!', 'One minute! Hurry, hurry!'],
        'lead_taken': ["Yes! We've taken the lead!", "We're winning! Keep it up!"],
        'lead_lost': ["Oh no, we've lost the lead!", "They're ahead! Come on, we've got this!"],
        'victory': ['Victory! You were amazing!', 'We won! Yes!', 'Victory! That was so much fun!'],
        'defeat': ['Defeat. Aw, so close!', "We lost. Don't worry, we'll get them next time!", 'Defeat. Ugh, rematch?'],
        'double_kill': ['Double kill!', 'Ooh, double kill!', 'Double kill! Nice one!'],
        'triple_kill': ['Triple kill!', 'Triple kill! Wow!'],
        'fury_kill': ['Fury kill!', 'Fury kill! Whoa!'],
        'frenzy_kill': ['Frenzy kill!', "Frenzy kill! You're on fire!"],
        'killstreak': ['Killstreak!', 'Three in a row! Killstreak!'],
        'killing_spree': ['Killing spree!', 'Killing spree! Keep going!'],
        'rampage': ['Rampage!', 'Rampage! This is incredible!'],
        'unstoppable': ['Unstoppable!', 'Unstoppable! Nobody can stop you!'],
        'legendary': ['Legendary!', 'Legendary! Oh my gosh!'],
        'new_weapon': ['New weapon!', 'Ooh, new weapon!', 'Next one!'],
        'final_weapon': ["Final weapon! You're almost there!", 'Last weapon! You can do it!'],
        'humiliated': ['Humiliated! Oof.', "Humiliated! Oh, that's embarrassing!"],
        'you_are_infected': ["You're infected! Go chase the survivors!", "You've turned! Now go get them!"],
        'infected': ['Infected!', "Uh oh. Another one's infected!"],
        'last_survivor': ["You're the last survivor! Hang in there!", "Last one standing! You've got this!"],
        'round': ['Round {n}!', "Round {n}! Let's go!"],
        'final_round': ['Final round! Give it everything!', 'Final round!'],
        'match_point': ['Match point! So close!', 'Match point!'],
        'switching_sides': ['Switching sides!', 'Halftime! Time to switch sides!'],
        'overtime': ['Overtime! Grab that flag!', 'Overtime! Capture the flag to win!'],
        'round_won': ['We got the round! Yay!', 'You won the round! Great job!'],
        'round_lost': ['Round lost. Aw!', "You lost the round. The next one's ours!"],
        'round_draw': ["It's a tie!", 'Round drawn!'],
        'bomb_planted': ["The bomb's been planted!", 'Bomb planted! Eek!'],
        'bomb_defused': ['Bomb defused!', 'Phew! Bomb defused!'],
        'target_destroyed': ['Target destroyed!', 'Kaboom! Target destroyed!'],
        'team_eliminated': ['Team eliminated!', "And that's the whole team! Eliminated!"],
        'flag_captured': ['Flag captured!', "The flag's been captured!"],
        'bomb_dropped': ["The bomb's been dropped!", "Oops, the bomb's on the ground!"],
        'you_have_the_bomb': ["You've got the bomb!", 'You have the bomb! Be careful!'],
        'bomb_picked_up': ['Bomb picked up!', "We've got the bomb again!"],
    }),
}
for pack, (voice, lines) in ANNOUNCERS.items():
    for id_, takes in lines.items():
        if id_ == 'round':   # round_3_1, round_3_2: takes of round_3 (and never of a bare "round")
            for i, w in enumerate(NUM, 1):
                for k, line in enumerate(takes, 1):
                    add(f'vo/announcer/{pack}/round_{i}_{k}', voice, t(line.format(n=w)))
            continue
        for k, line in enumerate(takes, 1):
            add(f'vo/announcer/{pack}/{id_}_{k}', voice, t(line))

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
SQUAD = ['emma', 'davis', 'aria', 'steffan', 'jenny', 'adam', 'tessa', 'tyler', 'mila', 'colin', 'tiana', 'jimmie']
CHATTER = {   # each voice gets three of each pool, starting at a different place, so voices don't all say the same thing
    'reloading': ['Reloading!', 'Changing mags, cover me!', "I'm dry, I'm dry!", 'Reloading, hold them off!', 'Mag out! Give me a second!',
                  'Cover me, reloading!', 'Out of ammo! Reloading!', 'Swapping mags!', 'Hang on, reloading!', 'Ugh, empty! Reloading!',
                  'Reloading, watch my back!', 'Last mag! Reloading!'],
    'frag_out': ['Frag out!', 'Grenade out!', 'Frag out, get down!', 'Fire in the hole!', 'Grenade! Heads down!', 'Frag out, frag out!',
                 'Throwing a frag!', 'Eat this! Frag out!', 'Grenade, grenade!', 'Frag going in!', 'Fire in the hole, move!', 'Frag out, clear the area!'],
    'semtex_out': ['Semtex out!', 'Sticky out!', 'Sticky grenade!', 'Semtex, heads up!', "Sticky's out!", 'Semtex going in!',
                   'Sticky grenade out!', 'Semtex! Get clear!', 'Throwing a sticky!', 'Sticky, sticky!', 'Semtex thrown!', 'Sticky out, move!'],
    'knife_out': ['Knife!', 'Throwing knife!', 'Knife out!', 'Catch!', 'Here, catch this!', 'Blade out!', 'Knife, incoming!', 'Take this!',
                  'Throwing!', 'Knife thrown!', 'Heads up, knife!', 'Special delivery!'],
    'shock_out': ['Shock stick out!', 'Zapper out!', 'Shock stick!', 'Shock stick, heads up!', 'Zap!', 'Shock stick going in!',
                  'Zapper, heads up!', 'Throwing a shock stick!', 'Shock stick thrown!', 'Time to zap them!', 'Zapper going in!', 'Shock out!'],
    'stun_out': ['Stun out!', 'Flash out!', 'Flashbang!', 'Stun grenade!', 'Flash out, cover your eyes!', 'Stun going in!', 'Flashing!',
                 'Stun, stun!', 'Flashbang out!', 'Stun out, look away!', 'Throwing a flash!', 'Stun grenade out!'],
    'contact': ['Contact!', 'Enemy spotted!', 'Got eyes on one!', 'Contact front!', 'Hostile, right there!', 'Enemy! Over there!',
                'I see one!', 'Tango spotted!', 'Contact, contact!', "They're here!", 'Movement! Enemy!', 'Eyes on! Enemy!'],
    'enemy_down': ['Enemy down.', 'Got one!', 'Tango down.', 'Scratch one!', 'Target down!', "They're down!", 'Got them!',
                   "That's one less.", 'Down they go!', 'Yes! Got one!', 'Enemy neutralized.', 'Stay down!'],
    'man_down': ['Man down!', 'We lost one!', 'They got one of ours!', 'Operator down!', 'No! We lost one!', "We've got one down!",
                 'Teammate down!', 'Oh no, we lost one!', 'Friendly down!', "We're one short!", "They're picking us off!", 'Down! Somebody went down!'],
    'hit': ["I'm hit!", 'Taking fire!', "Agh! I'm hit!", 'Taking heavy fire!', "I'm hurt!", 'Ow! That hurt!', "They're hitting me!",
            "I'm bleeding here!", 'Under fire!', 'I need cover!', "Ugh! I'm hit, I'm hit!", "I'm taking damage!"],
}
BANTER = ['Same as last time. Nobody dies.', 'Check your corners.', 'Anyone else hungry?', "I've got a good feeling about this.",
          'Stay tight, stay quiet.', 'Light them up.', 'Who brought the snacks?', 'Eyes up, people.', "Let's make it quick.", 'Last one back buys.',
          'I swear, if I get spawn killed again...', 'My hands are shaking. Is that normal?', "Okay, okay. Deep breaths. We've got this.",
          'Did anyone else hear that? No? Just me?', "I just cleaned this rifle. Don't let me get it dirty.", 'Remember the plan? Yeah, me neither.',
          'Whoever gets the most kills picks dinner.', "Ha! They don't stand a chance.", "I hate this map. I love this map. I can't decide.",
          "My mom thinks I'm at a book club.", 'If I go down, tell my cat I loved her.', "Let's give them something to remember.",
          "Watch each other's backs out there.", 'Ugh, my boots are still wet from last time.', 'No heroes today. Just win.',
          'Is it just me, or is it cold in here?', "Okay team, bring it in. Let's go win this thing.", "I'm feeling lucky. Dangerously lucky.",
          "They've been talking trash all week. Time to shut them up.", 'Try not to shoot me this time, alright?',
          'Ten bucks says I top the scoreboard.', 'Stay frosty.', 'This is going to be fun. For us, anyway.', 'Nobody touch my grenades.',
          "Just once, I'd like a quiet day.", 'Alright, who forgot to reload? Seriously, check.',
          'Smells like victory. Or the vending machine. One of those.', "Let's keep it clean and fast.", 'Heads on a swivel, everyone.',
          "I've been waiting all day for this.", "Honestly? I'm terrified. Let's go.", "Follow my lead. Or don't. Your call.",
          "We win this, I'm buying the first round.", 'Okay, focus. Focus. What were we doing?', "They won't know what hit them.",
          'Breathe in. Breathe out. Squeeze the trigger.', "Hey, whatever happens, it's been an honor.", "Don't make me carry the whole team again.",
          'Ready when you are.', "Can we win quickly? I've got plans tonight.", "Coffee's wearing off. Let's hurry.",
          'Nobody panic. Unless I panic. Then panic.', 'Last match, I got the winning kill. Just saying.', "This one's for the squad.",
          'Hands up if you actually slept last night.', 'Lock it down. No mistakes.', "I've got a new trick. You'll see.",
          "Don't wander off this time.", 'Here we go again.', "Let's ruin their day."]
for v, name in enumerate(SQUAD):
    voice = hd(name.capitalize())
    for kind, pool in CHATTER.items():
        for k in range(3):
            add(f'vo/chatter/{name}/{kind}_{k + 1}', voice, t(pool[(v * 3 + k) % len(pool)]))
    for k in range(5):
        add(f'vo/chatter/{name}/banter_{k + 1}', voice, t(BANTER[v * 5 + k]))


# ---------- making and checking ----------
def synth(key, region, voice, body):
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


def finish(path):
    # the service pads every clip with most of a second of silence: cut it to 40 ms at each end, and bring every
    # voice to the same loudness (-16 LUFS) so no announcer or operator is louder than the rest
    tmp = path + '.tmp.mp3'
    f = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,'
         'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,loudnorm=I=-16:TP=-1.5:LRA=11')
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-af', f, '-ar', '24000', '-ac', '1', '-b:a', '48k', tmp])
    if r.returncode == 0 and os.path.getsize(tmp) > 400:
        os.replace(tmp, path)
    elif os.path.exists(tmp):
        os.remove(tmp)


SAME = {'1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
        '11': 'eleven', '12': 'twelve', '13': 'thirteen', '14': 'fourteen', '15': 'fifteen', '20': 'twenty', '60': 'sixty', 'ok': 'okay',
        'killstreak': 'kill streak', 'overtime': 'over time', 'diffused': 'defused', 'diffuse': 'defuse', 'gonna': 'going to', 'wanna': 'want to', 'hooah': 'hoo ah', 'kaboom': 'ka boom'}


def words(s):
    s = re.sub(r'<[^>]+>', ' ', s.replace('&apos;', "'").replace('&amp;', '&')).lower().replace('-', ' ')
    s = re.sub(r"[^a-z0-9' ]", ' ', s).replace("'", '')
    return ' '.join(SAME.get(w, w) for w in s.split()).split()


def heard(key, region, path):
    # speech-to-text drops the first word of a clip with no lead-in: give it 0.6 s of silence either side
    wav = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-af', 'adelay=600,apad=pad_dur=0.6', '-ar', '16000', '-ac', '1', '-f', 'wav', '-'],
                         capture_output=True).stdout
    req = urllib.request.Request(f'https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple',
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
    if not key:
        sys.exit('set AZURE_SPEECH_KEY')
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
    with ThreadPoolExecutor(6) as pool:
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
            print(f'  {s:.2f}  {id_}  script: "{re.sub(r"<[^>]+>", "", LINES[id_][1])}"  heard: "{got}"')


if __name__ == '__main__':
    main()
