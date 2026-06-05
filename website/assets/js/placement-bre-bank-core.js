(function (global) {
  'use strict';

  function q(no, section, prompt, A, B, C, D, correct, passageId) {
    return { no: no, section: section, prompt: prompt, options: [{ key: 'A', text: A }, { key: 'B', text: B }, { key: 'C', text: C }, { key: 'D', text: D }], correct: correct, passageId: passageId || '' };
  }

  function parseBank(title, audioUrl, passages, rows) {
    var lines = rows.trim().split('\n');
    var questions = lines.map(function(line) {
      var p = line.split('|');
      return q(parseInt(p[0], 10), p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8] || '');
    });
    return { title: title, audioUrl: audioUrl, passages: passages, questions: questions };
  }

  function buildTest2A() {
    var passages = {
      t2r1:
        'Starting next week, a new bike share programme will be available in the city centre. Passes are £365 for the year, £15 for a week, and £5 for a day. To sign up for the yearly pass, register online and you will receive a personal key card in the post. You can purchase weekly and daily passes online or at any of our bike stations with a credit or debit card. PIN codes will be provided for these passes.\n\n' +
        'Please note that there is a one-hour time limit on bike usage at all times. After one hour, you will be charged £2 for each additional hour until the bike is returned. Bikes can be returned to any station, as long as there is available docking space. You can check bike or docking space availability on our website or download our app so you can access the information on your mobile phones.\n\n' +
        'We have partnered with several bike shops around town that offer discounts on safety items such as glasses, night lights, and helmets. Please be safe and don\'t forget to wear your helmets. Show your bike pass or PIN code for in-store discounts.',
      t2r2:
        'B. Thomas (2 days ago)\n' +
        'We have been living in the Essex Flats for about six months now. The biggest problem we have are the floors, as you can hear your neighbour\'s every step. You will not just hear every step. You can feel it, too! At first we thought they just moved in and the noise would stop once they settle in, but it is never-ending. We love the location and the size of the flat, but the noise is constant.\n\n' +
        'J. Miller (one month ago)\n' +
        'Although the bedrooms and living area are quite big, the kitchen is rather small. It\'s difficult to move around when there\'s more than one person in the room. My roommate and I enjoy cooking together, but it is a tight squeeze. Another issue is the windows — they do not close fully, so it is hard to keep the flat warm in winter.',
      t2r3: 'Tadao Ando is a self-taught Japanese architect known for minimal design, use of concrete, and spiritual connection in architecture. He won the Pritzker Prize and designed famous works including the Church of Light.'
    };
    var rows =
`1|Listening|What is the woman looking for?|A tie|A gift|A sale|A sweater|B|
2|Listening|What does the word "quality" mean?|How good something is|What colour something is|What something looks like|How expensive something is|A|
3|Listening|Why does the woman choose the sweater?|It's on sale.|There are no ties.|She likes the colour.|She doesn't like the shirt.|C|
4|Listening|What will happen next?|The man looks for a shirt.|The woman pays for the gift.|The man gives the woman a discount.|The woman gives the gift to her brother.|B|
5|Listening|What can be recycled?|Clean food containers|Hot coffee cups|Plastic straws|Plastic bags|A|
6|Listening|What does the woman say about the recycling bin?|Everyone uses the bin.|All paper cups should go in the bin.|People know what to put in the bin.|Some things in the bin are recycled.|D|
7|Listening|What does "habit" mean?|Something you do often|Something you hate to do|Something you learn to do|Something you do very well|A|
8|Listening|What will the man do to help improve the problem?|Use paper straws.|Stop buying coffee.|Stop using food containers.|Learn about recycling rules.|A|
9|Listening|What does the woman like about her job?|Her co-workers|The location|The projects|Her boss|A|
10|Listening|What does the woman say about travelling for work?|She enjoys the experience.|She wants to do more of it.|It's too hard on her schedule.|She can do less of it next year.|D|
11|Listening|How does the man feel about being a dad?|Scared|Excited|Grateful|Worried|B|
12|Listening|Why did the man move out of the city?|To get more space|To make his wife happy|To be closer to his office|To be closer to his parents|A|
13|Listening|What does the woman say about cooking and working out?|She's too busy to do them.|She can only do one of them.|She doesn't enjoy doing them.|She doesn't know how to do them.|A|
14|Listening|What does the man say about lunch?|Prepare it in advance.|He doesn't have a plan.|There is no time to cook.|Buy healthier lunches at work.|A|
15|Listening|What is one way the man wants to create a healthy lifestyle?|Eat out only on weekends.|Cook dinner together every night.|Take classes at the gym.|Work out at the gym.|C|
16|Listening|How does the man feel about achieving a healthy lifestyle?|It is very expensive.|Busy schedule makes it difficult.|Planning ahead will make it possible.|Share responsibilities is impossible.|C|
17|Listening|What is the speaker's point of view on life?|Make time to chase dreams.|Life is too short for plans.|Decisions are always difficult.|Planning is more important than action.|A|
18|Listening|How did the speaker feel about preparing for this year-long trip?|Determined to succeed|Excited to travel the world|Fearful about the unknown|Worried about finances|A|
19|Listening|What was the speaker's goal in travelling?|Share experiences online|Make deep connections to places|Have a rich tourist experience|Visit many famous places|B|
20|Listening|According to the speaker, what is the most effective way to achieve a long-term goal?|Start a podcast channel.|Create detailed budget plans.|Break it down into smaller parts.|Ask community members for help.|C|
21|Grammar|They ____ a lot of time together recently.|had spent|will spend|were spending|have been spending|D|
22|Grammar|You ____ have seen Brian yesterday.|could|couldn't|should|shouldn't|B|
23|Grammar|When I lived in London, I ____ pick up coffee every morning.|would|should|must|might|A|
24|Grammar|They haven't been to the market, ____?|have they|haven't they|did they|didn't they|A|
25|Grammar|The plane ____ for takeoff yet.|has cleared|hasn't cleared|has to be cleared|hasn't been cleared|D|
26|Grammar|That was ____ sandwich.|so big|very big|such big|such a big|D|
27|Grammar|I ____ have waited so long to start this project.|can't|couldn't|wouldn't|shouldn't|D|
28|Grammar|He ____ hungry. He ate the entire pizza.|may be|must be|could have|must have been|D|
29|Grammar|The information is not only incomplete ____ inaccurate.|also|but also|moreover|in addition|B|
30|Grammar|Everyone ____ the party by the time Rebecca showed up.|left|has left|had left|had been left|C|
31|Grammar|____ home at 5 pm today, so I can call you then.|I walk|I have walked|I'll be walking|I've been walking|C|
32|Grammar|You can't wear shoes in the house. Please ____.|take off them|take them off|them off take|them take off|B|
33|Grammar|Sushi Lounge is closer. ____, Haru has better food.|However|As a result|In addition|Therefore|A|
34|Grammar|If you ____ more, your vocabulary would be better.|will read|had read|have read|are reading|B|
35|Grammar|Please don't touch the plates. They are ____.|hotter|the hottest|extremely hot|extreme heat|C|
36|Grammar|The Jazz Fest is a festival ____ every year.|happens|to happen|it happens|that happens|D|
37|Grammar|We have ____ money left, so we're going to shop more.|few|a few|little|a little|D|
38|Grammar|By the time we stopped for petrol, we ____ driving for four hours.|were|will be|had been|have been|C|
39|Grammar|He was late, ____ was unusual.|why|when|which|where|C|
40|Grammar|By this time tomorrow, I ____ in Paris.|will be arrived|will have arrived|will be arriving|have been arriving|B|
41|Grammar|If we ____ earlier, we wouldn't have missed the plane.|left|leave|had left|were leaving|C|
42|Grammar|I wish ____ harder when I was at university.|I study|I'll study|I'd studied|I'm studying|C|
43|Grammar|The package will ____ by the time you get home.|deliver|be delivered|be delivering|have been delivered|D|
44|Grammar|The picture ____ by a famous artist.|painted|was painted|was painting|has painted|B|
45|Grammar|Sara told me she ____ feeling well.|isn't|wasn't|hasn't|hadn't|B|
46|Grammar|We've ____ milk.|run off|run out|run in to|run out of|D|
47|Grammar|I ____ in Rome when I met Maurizio.|live|lived|was living|am living|C|
48|Grammar|My dream is ____ in London one day.|live|to live|like to live|have to live|B|
49|Grammar|This is the watch ____ on my twentieth birthday.|my grandfather gives me|my grandfather gave me|when my grandfather gave me|how my grandfather gives me|B|
50|Grammar|Anthony ____ to be a doctor, but studied business instead.|plans|will plan|was planning|has planned|C|
51|Vocabulary|I've never seen a painting like this. It's very ____.|usual|unique|regular|appropriate|B|
52|Vocabulary|The Jazz festival is a(n) ____ event.|current|standard|temporary|annual|D|
53|Vocabulary|I feel ____ I got the job.|patient|excited|confident|uncomfortable|C|
54|Vocabulary|Let me show you ____.|up|off|around|out|C|
55|Vocabulary|Paul is rich, so he can ____ to buy nice things.|afford|earn|spend|invest|A|
56|Vocabulary|My visa was ____, and passport is ready.|approved|enabled|offered|advised|A|
57|Vocabulary|This place looks ____.|domestic|familiar|common|urban|B|
58|Vocabulary|Could you ____ me your car?|lend|owe|borrow|permit|A|
59|Vocabulary|I'm sure he'll be here ____.|eventually|occasionally|immediately|frequently|A|
60|Vocabulary|I'm so tired. I ____ slept last night.|actually|hardly|carefully|practically|B|
61|Vocabulary|Kim is making great ____ to keep healthy lifestyle.|stress|purpose|effort|performance|C|
62|Vocabulary|Scientists spoke at the international ____.|business|announcement|conference|report|C|
63|Vocabulary|____ enjoy big end-of-season sales.|Applicants|Consumers|Researchers|Representatives|B|
64|Vocabulary|It is my ____ to take care of my parents.|trust|promise|obligation|guarantee|C|
65|Vocabulary|Don't forget to ____ the light.|turn up|turn in|turn off|turn over|C|
66|Vocabulary|The accident wasn't my ____.|fault|charge|complaint|disadvantage|A|
67|Vocabulary|The white sneakers started a social media ____.|law|habit|trend|tradition|C|
68|Vocabulary|I pay a monthly ____ to watch movies.|fee|price|pound|money|A|
69|Vocabulary|This golf bag is an ____ gift.|ideal|ordinary|typical|original|A|
70|Vocabulary|Sophia is a very ____ coach.|polite|capable|generous|practical|B|
71|Reading|Which statement is true?|Bike passes cost £2 per hour.|Key cards are available upon request.|Discounts are available for daily passes.|Bike passes can be purchased at bike stations.|D|t2r1
72|Reading|What is one rule for bike sharing?|You must wear a helmet.|Bikes must be returned every hour.|You must download app to pay.|Bikes must be returned to same station.|B|t2r1
73|Reading|What is the community attitude towards bike share programme?|Programme is expensive.|Not enough participants.|Community does not support it.|Bike safety is important to community.|D|t2r1
74|Reading|What is a common problem at Essex Flats?|The neighbours|The size|The floors|The location|C|t2r2
75|Reading|Why does J. Miller mention windows?|To talk about design|To describe special feature|To illustrate a problem|To explain how to keep warm|C|t2r2
76|Reading|Which statement is most likely true?|B. Thomas enjoys location.|B. Thomas doesn't mind parking.|J. Smith enjoys kitchen.|J. Smith is more positive.|A|t2r2
77|Reading|What is a distinguishing feature of Ando's work?|Complex design|Use of concrete|Physical beauty|Relation to Japan|B|t2r3
78|Reading|What is significant about Ando receiving Pritzker Prize?|No formal architecture education|He dislikes prizes|Highest award in architecture|Given to only few architects|A|t2r3
79|Reading|What is one of Ando's best-known works?|Imperial Hotel|Church of Light|Praemium Imperiale|RIBA Gold Medal|B|t2r3
80|Reading|What is main influence in Ando's work?|Famous architects|Interior design training|Former boxing career|Spiritual beliefs|D|t2r3`;
    return parseBank('British English Adult - Test 2 Form A', '../BRE_course_placement_test2_00.mp3', passages, rows);
  }

  function buildTest1A() {
    var passages = {
      t1r1:
        'From: Parking office\n' +
        'To: All workers in building 45\n\n' +
        'Starting tomorrow, the office car park will close for two weeks. We need to fix the car park floor. We will also draw new lines to add twenty more parking spaces.\n\n' +
        'For the next two weeks, you can park your car in the car park on the corner of High and 1st Street. It is the car park next to the Crowne Plaza Hotel. Show your company ID card, and you can park for free.\n\n' +
        'You can also park on High Street from 9 am to 5 pm. But please remember, you cannot park on 1st Street. If you have any questions, please call the parking office at 020-9809-9090.',
      t1r2:
        'I have lived and worked in Cornwall for most of my life. It is a very special place, and I am lucky to have spent most of my life in this beautiful area. I enjoy sharing with you my favourite places to go in Cornwall. My goal with this website is to give you helpful information about our community.\n\n' +
        'MUSEUMS: There are more than 70 museums in Cornwall. This page gives you a list of all the museums, their addresses, phone numbers, the times they open and close, and ticket prices.\n\n' +
        'SLEEP: You can find a list of all the hotels in the area on this page. There is also a list of private houses to rent. You can look through all the listings and make reservations directly on this page.\n\n' +
        'SWIM: This page includes information about all the beaches in the area. Most beaches are great for swimming, but some are dangerous — so read the rules on this page carefully. You can also find information about parking, food, and activities here.\n\n' +
        'I invite you to check back often as I share new information for the season. I hope you have a wonderful time during your visit to Cornwall.',
      t1r3:
        'Wilbur and Orville Wright were the American inventors of the first aeroplane. Wilbur was the older of the two brothers, and they always had a close relationship.\n\n' +
        'Their father, Milton Wright, often travelled for work, and he liked to bring back small toys for his children. When Wilbur was 11 years old, Milton brought a model aeroplane for his boys. The plane was made of wood and paper, and the brothers loved playing with it.\n\n' +
        'As adults, Wilbur and Orville continued to be interested in mechanics and the technology behind how things work. In the 1890s, bicycles became popular in the country. The brothers were good at fixing bicycles and began selling their own designs. They also studied the work of German flyer Otto Lilienthal. But when Lilienthal died in a flying accident, the brothers decided to start their own experiments with flying. They studied birds and how they used their wings to control their flying. They used a similar idea to invent their first plane, and on 17 December 1903, they succeeded. They flew the plane in the air for 59 seconds.\n\n' +
        'Many people, however, did not believe the brothers really flew an aeroplane. It had never been done before, and the American people didn\'t think flying was possible.\n\n' +
        'At that time, Europe was more open to new ideas. So, the brothers moved to Europe in 1908 and spent the next few years trying to sell their aeroplanes. It took Wilbur and Orville many years after their first flight to become famous, but their first 59-second flight changed the history of the world forever.'
    };
    var rows =
`1|Listening|Which subject does the woman like?|Math|Science|History|English|C|
2|Listening|What will the woman help the man do?|Write a paper.|Do homework.|Take notes.|Find a book.|B|
3|Listening|What does the woman do every Thursday?|Go to the library.|Have class.|Go to work.|Meet her teacher.|C|
4|Listening|What does the woman tell the man to do?|Come to her English class.|Meet her at work.|Work until five o'clock.|Bring his book to the library.|D|
5|Listening|What are the man and woman doing?|Listening to music|Watching videos|Talking on the phone|Shopping for a gift|D|
6|Listening|What does the man say about the phone?|The color is great.|The color is too bright.|The screen size is just right.|The screen size is too small.|B|
7|Listening|Why does the woman think John needs a bag?|He likes bags.|His bag is too small.|He needs a bag for work.|He doesn't have a bag.|C|
8|Listening|What will the man do next?|Call John on the phone.|Buy the headphones.|Look for a different bag.|Help woman find a new phone.|B|
9|Listening|Who is Julie going to dinner with?|Her husband|Her friend|Her kids|Her team|B|
10|Listening|Has Julie been to restaurant before?|No, never been.|No, doesn't like Italian.|Yes, many times.|Yes, with team last week.|C|
11|Listening|What does Mark ask Julie to do at restaurant?|Talk to Antonio.|Meet his wife and kids.|Ask about lunch menu.|Make a reservation.|D|
12|Listening|What is Julie and Mark's relationship?|Co-workers|Neighbours|Married|Friends|A|
13|Listening|Why is the woman late?|Missed her train.|Train was late.|There was a train accident.|She was hurt in accident.|C|
14|Listening|Why was the woman lost?|Wrong street.|Didn't know area well.|No one helped.|Took wrong bus.|B|
15|Listening|What was wrong with woman's phone?|She lost it.|No internet.|Couldn't text.|Left it at work.|B|
16|Listening|Why did she walk from Canal Street?|Couldn't find bus.|Thought walking was faster.|She wanted to walk.|People told her to walk.|B|
17|Listening|What is this talk about?|How to enjoy writing|How to start writing|How to get writing jobs|How to become better writer|C|
18|Listening|Why does speaker talk about writing presentations?|Important writing skill|Type of writing job|Way to practice writing|Way to share writing|B|
19|Listening|Best topic to write about?|Technology topics|Topics online|Topics you like|Popular topics|C|
20|Listening|Why should you make your own website?|Write topics you enjoy|People can find your writing online|Many writers have websites|Meet other writers online|B|
21|Grammar|____ me at the restaurant after work.|Meet|Meeting|Will meet|To meet|A|
22|Grammar|A: ____ you live? B: I live in Jamestown.|Where|Where is|Where do|Where does|C|
23|Grammar|I need to buy ____ bread.|any|some|many|much|B|
24|Grammar|The view is beautiful ____ the evening.|on|at|in|to|C|
25|Grammar|We enjoy ____ family dinner on Sundays.|have|had|to have|having|D|
26|Grammar|I ____ TV when you called.|watch|watched|am watching|was watching|D|
27|Grammar|I spoke to ____ hotel manager.|the|a|some|any|A|
28|Grammar|____ two libraries in the city.|They are|There is|It is|There are|D|
29|Grammar|I'd ____ a cup of tea please.|like|can like|could like|would like|D|
30|Grammar|I ____ early tomorrow morning.|am going to wake up|wake up|woke up|was waking up|A|
31|Grammar|____ the rain, they moved concert inside.|Despite|Because of|However|Even though|B|
32|Grammar|The cinema is ____ Hudson Street.|on|in|between|under|B|
33|Grammar|I ____ John at the party yesterday.|see|saw|was seeing|have seen|B|
34|Grammar|This test is ____ than the last test.|easy|easier|easiest|the easiest|B|
35|Grammar|Ben ____ right now. He is at library.|doesn't work|didn't work|isn't working|wasn't working|C|
36|Grammar|I don't know anyone ____ lives here.|who|when|where|which|A|
37|Grammar|Can you bring me ____ jeans behind you?|that|this|those|these|C|
38|Grammar|Did you ____ to football match last night?|go|went|have gone|were going|A|
39|Grammar|All the ____ offices are on second floor.|teacher|teachers|teacher's|teachers'|D|
40|Grammar|A: ____ you go to London? B: Last year.|Why did|When did|When were|Where were|B|
41|Grammar|You've met Jonas before, ____?|have you|haven't you|did you|didn't you|B|
42|Grammar|I have many meetings, so let's meet ____ lunch.|on|in|after|before|C|
43|Grammar|We have ____ food for party, need more drinks.|too|too much|too many|enough|D|
44|Grammar|John ____ gets his coffee here.|always|never|rarely|sometimes|A|
45|Grammar|She ____ more than twenty countries.|visits|visited|has visited|is visiting|C|
46|Grammar|I ____ drive you to airport.|may|must|could|would|C|
47|Grammar|I want to visit ____.|South Pole|a South Pole|the South Pole|this South Pole|C|
48|Grammar|He speaks Italian very ____.|good|well|better|best|B|
49|Grammar|Yes! I ____ move there next month.|can|will|would|might|B|
50|Grammar|Chinese ____ in many communities in London.|speaks|spoke|is spoken|has spoken|C|
51|Vocabulary|I spent too much ____ at the library.|time|minute|clock|watch|A|
52|Vocabulary|I like taking black and white ____.|notes|breaks|calls|photographs|D|
53|Vocabulary|Cathy ____ to take the job.|thought|decided|began|completed|B|
54|Vocabulary|There are a lot of cars and ____ is really bad.|weather|traffic|tourist|health|B|
55|Vocabulary|Let's go home this ____.|day|hour|tomorrow|weekend|D|
56|Vocabulary|Food and art are part of people's ____.|culture|religion|laws|ideas|A|
57|Vocabulary|I didn't know word meaning, so I ____.|told|wrote|moved|guessed|D|
58|Vocabulary|I'd like to ____ you to my friend.|meet|invite|introduce|remember|C|
59|Vocabulary|Don't walk at night in ____ areas.|unusual|familiar|exciting|dangerous|D|
60|Vocabulary|____, website doesn't accept credit cards.|Likely|Rarely|Suddenly|Unfortunately|D|
61|Vocabulary|It's ____ he missed his train.|early|possible|difficult|sure|B|
62|Vocabulary|This report is full of ____.|plans|mistakes|accidents|appointments|B|
63|Vocabulary|He wants to study ____ to work with computers.|politics|science|history|technology|D|
64|Vocabulary|John ____ lost his job.|usually|recently|immediately|regularly|B|
65|Vocabulary|Sue lives on the ____ end.|opposite|correct|wrong|front|A|
66|Vocabulary|It's not ____ to bring money.|fair|normal|necessary|appropriate|C|
67|Vocabulary|Are you ____ to go?|easy|angry|ready|busy|C|
68|Vocabulary|I don't like driving. I ____ the train.|need|prefer|suggest|schedule|B|
69|Vocabulary|It's so hot today! What's the ____?|season|noise|environment|temperature|D|
70|Vocabulary|He tried to ____ five million dollars.|steal|protect|return|earn|A|
71|Reading|What is this message about?|A new car park|Street parking rules|Car park changes|New parking prices|C|t1r1
72|Reading|Where can people park for next two weeks?|New office car park|High and 1st Street car park|Crowne Plaza hotel car park|High Street after 5 pm|B|t1r1
73|Reading|How can people park for free?|Show company ID card|Park on 1st Street|Call parking office|Use Crowne Plaza car park|A|t1r1
74|Reading|Why did writer make this website?|To help Cornwall visitors|To talk rules|To rent house|To talk personal life|A|t1r2
75|Reading|What information can you find on website?|Art|Boats|Hotels|Weather|C|t1r2
76|Reading|What does writer say about beaches?|Read the rules.|Some are closed.|No parking.|No swimming.|A|t1r2
77|Reading|What made Wright brothers interested in flying?|Birds|A toy|A bicycle|Machines|B|t1r3
78|Reading|What was one job brothers had?|Inventing technology|Working for father|Making bicycle designs|Writing about flying|C|t1r3
79|Reading|How did brothers invent first plane?|Studied birds' wings|Used bicycle designs|Copied popular technology|Used first model plane|A|t1r3
80|Reading|Why did brothers move to Europe?|Wanted to live there|Wanted global fame|Knew German flyer|Believed they could sell planes there|D|t1r3`;
    return parseBank('British English Adult - Test 1 Form A', '../BRE_course_placement_test1_00.mp3', passages, rows);
  }


  function normalizeBreQuestion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var no = parseInt(raw.no, 10);
    if (!no || no < 1 || no > 80) return null;
    var section = String(raw.section || '').trim();
    if (!section) return null;
    var opts = Array.isArray(raw.options) ? raw.options : [];
    var keys = ['A', 'B', 'C', 'D'];
    var options = keys.map(function (k) {
      var found = opts.find(function (o) { return o && String(o.key || '').toUpperCase() === k; });
      return { key: k, text: found ? String(found.text || '').trim() : '' };
    });
    var correct = String(raw.correct || 'A').trim().toUpperCase().charAt(0);
    if ('ABCD'.indexOf(correct) < 0) correct = 'A';
    return {
      no: no,
      section: section,
      prompt: String(raw.prompt || raw.text || '').trim(),
      options: options,
      correct: correct,
      passageId: String(raw.passageId || '').trim()
    };
  }

  function normalizeBreBank(bank) {
    var src = bank && typeof bank === 'object' ? bank : {};
    var passages = src.passages && typeof src.passages === 'object' ? src.passages : {};
    var outPassages = {};
    Object.keys(passages).forEach(function (k) {
      var id = String(k || '').trim();
      if (!id) return;
      outPassages[id] = String(passages[k] || '').trim();
    });
    var questions = [];
    (Array.isArray(src.questions) ? src.questions : []).forEach(function (q) {
      var nq = normalizeBreQuestion(q);
      if (nq) questions.push(nq);
    });
    questions.sort(function (a, b) { return a.no - b.no; });
    return {
      title: String(src.title || '').trim(),
      audioUrl: String(src.audioUrl || '').trim(),
      passages: outPassages,
      questions: questions
    };
  }

  function isValidBreBank(bank) {
    return normalizeBreBank(bank).questions.length >= 80;
  }

  function getDefaultBanks() {
    return { test1a: buildTest1A(), test2a: buildTest2A() };
  }

  global.BrePlacementBank = {
    buildTest1A: buildTest1A,
    buildTest2A: buildTest2A,
    parseBank: parseBank,
    getDefaultBanks: getDefaultBanks,
    normalizeBreBank: normalizeBreBank,
    isValidBreBank: isValidBreBank,
    BRE_SECTIONS: ['Listening', 'Grammar', 'Vocabulary', 'Reading'],
    BRE_FORMS: ['test1a', 'test2a']
  };
})(typeof window !== 'undefined' ? window : this);
