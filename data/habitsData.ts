import { HABIT_DESCRIPTIONS_HI } from './habitDescriptionsHi';

export type TimeBlock = 'Morning' | 'Workday' | 'Evening' | 'Lifestyle';
export type HabitPillar = 'Mental' | 'Physical' | 'Social' | 'Spiritual';

export interface Habit {
  habitId: string;
  timeBlock: TimeBlock;
  pillar: HabitPillar;
  habitName: string;
  habitNameHi?: string;
  description: string;
}

export const HABITS: Habit[] = [
  // ─── MORNING / MENTAL ───
  { habitId: 'MM01', timeBlock: 'Morning', pillar: 'Mental', habitName: 'Intention Setting', habitNameHi: 'इरादा तय करना', description: 'Write one clear intention for the day before checking your phone.' },
  { habitId: 'MM02', timeBlock: 'Morning', pillar: 'Mental', habitName: 'Gratitude Journaling', habitNameHi: 'कृतज्ञता डायरी', description: 'Note three things you\'re grateful for to prime a positive mindset.' },
  { habitId: 'MM03', timeBlock: 'Morning', pillar: 'Mental', habitName: 'Morning Pages', habitNameHi: 'सुबह के पन्ने', description: 'Write three pages of stream-of-consciousness to clear mental clutter.' },
  { habitId: 'MM04', timeBlock: 'Morning', pillar: 'Mental', habitName: 'News-Free Morning', habitNameHi: 'समाचार-मुक्त सुबह', description: 'Avoid news and social media for the first 30 minutes after waking.' },
  { habitId: 'MM05', timeBlock: 'Morning', pillar: 'Mental', habitName: 'Visualisation', habitNameHi: 'कल्पना-दर्शन', description: 'Spend 5 minutes vividly imagining your ideal outcome for the day ahead.' },
  { habitId: 'MM06', timeBlock: 'Morning', pillar: 'Mental', habitName: 'Word of the Day', habitNameHi: 'दिन का शब्द', description: 'Choose one word as your daily theme and anchor decisions to it.' },

  // ─── MORNING / PHYSICAL ───
  { habitId: 'MP01', timeBlock: 'Morning', pillar: 'Physical', habitName: 'Hydrate on Waking', habitNameHi: 'उठते ही पानी पीना', description: 'Drink a full glass of water within 5 minutes of getting out of bed.' },
  { habitId: 'MP02', timeBlock: 'Morning', pillar: 'Physical', habitName: 'Morning Stretch', habitNameHi: 'सुबह की स्ट्रेचिंग', description: 'Do 5 minutes of gentle stretching to awaken muscles and joints.' },
  { habitId: 'MP03', timeBlock: 'Morning', pillar: 'Physical', habitName: 'Cold Shower Finish', habitNameHi: 'ठंडे पानी से स्नान', description: 'End your shower with 30 seconds of cold water to boost alertness.' },
  { habitId: 'MP04', timeBlock: 'Morning', pillar: 'Physical', habitName: 'Morning Walk', habitNameHi: 'सुबह की सैर', description: 'Take a brisk 10-minute walk outside to get light exposure and move your body.' },
  { habitId: 'MP05', timeBlock: 'Morning', pillar: 'Physical', habitName: 'No-Phone Breakfast', habitNameHi: 'फ़ोन-मुक्त नाश्ता', description: 'Eat your first meal mindfully without any screens.' },
  { habitId: 'MP06', timeBlock: 'Morning', pillar: 'Physical', habitName: 'Sun Exposure', habitNameHi: 'धूप में बैठना', description: 'Spend 5 minutes in natural sunlight within an hour of waking to set your circadian rhythm.' },

  // ─── MORNING / SOCIAL ───
  { habitId: 'MS01', timeBlock: 'Morning', pillar: 'Social', habitName: 'Good Morning Message', habitNameHi: 'शुभ प्रभात संदेश', description: 'Send a warm, genuine good morning message to someone you care about.' },
  { habitId: 'MS02', timeBlock: 'Morning', pillar: 'Social', habitName: 'Family Check-In', habitNameHi: 'परिवार से जुड़ना', description: 'Spend 5 minutes of undivided attention with a family member before the day begins.' },
  { habitId: 'MS03', timeBlock: 'Morning', pillar: 'Social', habitName: 'Compliment Someone', habitNameHi: 'किसी की प्रशंसा करना', description: 'Offer a sincere compliment to the first person you interact with today.' },
  { habitId: 'MS04', timeBlock: 'Morning', pillar: 'Social', habitName: 'Reach Out First', habitNameHi: 'पहल करना', description: 'Be the first to initiate conversation instead of waiting for others.' },
  { habitId: 'MS05', timeBlock: 'Morning', pillar: 'Social', habitName: 'Pray for Others', habitNameHi: 'दूसरों के लिए प्रार्थना', description: 'Take a moment to think about the wellbeing of three people in your life.' },

  // ─── MORNING / SPIRITUAL ───
  { habitId: 'MSP01', timeBlock: 'Morning', pillar: 'Spiritual', habitName: 'Morning Meditation', habitNameHi: 'प्रातः ध्यान', description: 'Sit in silence for 5–10 minutes, observing your breath without judgement.' },
  { habitId: 'MSP02', timeBlock: 'Morning', pillar: 'Spiritual', habitName: 'Sacred Reading', habitNameHi: 'पवित्र पठन', description: 'Read one page from a book that nourishes your spirit before the day begins.' },
  { habitId: 'MSP03', timeBlock: 'Morning', pillar: 'Spiritual', habitName: 'Morning Prayer', habitNameHi: 'प्रातः प्रार्थना', description: 'Speak or think a short prayer or affirmation that aligns with your values.' },
  { habitId: 'MSP04', timeBlock: 'Morning', pillar: 'Spiritual', habitName: 'Nature Moment', habitNameHi: 'प्रकृति के साथ पल', description: 'Step outside and observe one natural detail — a bird, leaf, or cloud — with full attention.' },
  { habitId: 'MSP05', timeBlock: 'Morning', pillar: 'Spiritual', habitName: 'Breath Awareness', habitNameHi: 'श्वास जागरूकता', description: 'Take ten slow, conscious breaths before your feet hit the floor.' },
  { habitId: 'MSP06', timeBlock: 'Morning', pillar: 'Spiritual', habitName: 'Mantra Recitation', habitNameHi: 'मंत्र जाप', description: 'Repeat a meaningful mantra or affirmation ten times with genuine feeling.' },

  // ─── WORKDAY / MENTAL ───
  { habitId: 'WM01', timeBlock: 'Workday', pillar: 'Mental', habitName: 'Pomodoro Focus', habitNameHi: 'पोमोडोरो फ़ोकस', description: 'Work in 25-minute focused sprints with a 5-minute break between each.' },
  { habitId: 'WM02', timeBlock: 'Workday', pillar: 'Mental', habitName: 'Single-Tab Rule', habitNameHi: 'एक टैब नियम', description: 'Keep only one browser tab open per task to reduce cognitive load.' },
  { habitId: 'WM03', timeBlock: 'Workday', pillar: 'Mental', habitName: 'Inbox Zero Sprint', habitNameHi: 'इनबॉक्स ज़ीरो', description: 'Spend 10 minutes clearing or triaging your inbox to reclaim mental space.' },
  { habitId: 'WM04', timeBlock: 'Workday', pillar: 'Mental', habitName: 'Brain Dump', habitNameHi: 'मन उड़ेलना', description: 'Write every pending thought onto paper to free up working memory.' },
  { habitId: 'WM05', timeBlock: 'Workday', pillar: 'Mental', habitName: 'Learning Snippet', habitNameHi: 'सीखने का अंश', description: 'Read or watch a 5-minute lesson on a skill or topic you want to develop.' },
  { habitId: 'WM06', timeBlock: 'Workday', pillar: 'Mental', habitName: 'Mindful Transition', habitNameHi: 'सजग परिवर्तन', description: 'Between meetings or tasks, pause for 60 seconds to reset your mental state.' },
  { habitId: 'WM07', timeBlock: 'Workday', pillar: 'Mental', habitName: 'Decision Batching', habitNameHi: 'निर्णयों का समूह', description: 'Group small decisions together rather than handling them scattered through the day.' },

  // ─── WORKDAY / PHYSICAL ───
  { habitId: 'WP01', timeBlock: 'Workday', pillar: 'Physical', habitName: 'Hydration Check', habitNameHi: 'पानी की याद', description: 'Drink a glass of water at the top of every hour during the workday.' },
  { habitId: 'WP02', timeBlock: 'Workday', pillar: 'Physical', habitName: 'Desk Stretch Break', habitNameHi: 'डेस्क स्ट्रेच ब्रेक', description: 'Stand and do a 2-minute stretch every 90 minutes of sitting.' },
  { habitId: 'WP03', timeBlock: 'Workday', pillar: 'Physical', habitName: 'Walking Meeting', habitNameHi: 'चलते-चलते बैठक', description: 'Take at least one call or meeting while walking instead of sitting.' },
  { habitId: 'WP04', timeBlock: 'Workday', pillar: 'Physical', habitName: 'Posture Reset', habitNameHi: 'मुद्रा सुधार', description: 'Set a reminder every hour to check and correct your posture and screen height.' },
  { habitId: 'WP05', timeBlock: 'Workday', pillar: 'Physical', habitName: 'Lunch Away from Desk', habitNameHi: 'डेस्क से दूर दोपहर का खाना', description: 'Eat your midday meal away from your work station to give your mind a break.' },
  { habitId: 'WP06', timeBlock: 'Workday', pillar: 'Physical', habitName: '20-20-20 Eye Rule', habitNameHi: '20-20-20 आँख नियम', description: 'Every 20 minutes, look at something 20 feet away for 20 seconds to rest your eyes.' },

  // ─── WORKDAY / SOCIAL ───
  { habitId: 'WSO01', timeBlock: 'Workday', pillar: 'Social', habitName: 'Acknowledge a Colleague', habitNameHi: 'सहकर्मी की सराहना', description: 'Genuinely recognise one colleague\'s effort or contribution today.' },
  { habitId: 'WSO02', timeBlock: 'Workday', pillar: 'Social', habitName: 'Active Listening', habitNameHi: 'सक्रिय श्रवण', description: 'In your next conversation, focus entirely on listening without planning your reply.' },
  { habitId: 'WSO03', timeBlock: 'Workday', pillar: 'Social', habitName: 'Helpful Reply', habitNameHi: 'सहायक उत्तर', description: 'Go out of your way to give a thorough, helpful response to a message or question.' },
  { habitId: 'WSO04', timeBlock: 'Workday', pillar: 'Social', habitName: 'Check on a Friend', habitNameHi: 'दोस्त का हाल पूछना', description: 'Send a quick message to a friend you haven\'t spoken to recently.' },
  { habitId: 'WSO05', timeBlock: 'Workday', pillar: 'Social', habitName: 'No Gossip Rule', habitNameHi: 'गपशप-मुक्त दिन', description: 'Consciously avoid gossiping or speaking negatively about others for the day.' },
  { habitId: 'WSO06', timeBlock: 'Workday', pillar: 'Social', habitName: 'Share Knowledge', habitNameHi: 'ज्ञान साझा करना', description: 'Share a useful article, insight, or resource with someone who would benefit.' },

  // ─── WORKDAY / SPIRITUAL ───
  { habitId: 'WSP01', timeBlock: 'Workday', pillar: 'Spiritual', habitName: 'Midday Pause', habitNameHi: 'दोपहर का विराम', description: 'Take 3 minutes at midday to close your eyes, breathe, and reconnect with your purpose.' },
  { habitId: 'WSP02', timeBlock: 'Workday', pillar: 'Spiritual', habitName: 'Values Check', habitNameHi: 'मूल्य परीक्षण', description: 'Ask yourself: "Is what I\'m doing right now aligned with what matters most to me?"' },
  { habitId: 'WSP03', timeBlock: 'Workday', pillar: 'Spiritual', habitName: 'Gratitude Pause', habitNameHi: 'कृतज्ञता विराम', description: 'Identify one thing about your work or colleagues that you genuinely appreciate.' },
  { habitId: 'WSP04', timeBlock: 'Workday', pillar: 'Spiritual', habitName: 'Serve First', habitNameHi: 'पहले सेवा', description: 'Do something helpful for another person before focusing on your own tasks.' },
  { habitId: 'WSP05', timeBlock: 'Workday', pillar: 'Spiritual', habitName: 'Mindful Eating', habitNameHi: 'सजग भोजन', description: 'Eat lunch with full attention — no screens, no rushing, just the food and your senses.' },

  // ─── EVENING / MENTAL ───
  { habitId: 'EM01', timeBlock: 'Evening', pillar: 'Mental', habitName: 'Daily Review', habitNameHi: 'दैनिक समीक्षा', description: 'Spend 5 minutes reviewing what went well and what you\'d change about today.' },
  { habitId: 'EM02', timeBlock: 'Evening', pillar: 'Mental', habitName: 'Tomorrow\'s Plan', habitNameHi: 'कल की योजना', description: 'Write your top three priorities for tomorrow before you close out for the day.' },
  { habitId: 'EM03', timeBlock: 'Evening', pillar: 'Mental', habitName: 'Digital Sunset', habitNameHi: 'डिजिटल सूर्यास्त', description: 'Put away all screens one hour before bed to let your mind unwind naturally.' },
  { habitId: 'EM04', timeBlock: 'Evening', pillar: 'Mental', habitName: 'Reading Before Bed', habitNameHi: 'सोने से पहले पढ़ना', description: 'Read a physical book for at least 20 minutes to ease the transition to sleep.' },
  { habitId: 'EM05', timeBlock: 'Evening', pillar: 'Mental', habitName: 'Worry Dump', habitNameHi: 'चिंता उड़ेलना', description: 'Write any anxious thoughts on paper so your mind can let them go for the night.' },
  { habitId: 'EM06', timeBlock: 'Evening', pillar: 'Mental', habitName: 'No Work After 8pm', habitNameHi: 'रात 8 बजे बाद काम बंद', description: 'Set a firm boundary: no work emails or messages after a chosen evening hour.' },

  // ─── EVENING / PHYSICAL ───
  { habitId: 'EP01', timeBlock: 'Evening', pillar: 'Physical', habitName: 'Evening Walk', habitNameHi: 'शाम की सैर', description: 'Take a 15-minute walk after dinner to aid digestion and decompress.' },
  { habitId: 'EP02', timeBlock: 'Evening', pillar: 'Physical', habitName: 'Light Yoga', habitNameHi: 'हल्का योग', description: 'Do 10 minutes of gentle yoga or floor stretches to release the day\'s tension.' },
  { habitId: 'EP03', timeBlock: 'Evening', pillar: 'Physical', habitName: 'Sleep Prep Routine', habitNameHi: 'नींद की तैयारी', description: 'Follow a consistent wind-down routine: dim lights, brush teeth, same bedtime.' },
  { habitId: 'EP04', timeBlock: 'Evening', pillar: 'Physical', habitName: 'No Caffeine After 2pm', habitNameHi: 'दोपहर बाद कैफ़ीन बंद', description: 'Avoid caffeine after early afternoon to protect sleep quality.' },
  { habitId: 'EP05', timeBlock: 'Evening', pillar: 'Physical', habitName: 'Cool Room Sleep', habitNameHi: 'ठंडे कमरे में नींद', description: 'Set your bedroom temperature between 16–19°C for optimal deep sleep.' },
  { habitId: 'EP06', timeBlock: 'Evening', pillar: 'Physical', habitName: 'Tech-Free Bedroom', habitNameHi: 'तकनीक-मुक्त शयनकक्ष', description: 'Keep your phone out of the bedroom or on aeroplane mode during sleep hours.' },

  // ─── EVENING / SOCIAL ───
  { habitId: 'ESO01', timeBlock: 'Evening', pillar: 'Social', habitName: 'Quality Time', habitNameHi: 'गुणवत्तापूर्ण समय', description: 'Spend 20 minutes of screen-free, focused time with someone you live with or love.' },
  { habitId: 'ESO02', timeBlock: 'Evening', pillar: 'Social', habitName: 'Phone Call', habitNameHi: 'फ़ोन कॉल', description: 'Call — not text — a friend or family member just to hear their voice.' },
  { habitId: 'ESO03', timeBlock: 'Evening', pillar: 'Social', habitName: 'Thank You Message', habitNameHi: 'धन्यवाद संदेश', description: 'Send a genuine thank-you to someone who helped you today, however small.' },
  { habitId: 'ESO04', timeBlock: 'Evening', pillar: 'Social', habitName: 'Shared Meal', habitNameHi: 'साथ भोजन', description: 'Eat dinner with another person and give them your full attention.' },
  { habitId: 'ESO05', timeBlock: 'Evening', pillar: 'Social', habitName: 'Reconnect Moment', habitNameHi: 'जुड़ाव का पल', description: 'Ask a loved one about their day and listen without offering advice unless asked.' },
  { habitId: 'ESO06', timeBlock: 'Evening', pillar: 'Social', habitName: 'Compliment Someone', habitNameHi: 'किसी की प्रशंसा करना', description: 'Give a sincere, specific compliment to someone in your life before the day ends.' },

  // ─── EVENING / SPIRITUAL ───
  { habitId: 'ESP01', timeBlock: 'Evening', pillar: 'Spiritual', habitName: 'Evening Reflection', habitNameHi: 'सायंकालीन चिंतन', description: 'Sit quietly for 5 minutes and reflect on what today taught you about yourself.' },
  { habitId: 'ESP02', timeBlock: 'Evening', pillar: 'Spiritual', habitName: 'Forgiveness Practice', habitNameHi: 'क्षमा का अभ्यास', description: 'Mentally release any resentment from the day — toward others or yourself.' },
  { habitId: 'ESP03', timeBlock: 'Evening', pillar: 'Spiritual', habitName: 'Evening Prayer', habitNameHi: 'संध्या प्रार्थना', description: 'Offer thanks for the day\'s gifts — including the difficult ones — before you sleep.' },
  { habitId: 'ESP04', timeBlock: 'Evening', pillar: 'Spiritual', habitName: 'Candle/Lamp Lighting', habitNameHi: 'दीप प्रज्वलन', description: 'Light a candle or lamp and sit in its presence for a few quiet minutes.' },
  { habitId: 'ESP05', timeBlock: 'Evening', pillar: 'Spiritual', habitName: 'Body Scan', habitNameHi: 'शरीर स्कैन', description: 'Lie down and mentally scan from head to toe, releasing tension and settling into rest.' },

  // ─── LIFESTYLE / MENTAL ───
  { habitId: 'LM01', timeBlock: 'Lifestyle', pillar: 'Mental', habitName: 'Weekly Learning', habitNameHi: 'साप्ताहिक सीख', description: 'Dedicate one hour per week to learning something entirely outside your usual domain.' },
  { habitId: 'LM02', timeBlock: 'Lifestyle', pillar: 'Mental', habitName: 'Journaling Habit', habitNameHi: 'डायरी लिखने की आदत', description: 'Write in a journal at least three times per week to process your thoughts.' },
  { habitId: 'LM03', timeBlock: 'Lifestyle', pillar: 'Mental', habitName: 'Monthly Reflection', habitNameHi: 'मासिक चिंतन', description: 'At the end of each month, review your goals and adjust based on what you\'ve learned.' },
  { habitId: 'LM04', timeBlock: 'Lifestyle', pillar: 'Mental', habitName: 'Therapy or Coaching', habitNameHi: 'थेरेपी या कोचिंग', description: 'Invest in regular sessions with a therapist, coach, or mentor.' },
  { habitId: 'LM05', timeBlock: 'Lifestyle', pillar: 'Mental', habitName: 'Dopamine Fast', habitNameHi: 'डोपामाइन उपवास', description: 'Once a week, spend a few hours without social media, games, or passive entertainment.' },
  { habitId: 'LM06', timeBlock: 'Lifestyle', pillar: 'Mental', habitName: 'Book a Month', habitNameHi: 'महीने में एक किताब', description: 'Read at least one non-fiction book per month to keep expanding your worldview.' },

  // ─── LIFESTYLE / PHYSICAL ───
  { habitId: 'LP01', timeBlock: 'Lifestyle', pillar: 'Physical', habitName: 'Consistent Bedtime', habitNameHi: 'नियमित सोने का समय', description: 'Go to bed and wake up at the same time every day — even on weekends.' },
  { habitId: 'LP02', timeBlock: 'Lifestyle', pillar: 'Physical', habitName: 'Exercise 3x/Week', habitNameHi: 'सप्ताह में 3 बार व्यायाम', description: 'Complete at least three intentional workouts per week, any form of movement.' },
  { habitId: 'LP03', timeBlock: 'Lifestyle', pillar: 'Physical', habitName: 'Cook at Home', habitNameHi: 'घर पर खाना बनाना', description: 'Prepare the majority of your meals at home using whole, unprocessed ingredients.' },
  { habitId: 'LP04', timeBlock: 'Lifestyle', pillar: 'Physical', habitName: 'Step Count', habitNameHi: 'कदमों की गिनती', description: 'Aim for 8,000–10,000 steps daily as baseline movement.' },
  { habitId: 'LP05', timeBlock: 'Lifestyle', pillar: 'Physical', habitName: 'Alcohol-Free Days', habitNameHi: 'शराब-मुक्त दिन', description: 'Choose at least three alcohol-free days every week.' },
  { habitId: 'LP06', timeBlock: 'Lifestyle', pillar: 'Physical', habitName: 'Annual Health Check', habitNameHi: 'वार्षिक स्वास्थ्य जाँच', description: 'Book and attend a comprehensive health check-up once a year.' },

  // ─── LIFESTYLE / SOCIAL ───
  { habitId: 'LSO01', timeBlock: 'Lifestyle', pillar: 'Social', habitName: 'Weekly Catch-Up', habitNameHi: 'साप्ताहिक मुलाकात', description: 'Schedule at least one meaningful social interaction per week — in person or by call.' },
  { habitId: 'LSO02', timeBlock: 'Lifestyle', pillar: 'Social', habitName: 'Community Involvement', habitNameHi: 'समुदाय में भागीदारी', description: 'Participate in a community group, club, or volunteer activity at least monthly.' },
  { habitId: 'LSO03', timeBlock: 'Lifestyle', pillar: 'Social', habitName: 'Birthday Remembrance', habitNameHi: 'जन्मदिन याद रखना', description: 'Make the effort to remember and acknowledge important dates for people you love.' },
  { habitId: 'LSO04', timeBlock: 'Lifestyle', pillar: 'Social', habitName: 'Generous Listening', habitNameHi: 'उदार श्रवण', description: 'In every important conversation this week, listen more than you speak.' },
  { habitId: 'LSO05', timeBlock: 'Lifestyle', pillar: 'Social', habitName: 'Digital Detox Day', habitNameHi: 'डिजिटल डिटॉक्स दिन', description: 'Once a month, spend a full day away from social media to reconnect with people in person.' },
  { habitId: 'LSO06', timeBlock: 'Lifestyle', pillar: 'Social', habitName: 'Mentorship', habitNameHi: 'मार्गदर्शन', description: 'Offer guidance or support to someone less experienced in an area where you have knowledge.' },

  // ─── LIFESTYLE / SPIRITUAL ───
  { habitId: 'LSP01', timeBlock: 'Lifestyle', pillar: 'Spiritual', habitName: 'Weekly Sabbath', habitNameHi: 'साप्ताहिक विश्राम', description: 'Designate one day or half-day per week for rest, reflection, and renewal.' },
  { habitId: 'LSP02', timeBlock: 'Lifestyle', pillar: 'Spiritual', habitName: 'Nature Immersion', habitNameHi: 'प्रकृति में डुबकी', description: 'Spend at least one hour in nature each week without your phone.' },
  { habitId: 'LSP03', timeBlock: 'Lifestyle', pillar: 'Spiritual', habitName: 'Acts of Service', habitNameHi: 'सेवा के कार्य', description: 'Do something genuinely helpful for another person each week, expecting nothing in return.' },
  { habitId: 'LSP04', timeBlock: 'Lifestyle', pillar: 'Spiritual', habitName: 'Fasting Practice', habitNameHi: 'उपवास का अभ्यास', description: 'Observe a periodic fast — food, social media, or another attachment — to build inner discipline.' },
  { habitId: 'LSP05', timeBlock: 'Lifestyle', pillar: 'Spiritual', habitName: 'Sacred Space', habitNameHi: 'पवित्र स्थान', description: 'Designate a corner of your home for quiet reflection, prayer, or meditation.' },
  { habitId: 'LSP06', timeBlock: 'Lifestyle', pillar: 'Spiritual', habitName: 'Gratitude Letter', habitNameHi: 'कृतज्ञता पत्र', description: 'Once a month, write a heartfelt letter of gratitude to someone who has shaped your life.' },
];

export const HABIT_COUNT = HABITS.length;

/** Returns localized habit name: Hindi if lang='hi' and translation exists, else English. */
export function getLocalHabitName(habit: Pick<Habit, 'habitName' | 'habitNameHi'>, lang: string): string {
  return lang === 'hi' && habit.habitNameHi ? habit.habitNameHi : habit.habitName;
}

/** Returns localized habit description: Hindi if lang='hi', else English. */
export function getLocalHabitDesc(habit: Pick<Habit, 'habitId' | 'description'>, lang: string): string {
  if (lang !== 'hi') return habit.description;
  return HABIT_DESCRIPTIONS_HI[habit.habitId] ?? habit.description;
}

/** Look up a habit by its English name and return the localized name. */
export function getLocalHabitNameByEnglish(englishName: string, lang: string): string {
  if (lang !== 'hi') return englishName;
  const found = HABITS.find(h => h.habitName === englishName);
  return found?.habitNameHi ?? englishName;
}
