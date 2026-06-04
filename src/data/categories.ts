/**
 * @file categories.ts
 * @description Vocabulary category definitions.
 *
 * Each category has:
 * - id, name, icon, color — for UI rendering
 * - keywords — English substrings matched against word.en (lowercase)
 *   to auto-assign categories without modifying vocabulary.json
 *
 * Matching priority: first match wins. The final "general" entry is a
 * catch-all for grammar words, particles, and abstract connectives.
 */

export interface VocabCategory {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  description: string;
  /** Tailwind bg + text color pair for the card */
  color: {
    bg: string;
    text: string;
    border: string;
    badge: string;
  };
  /** Lowercase substrings matched against word.en */
  keywords: string[];
}

export const CATEGORIES: VocabCategory[] = [
  {
    id: 'food',
    name: 'Food & Dining',
    nameZh: '饮食',
    icon: '🍜',
    description: 'Eating, cooking, restaurants and flavours',
    color: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' },
    keywords: [
      'eat','food','drink','meal','rice','noodle','meat','vegetable',
      'fruit','cook','restaurant','delicious','hungry','taste','water',
      'tea','coffee','bread','soup','fish','chicken','beef','pork',
      'cake','beer','bowl','plate','chopstick','menu','fridge','kitchen',
      'flavor','snack','thirsty','sweet','bottle','supermarket',
    ],
  },
  {
    id: 'family',
    name: 'Family & Home',
    nameZh: '家庭',
    icon: '👨‍👩‍👧',
    description: 'Family members, home and relationships',
    color: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', badge: 'bg-pink-100 text-pink-700' },
    keywords: [
      'family','father','mother','parent','child','son','daughter',
      'brother','sister','husband','wife','grandpa','grandma','grandparent',
      'uncle','aunt','cousin','relative','marry','wedding','baby','birth',
      'home','house','live','neighbor','bathroom','bedroom',
    ],
  },
  {
    id: 'feelings',
    name: 'Emotions & Feelings',
    nameZh: '情感',
    icon: '❤️',
    description: 'Emotions, moods and inner states',
    color: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
    keywords: [
      'feel','happy','sad','angry','love','hate','afraid','worry',
      'excited','boring','tired','lonely','comfortable','surprise',
      'laugh','cry','emotion','hope','miss','regret','proud','embarrass',
      'nervous','calm','peace','like','enjoy','dislike','hate','mood',
      'satisfied','enthusiastic','serious','interested','care','afraid',
    ],
  },
  {
    id: 'health',
    name: 'Health & Body',
    nameZh: '健康',
    icon: '🏥',
    description: 'Health, body, medicine and exercise',
    color: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
    keywords: [
      'health','sick','hospital','doctor','medicine','pain','fever',
      'cold','injury','exercise','rest','sleep','body','heart','mind',
      'disease','symptom','pharmacy','brush teeth','nose','ear','mouth',
      'foot','leg','hair','eye','face','hand','back','bone','blood',
      'catch cold','headache','stomach','fat','thin','height','weight',
    ],
  },
  {
    id: 'education',
    name: 'Education & Study',
    nameZh: '教育',
    icon: '🏫',
    description: 'School, learning, exams and knowledge',
    color: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
    keywords: [
      'study','school','class','student','teacher','learn','exam',
      'homework','grade','university','college','book','read','write',
      'language','course','knowledge','education','library','dictionary',
      'history','math','science','practice','review','paragraph','sentence',
      'blackboard','test','question','answer','smart','hardwork',
    ],
  },
  {
    id: 'work',
    name: 'Work & Business',
    nameZh: '工作',
    icon: '💼',
    description: 'Jobs, companies, commerce and economy',
    color: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-700' },
    keywords: [
      'work','job','company','office','business','meeting','boss',
      'employee','salary','earn','contract','client','market','economy',
      'manage','career','profession','colleague','manager','plan',
      'decide','improve','complete','build','create','develop','report',
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    nameZh: '旅行',
    icon: '✈️',
    description: 'Travel, transport, cities and directions',
    color: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700' },
    keywords: [
      'travel','trip','hotel','airport','train','bus','car','plane',
      'ticket','map','road','arrive','depart','passport','luggage','tour',
      'visit','city','country','abroad','foreign','direction','north',
      'south','east','west','street','subway','elevator','building',
      'park','bridge','climb','boat','ride',
    ],
  },
  {
    id: 'shopping',
    name: 'Shopping & Money',
    nameZh: '购物',
    icon: '🛍️',
    description: 'Buying, selling, prices and clothes',
    color: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
    keywords: [
      'buy','sell','shop','price','money','cost','cheap','expensive',
      'pay','store','market','product','brand','discount','order',
      'deliver','shirt','skirt','pants','hat','bag','leather shoes',
      'clothes','wear','measure word','kilogram','half','cent','thousand',
    ],
  },
  {
    id: 'weather',
    name: 'Weather & Nature',
    nameZh: '天气',
    icon: '🌤️',
    description: 'Weather, seasons, nature and environment',
    color: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700' },
    keywords: [
      'weather','rain','snow','sun','wind','cloud','hot','cold',
      'temperature','season','storm','forecast','spring','summer',
      'autumn','winter','flower','grass','tree','animal','nature',
      'environment','sky','mountain','river','lake','windy',
    ],
  },
  {
    id: 'time',
    name: 'Time & Dates',
    nameZh: '时间',
    icon: '🕐',
    description: 'Time expressions, dates and scheduling',
    color: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
    keywords: [
      'time','year','month','day','week','hour','minute','second',
      'today','tomorrow','yesterday','morning','afternoon','evening',
      'night','soon','already','still','again','late','early','long time',
      'just now','immediately','suddenly','often','always','never','when',
      'while','before','after','festival','schedule',
    ],
  },
  {
    id: 'communication',
    name: 'Communication',
    nameZh: '交流',
    icon: '💬',
    description: 'Speaking, language, media and technology',
    color: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700' },
    keywords: [
      'speak','say','talk','ask','answer','discuss','agree','disagree',
      'understand','explain','tell','inform','news','email','phone',
      'internet','computer','message','social','media','call','send',
      'receive','express','language','word','letter','report','program',
      'surf','network','chat','voice',
    ],
  },
  {
    id: 'arts',
    name: 'Arts & Leisure',
    nameZh: '文艺',
    icon: '🎭',
    description: 'Hobbies, arts, sports and entertainment',
    color: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-700' },
    keywords: [
      'hobby','sport','music','art','draw','paint','movie','film',
      'dance','sing','play','game','story','culture','history','show',
      'perform','concert','read','photo','visit','match','win','lose',
    ],
  },
  {
    id: 'numbers',
    name: 'Numbers & Measures',
    nameZh: '数量',
    icon: '🔢',
    description: 'Numbers, quantities, sizes and measurements',
    color: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', badge: 'bg-teal-100 text-teal-700' },
    keywords: [
      'number','count','calculate','percent','half','double','measure',
      'meter','kilogram','pair','layer','score','level','grade',
      'ten thousand','hundred','thousand','million',
    ],
  },
  {
    id: 'relationships',
    name: 'Social & Relationships',
    nameZh: '社交',
    icon: '🤝',
    description: 'Friends, society, manners and interactions',
    color: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-700' },
    keywords: [
      'friend','meet','help','support','thank','sorry','welcome',
      'please','polite','relationship','together','each other',
      'introduce','invite','visit','gift','respect','trust','honest',
    ],
  },
  {
    id: 'general',
    name: 'Grammar & Function',
    nameZh: '语法',
    icon: '📝',
    description: 'Grammar words, connectives and particles',
    color: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' },
    keywords: [], // catch-all — matches anything not caught above
  },
];

/** Map from category id → VocabCategory */
export const CATEGORY_MAP = new Map(CATEGORIES.map(c => [c.id, c]));
