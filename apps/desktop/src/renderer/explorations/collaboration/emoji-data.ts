/**
 * A curated emoji set for the collaboration explorations: what people react and write with in design reviews. The real
 * picker would load a full set with localized names, such as emojibase-data.
 */

export interface EmojiEntry {
  emoji: string
  name: string
  /** Other words it's found by, Slack's shortcodes among them. */
  keywords: string
  /** It takes a skin tone. */
  tone?: boolean
}

export interface EmojiCategory {
  id: string
  title: string
  emojis: EmojiEntry[]
}

/** One emoji per line: the emoji, its name, keywords, and "tone" when it takes a skin tone. */
function list(lines: string): EmojiEntry[] {
  return lines
    .trim()
    .split("\n")
    .map((line) => {
      const [emoji, name, keywords = "", tone] = line.trim().split("|")
      return { emoji: emoji!, name: name!, keywords, ...(tone ? { tone: true } : {}) }
    })
}

export const emojiCategories: EmojiCategory[] = [
  {
    id: "smileys",
    title: "Smileys",
    emojis: list(`
      😀|grinning face|smile happy grinning
      😃|grinning face with big eyes|smiley happy
      😄|grinning face with smiling eyes|smile happy
      😁|beaming face|grin
      😆|grinning squinting face|laughing satisfied
      😅|grinning face with sweat|sweat_smile phew
      🤣|rolling on the floor laughing|rofl lol
      😂|face with tears of joy|joy lol laugh
      🙂|slightly smiling face|smile
      😉|winking face|wink
      😊|smiling face with smiling eyes|blush
      😇|smiling face with halo|innocent angel
      🥰|smiling face with hearts|love
      😍|smiling face with heart eyes|heart_eyes love
      🤩|star struck|wow amazing
      😘|face blowing a kiss|kiss
      😋|face savoring food|yum
      😜|winking face with tongue|tongue silly
      🤪|zany face|crazy
      🤔|thinking face|thinking hmm
      🤨|face with raised eyebrow|suspicious
      😐|neutral face|meh
      😑|expressionless face|blank
      🙄|face with rolling eyes|eye roll
      😏|smirking face|smirk
      😬|grimacing face|grimace awkward
      😌|relieved face|relieved calm
      😴|sleeping face|sleep tired
      🫠|melting face|melt
      🤯|exploding head|mind blown
      🥳|partying face|party celebrate
      😎|smiling face with sunglasses|cool sunglasses
      🤓|nerd face|nerd geek
      🧐|face with monocle|inspect
      😕|confused face|confused
      😟|worried face|worried
      😮|face with open mouth|wow surprised
      🥺|pleading face|please
      😢|crying face|cry sad
      😭|loudly crying face|sob
      😱|face screaming in fear|scream
      😤|face with steam from nose|triumph huff
      😡|enraged face|angry rage
      💀|skull|dead
      👻|ghost|boo
      🤖|robot|bot agent
      👽|alien|ufo
      💩|pile of poo|poop
    `)
  },
  {
    id: "people",
    title: "People",
    emojis: list(`
      👍|thumbs up|+1 like yes approve|tone
      👎|thumbs down|-1 dislike no|tone
      👏|clapping hands|clap applause|tone
      🙌|raising hands|hooray celebrate|tone
      🙏|folded hands|pray thanks please|tone
      🤝|handshake|deal agree
      👋|waving hand|wave hello bye|tone
      ✌️|victory hand|peace|tone
      🤞|crossed fingers|luck hope|tone
      🤘|sign of the horns|rock|tone
      👌|ok hand|ok perfect|tone
      🤌|pinched fingers|chef|tone
      👈|backhand index pointing left|left point|tone
      👉|backhand index pointing right|right point|tone
      👆|backhand index pointing up|up point|tone
      👇|backhand index pointing down|down point|tone
      ☝️|index pointing up|one point|tone
      ✋|raised hand|stop high five|tone
      💪|flexed biceps|strong muscle|tone
      🫶|heart hands|love|tone
      🫡|saluting face|salute yes
      👀|eyes|look watching
      🧠|brain|smart think
      🙋|person raising hand|question me|tone
      🤷|person shrugging|shrug dunno|tone
      🤦|person facepalming|facepalm|tone
      🙇|person bowing|bow sorry|tone
      💁|person tipping hand|info|tone
    `)
  },
  {
    id: "nature",
    title: "Nature",
    emojis: list(`
      🌱|seedling|grow new
      🌿|herb|plant
      🍀|four leaf clover|luck
      🌵|cactus|desert
      🌸|cherry blossom|flower spring
      🌻|sunflower|flower
      🌈|rainbow|pride
      ☀️|sun|sunny
      🌙|crescent moon|night dark
      ⭐|star|favorite
      🌟|glowing star|star2 shine
      ⚡|high voltage|zap lightning fast
      🔥|fire|lit hot flame
      💧|droplet|water
      🌊|water wave|ocean
      ❄️|snowflake|cold
      🐶|dog face|dog puppy
      🐱|cat face|cat kitten
      🦊|fox|fox
      🐻|bear|bear
      🐼|panda|panda
      🐸|frog|frog
      🦄|unicorn|magic
      🐝|honeybee|bee busy
      🦋|butterfly|pretty
      🐢|turtle|slow
      🐙|octopus|octocat
      🦖|t-rex|dinosaur
    `)
  },
  {
    id: "food",
    title: "Food",
    emojis: list(`
      ☕|hot beverage|coffee
      🍵|teacup without handle|tea
      🍕|pizza|pizza
      🍔|hamburger|burger
      🌮|taco|taco
      🍣|sushi|sushi
      🍩|doughnut|donut
      🍪|cookie|cookie
      🎂|birthday cake|birthday
      🧁|cupcake|cake
      🍎|red apple|apple
      🍌|banana|banana
      🥑|avocado|avocado
      🍉|watermelon|summer
      🍿|popcorn|watch
      🍻|clinking beer mugs|beers cheers
      🥂|clinking glasses|cheers toast
    `)
  },
  {
    id: "objects",
    title: "Objects",
    emojis: list(`
      🎉|party popper|tada celebrate congrats
      🎊|confetti ball|confetti
      🚀|rocket|ship launch
      ✨|sparkles|magic new shiny
      🎨|artist palette|design art
      🖌️|paintbrush|paint design
      📐|triangular ruler|layout design
      📏|straight ruler|measure
      ✏️|pencil|edit write
      📝|memo|note write
      📌|pushpin|pin
      📎|paperclip|attach
      🔍|magnifying glass tilted left|search find
      💡|light bulb|idea
      🔧|wrench|fix tool
      🔨|hammer|build
      🛠️|hammer and wrench|tools build
      ⚙️|gear|settings
      🧪|test tube|test experiment
      🐛|bug|bug issue
      🧩|puzzle piece|component
      📦|package|ship npm
      📊|bar chart|stats
      📈|chart increasing|growth up
      💻|laptop|computer code
      📱|mobile phone|phone mobile
      ⌨️|keyboard|type
      🖥️|desktop computer|desktop
      🔒|locked|lock private
      🔑|key|key access
      🔔|bell|notification
      📣|megaphone|announce
      🏆|trophy|win
      🎯|bullseye|dart target
      ⏰|alarm clock|time
      ⏳|hourglass not done|wait
      📅|calendar|date
      🎁|wrapped gift|gift present
    `)
  },
  {
    id: "symbols",
    title: "Symbols",
    emojis: list(`
      ❤️|red heart|heart love
      🧡|orange heart|heart
      💛|yellow heart|heart
      💚|green heart|heart
      💙|blue heart|heart
      💜|purple heart|heart
      🖤|black heart|heart
      🤍|white heart|heart
      💯|hundred points|100 perfect
      ✅|check mark button|white_check_mark done yes
      ✔️|check mark|heavy_check_mark yes
      ❌|cross mark|x no wrong
      ⚠️|warning|caution
      ⛔|no entry|stop blocked
      🚫|prohibited|no forbidden
      ❓|red question mark|question
      ❗|red exclamation mark|exclamation important
      ‼️|double exclamation mark|bangbang
      ➕|plus|add
      ➖|minus|remove
      🔴|red circle|red
      🟠|orange circle|orange
      🟡|yellow circle|yellow
      🟢|green circle|green
      🔵|blue circle|blue
      🟣|purple circle|purple
      🆗|ok button|ok
      🆕|new button|new
      🔁|repeat button|repeat again
      ♿|wheelchair symbol|accessibility a11y
    `)
  }
]

export const allEmoji: EmojiEntry[] = emojiCategories.flatMap((category) => category.emojis)

export function findEmoji(emoji: string): EmojiEntry | undefined {
  return allEmoji.find((entry) => entry.emoji === emoji)
}

/** Its shortcode, from its name: "thumbs up" is :thumbs_up:. */
export function shortcode(entry: EmojiEntry): string {
  return `:${entry.name.toLowerCase().replace(/[^a-z0-9+-]+/g, "_")}:`
}

/** Emoji whose name or keywords start with what's typed, best first: names, then keywords, then anywhere. */
export function searchEmoji(query: string, limit = Infinity): EmojiEntry[] {
  const typed = query.trim().toLowerCase().replace(/_/g, " ")
  if (!typed) return []
  const rank = (entry: EmojiEntry) => {
    const words = `${entry.name} ${entry.keywords}`.toLowerCase().replace(/_/g, " ")
    if (entry.name.toLowerCase().startsWith(typed)) return 0
    if (words.split(" ").some((word) => word.startsWith(typed))) return 1
    if (words.includes(typed)) return 2
    return 3
  }
  return allEmoji
    .map((entry) => ({ entry, rank: rank(entry) }))
    .filter(({ rank }) => rank < 3)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

export const skinTones = [
  { modifier: "", name: "Default" },
  { modifier: "\u{1F3FB}", name: "Light" },
  { modifier: "\u{1F3FC}", name: "Medium-light" },
  { modifier: "\u{1F3FD}", name: "Medium" },
  { modifier: "\u{1F3FE}", name: "Medium-dark" },
  { modifier: "\u{1F3FF}", name: "Dark" }
]

/** The emoji in a skin tone: the modifier follows its first character, in place of any presentation selector. */
export function withTone(entry: EmojiEntry, modifier: string): string {
  if (!entry.tone || !modifier) return entry.emoji
  const [first, ...rest] = [...entry.emoji.replace(/️/g, "")]
  return [first, modifier, ...rest].join("")
}
