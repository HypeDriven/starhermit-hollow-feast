# SFX manifest — hollow-feast

Generated with MOSS-SoundEffect v2.0, 48 kHz mono Opus (96 kbps VBR, loudness-normalized; 100 inference steps).

Canonical source: `sfx/manifest.txt`. `sfx/manifest.json` drives regeneration.

| file | event | prompt | usage |
|---|---|---|---|
| void-slide-a.opus | void-move | A soft airy whoosh, like a small smooth stone sliding one tile across a polished marble floor. | The void steps onto an empty or already-eaten cell; the quietest cue in the mix. |
| void-slide-b.opus | void-move | A gentle low swoosh of a round object gliding a short distance over a wooden tabletop. | Second movement variant, round-robined with the others. |
| void-slide-c.opus | void-move | A short hollow sliding scrape, a pebble pushed once across a slab of slate. | Third movement variant. |
| void-slide-d.opus | void-move | A quick muted whoosh with a soft rumble, a small ball rolling a single step over carpet. | Fourth movement variant. |
| gobble-a.opus | eat | A wet hollow gulp ending in a soft pop, a small object being swallowed into a void. | The void consumes the next morsel in the order; the reward cue of the whole game. |
| gobble-b.opus | eat | A squishy munch followed by a deep satisfying gulp, playful and cartoonish. | Second eat variant. |
| gobble-c.opus | eat | A quick comic chomp with a bubbly liquid slurp, like gulping a jelly sweet. | Third eat variant. |
| gobble-d.opus | eat | A soft plop as a small morsel drops into a deep echoing stone well. | Fourth eat variant. |
| thud-denied-a.opus | invalid | A dull muted thud knocked on thick wood, short and soft negative feedback. | The player pushes the void off the edge of the board; the move is refused and the void does not shift. |
| thud-denied-b.opus | invalid | A soft rubbery bonk, low and brief, like bumping into a padded wall. | Second edge-refusal variant. |
| wrong-order-a.opus | wrong-order | A soft dry refusal: two muted wooden block clicks with a short downward pitch drop, gentle and non-punishing. | The target cell holds a morsel that is not the next number in the order; softer than the edge thud so the two refusals are distinguishable by ear. |
| wrong-order-b.opus | wrong-order | A brief muffled cloth-covered bell tap that stops abruptly, a polite "not yet" cue. | Second out-of-order variant. |
| feast-complete-a.opus | win | A sparkling rising chime arpeggio of small brass bells, warm and celebratory. | All twelve morsels are gone; plays once with the win banner. |
| feast-complete-b.opus | win | A gentle cascade of glockenspiel notes resolving on a warm deep chime, a triumphant finish. | Second win variant, so back-to-back completions differ. |
| restart-sweep-a.opus | restart | A short reverse airy sweep ending in a soft breathy pop, like a table being wiped clean and reset. | The restart button or the R key lays out a fresh board. |
| restart-sweep-b.opus | restart | A quick rising whoosh of air with a light granular shimmer, a fresh board being laid out. | Second restart variant. |
| ui-tap-a.opus | ui-click | A short crisp wooden UI button tap, clean and dry. | Any on-screen direction button press, layered under the movement or refusal cue. |
| ui-tap-b.opus | ui-click | A quick soft plastic key click, subtle interface feedback. | Second UI variant. |
