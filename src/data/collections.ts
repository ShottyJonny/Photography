export type Collection = {
  id: string
  name: string
  description: string
  thumbnail: string // Featured image for the collection
  productIds: string[] // References to product IDs
  literature?: string // Optional longer-form text content
}

export const collections: Collection[] = [
  {
    id: 'relics',
    name: 'Relics',
    description: 'Objects surviving from an earlier time, of historical or sentimental interest',
    thumbnail: '/images/thumbs/Grand Ring.jpg',
    productIds: [
      'print-deterioration',
      'print-fade-away',
      'print-gathering',
      'print-goalless',
      'print-had-to-go',
      'print-lost-innocence',
      'print-place-to-rest',
      'print-save-a-seat',
      'print-sidelines',
    ],
    literature: `Relics, as defined by Oxford, are "an object surviving from an earlier time, especially one of historical or sentimental interest." It's that second part I find interesting, that sentimentality has similar value as historical significance (at least by Oxford's definition). Though it is something I have always believed, I have felt hard-pressed to find corroboration of this. Planned obsolescence and consumerism culture have long whittled our sentimentalism, everything has its purpose and everything will someday have a new, better version to supplant it. How efficiently tragic.\n\nI learned recently my mother has my baby teeth. At the time of writing this I am 26 years old, and originally it puzzled me that she would keep something like that. What other purpose could they possibly serve? They were made to be disposed of, and 28 newer and better versions were coming to supplant them. How utterly asinine.\n\nOh. Right. Sentiment.\n\nVideo Essayist Jacob Geller published a project entitled "How Can We Bear To Throw Anything Away" in which he mostly discusses the concept of lost media, media that is either essentially or literally lost to time. Inaccessible by virtue of inaccessibility or by simply no longer existing. The full broadcast of Super Bowl I falls into this void, as CBS and NBC would tape over it later. On a personal note one of the first photographs I took that made me fall in love with the artform has seemingly disappeared. It was a simple photo of a couple crossing a skyway. I know that I've taken far more evocative and important photographs since. I assume I wouldn't think it good enough to be presented, but I sure wish I had it.\n\nThe reality is we lose hold of or forget most things. Usually on purpose, occasionally not. Sometimes things are lost, decrepit, trapped out of reach; things we would rather have held on to, remembered or maintained. And occasionally we stick with things that no longer serve their purpose, we have no real use for them and disposal isn't worth the effort. It could be a memento from a simpler time, perhaps from a more trying time acting as a trophy for what we've overcome, a tribute to the things we have sacrificed; yet we cannot let go. Maybe we shouldn't.\n\nNot to advocate for hoarding, though I hope one day, when I've gone, those who cherished me will go through my belongings to discover what mattered to me that I inevitably forgot to mention. I hope they find evidence of all the places I've been. I hope they find the cameras that haven't functioned for decades. I hope they find my family portraits that I protested taking every Christmas. I hope they find the digital remains of projects I completed but never released.\n\nHell, I hope they find my baby teeth.`,
  },
]
