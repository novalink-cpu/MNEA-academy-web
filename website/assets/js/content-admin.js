window.AcademyContent = window.AcademyContent || {};
(function ensureBackToTopScript() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('academyBackToTopScript')) return;
  var src = '';
  try {
    src = document.currentScript && document.currentScript.src
      ? document.currentScript.src.replace(/[^\/?#]+(\?.*)?$/, 'backToTop.js')
      : '';
  } catch (e) {}
  if (!src) return;
  var s = document.createElement('script');
  s.id = 'academyBackToTopScript';
  s.src = src;
  s.defer = true;
  (document.head || document.documentElement).appendChild(s);
})();
var STORAGE_KEY = 'academy_content';
var UPLOAD_STORAGE_KEY = 'academy_uploads';
var PLACEMENT_STORAGE_KEY = 'academy_placement_test';
var BLOG_STORAGE_KEY = 'academy_blog_posts';

AcademyContent.save = function(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
};

AcademyContent.load = function() {
  try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
};

/** Programs page section h2s: strip leading emoji (📖⭐🎯📈🔎 etc.) from CMS / localStorage. */
AcademyContent.stripProgramsSectionHeadingLead = function(val) {
  var s = String(val == null ? '' : val).trim();
  var lead = /^(\uD83D\uDCD6|\u2B50|\uD83C\uDFAF|\uD83D\uDCC8|\uD83D\uDD0E|\uD83D\uDCDA|\uD83D\uDD0D|\u2728|\uD83C\uDF1F)(?:\uFE0F)?\s*/u;
  while (lead.test(s)) s = s.replace(lead, '').trim();
  return s;
};

/** After strip: map legacy default headings so old localStorage still shows updated wording. */
AcademyContent.normalizeProgramsSectionHeading = function(id, val) {
  var v = AcademyContent.stripProgramsSectionHeadingLead(val);
  if (id === 'course_features_title' && v === 'Course Features') return 'Program Features';
  if (id === 'course_join_title' && (v === 'Who Should Join This Course' || v === 'Who Should Join')) return 'Who Should Join This Program';
  return v;
};

AcademyContent.loadUploads = function() {
  try { var raw = localStorage.getItem(UPLOAD_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
};

AcademyContent.saveUpload = function(id, dataUrl) {
  var u = AcademyContent.loadUploads();
  u[id] = dataUrl;
  try {
    localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(u));
    if (/^gallery_a\d+_p\d+$/.test(id) && AcademyContent.touchGalleryUploadTime) {
      AcademyContent.touchGalleryUploadTime(id);
    }
    return true;
  } catch (e) { return false; }
};

AcademyContent.removeUpload = function(id) {
  var u = AcademyContent.loadUploads();
  /* Tombstone null so merges with Firebase don’t resurrect deleted keys (remote still had the old value). */
  u[id] = null;
  try {
    localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(u));
    if (/^gallery_a\d+_p\d+$/.test(id) && AcademyContent.clearGalleryUploadTime) {
      AcademyContent.clearGalleryUploadTime(id);
    }
    return true;
  } catch (e) { return false; }
};

AcademyContent.loadPlacementTest = function() {
  try { var raw = localStorage.getItem(PLACEMENT_STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
};

AcademyContent.savePlacementTest = function(data) {
  try { localStorage.setItem(PLACEMENT_STORAGE_KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
};

AcademyContent.loadBlogPosts = function() {
  try { var raw = localStorage.getItem(BLOG_STORAGE_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
};

AcademyContent.saveBlogPosts = function(posts) {
  try { localStorage.setItem(BLOG_STORAGE_KEY, JSON.stringify(posts)); return true; }
  catch (e) { return false; }
};

var SITE_CONTENT_WEB_EXTRA_KEY = 'site_content_bundle';

function siteContentApiGet(callback) {
  if (typeof fetch !== 'function') {
    callback(null);
    return;
  }
  fetch('/api/web_extra/' + encodeURIComponent(SITE_CONTENT_WEB_EXTRA_KEY), { credentials: 'same-origin' })
    .then(function(res) {
      var ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') >= 0) return res.json();
      return null;
    })
    .then(function(data) {
      if (!data || !data.ok || !Array.isArray(data.data) || !data.data.length) {
        callback(null);
        return;
      }
      var first = data.data[0];
      callback(first && typeof first === 'object' ? first : null);
    })
    .catch(function() {
      callback(null);
    });
}

function normalizeSiteContentBundle(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    content: (raw.content && typeof raw.content === 'object') ? raw.content : {},
    uploads: (raw.uploads && typeof raw.uploads === 'object') ? raw.uploads : {},
    placementTest: raw.placementTest || null,
    blogPosts: raw.blogPosts != null ? raw.blogPosts : null
  };
}

function siteContentFirebaseGet(callback) {
  if (!window.AcademyFirebase || typeof AcademyFirebase.get !== 'function') {
    callback(null);
    return;
  }
  AcademyFirebase.get(function(val) {
    callback(normalizeSiteContentBundle(val));
  });
}

function mergeRemoteSiteBundles(apiBundle, fbBundle) {
  if (!apiBundle && !fbBundle) return null;
  if (!apiBundle) return fbBundle;
  if (!fbBundle) return apiBundle;
  var merged = {
    content: Object.assign({}, fbBundle.content || {}, apiBundle.content || {}),
    uploads: Object.assign({}, fbBundle.uploads || {}, apiBundle.uploads || {}),
    placementTest: apiBundle.placementTest != null ? apiBundle.placementTest : fbBundle.placementTest,
    blogPosts: apiBundle.blogPosts != null ? apiBundle.blogPosts : fbBundle.blogPosts
  };
  Object.keys(fbBundle.content || {}).forEach(function(k) {
    var apiVal = merged.content[k];
    var fbVal = fbBundle.content[k];
    if ((apiVal == null || String(apiVal).trim() === '') && fbVal != null && String(fbVal).trim() !== '') {
      merged.content[k] = fbVal;
    }
  });
  Object.keys(fbBundle.uploads || {}).forEach(function(k) {
    var apiVal = merged.uploads[k];
    var fbVal = fbBundle.uploads[k];
    if ((apiVal == null || apiVal === '') && fbVal != null && fbVal !== '') {
      merged.uploads[k] = fbVal;
    }
  });
  return merged;
}

function mergeSiteContentWithLocal(localPayload, remotePayload) {
  localPayload = localPayload || {};
  remotePayload = remotePayload || {};
  var mergedContent = Object.assign({}, localPayload.content || {}, remotePayload.content || {});
  ['home_activity_video_1', 'home_activity_video_2'].forEach(function(k) {
    var localV = (localPayload.content || {})[k];
    var remoteV = (remotePayload.content || {})[k];
    if (localV != null && String(localV).trim() !== '' && (remoteV == null || String(remoteV).trim() === '')) {
      mergedContent[k] = localV;
    }
  });
  var localTimes = (localPayload.content && localPayload.content.gallery_upload_times) || {};
  var remoteTimes = (remotePayload.content && remotePayload.content.gallery_upload_times) || {};
  var mergedTimes = Object.assign({}, remoteTimes, localTimes);
  Object.keys(mergedTimes).forEach(function(k) {
    if (!/^gallery_a\d+_p\d+$/.test(k)) {
      delete mergedTimes[k];
      return;
    }
    var lt = parseInt(localTimes[k], 10);
    var rt = parseInt(remoteTimes[k], 10);
    if (!isNaN(lt) && !isNaN(rt)) mergedTimes[k] = Math.max(lt, rt);
    else if (!isNaN(lt)) mergedTimes[k] = lt;
    else if (!isNaN(rt)) mergedTimes[k] = rt;
  });
  if (Object.keys(mergedTimes).length) mergedContent.gallery_upload_times = mergedTimes;
  if (AcademyContent.repairSwappedCourseSlots) AcademyContent.repairSwappedCourseSlots(mergedContent);
  var slideNorm = AcademyContent.coerceHomeActivitiesSlides(mergedContent.home_activities_slides);
  if (slideNorm != null) mergedContent.home_activities_slides = slideNorm;
  var mergedUploads = Object.assign({}, localPayload.uploads || {}, remotePayload.uploads || {});
  Object.keys(localPayload.uploads || {}).forEach(function(k) {
    if (!/^gallery_a\d+_p\d+$/.test(k)) return;
    var localV = localPayload.uploads[k];
    var remoteV = remotePayload.uploads[k];
    if (localV != null && localV !== '' && (remoteV == null || remoteV === '')) mergedUploads[k] = localV;
  });
  return {
    content: mergedContent,
    uploads: mergedUploads,
    placementTest: remotePayload.placementTest != null ? remotePayload.placementTest : localPayload.placementTest,
    blogPosts: remotePayload.blogPosts != null ? remotePayload.blogPosts : localPayload.blogPosts
  };
}

function cacheSiteContentPayload(out) {
  try { AcademyContent.save(out.content || {}); } catch (e1) {}
  try {
    var upClean = {};
    Object.keys(out.uploads || {}).forEach(function(k) {
      var v = out.uploads[k];
      if (v != null && v !== '') upClean[k] = v;
    });
    localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(upClean));
  } catch (e2) {}
  try { if (out.placementTest) AcademyContent.savePlacementTest(out.placementTest); } catch (e3) {}
  try { if (out.blogPosts) AcademyContent.saveBlogPosts(out.blogPosts); } catch (e4) {}
}

/** Get full site content from server DB + Firebase (with local fallback cache). */
AcademyContent.getSiteContent = function(callback) {
  var localPayload = {
    content: AcademyContent.load(),
    uploads: AcademyContent.loadUploads(),
    placementTest: AcademyContent.loadPlacementTest(),
    blogPosts: AcademyContent.loadBlogPosts()
  };
  var apiBundle = null;
  var fbBundle = null;
  var pending = 2;
  function finish() {
    pending--;
    if (pending > 0) return;
    var remotePayload = mergeRemoteSiteBundles(apiBundle, fbBundle);
    if (!remotePayload) {
      callback(localPayload);
      return;
    }
    var out = mergeSiteContentWithLocal(localPayload, remotePayload);
    cacheSiteContentPayload(out);
    callback(out);
  }
  siteContentApiGet(function(data) {
    apiBundle = normalizeSiteContentBundle(data);
    finish();
  });
  siteContentFirebaseGet(function(data) {
    fbBundle = data;
    finish();
  });
};

/** Default placement test config. */
AcademyContent.DEFAULT_PLACEMENT_TEST = {
  pageTitle: '4-Skill Placement Test',
  pageSubtitle: '',
  intro: {
    title: 'Test Introduction',
    durationMinutes: '60',
    sections: 'Listening, Grammar, Vocabulary, and Reading',
    flowStep1: 'Step 1: Student Information',
    flowStep2: 'Step 2: Placement Questions',
    flowStep3: 'Step 3: Result'
  },
  stepperLabel: 'Student Info → Listening → Reading → Writing → Speaking → Result',
  step1: { title: 'Step 1:  ', subtitle: '  Email ', labelName: '', labelPhone: '', labelEmail: 'Email', btnNext: '' },
  step2: {
    title: 'Listening',
    introDesc: 'You are about to start the listening section.',
    duration: '60 mins',
    instruction: 'You will hear ten speakers. Each speaker will make a statement or ask a question. For each speaker, choose the best option for what comes next. You can play the recording TWO times.',
    listenLimit: 2,
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    questions: [
      { question: 'What is the best response to Speaker 1?', options: [{ key: 'A', text: 'I go to school every day.' }, { key: 'B', text: "I'm an engineer." }, { key: 'C', text: 'Do you want a jacket?' }, { key: 'D', text: 'Do you avoid the bus?' }], correct: 'A' },
      { question: 'What is the best response to Speaker 2?', options: [{ key: 'A', text: "I hope you feel better soon." }, { key: 'B', text: "I'd love a glass of water." }, { key: 'C', text: "Why don't you put on a jumper?" }, { key: 'D', text: 'Has the temperature changed?' }], correct: 'A' },
      { question: 'What is the best response to Speaker 3?', options: [{ key: 'A', text: "I'll have a sandwich, thanks." }, { key: 'B', text: 'Yes, what would you like?' }, { key: 'C', text: 'No, not yet.' }, { key: 'D', text: 'Will you be coming home later?' }], correct: 'B' },
      { question: 'What is the best response to Speaker 4?', options: [{ key: 'A', text: 'She decided to take the train.' }, { key: 'B', text: 'By the clock tower.' }, { key: 'C', text: "I'll see her tomorrow." }, { key: 'D', text: 'She said she would be here in five minutes.' }], correct: 'D' },
      { question: 'What is the best response to Speaker 5?', options: [{ key: 'A', text: "Is she your dad's sister?" }, { key: 'B', text: 'Where is your uncle?' }, { key: 'C', text: 'She and I are sisters.' }, { key: 'D', text: "I haven't seen my niece for a long time." }], correct: 'D' },
      { question: 'What is the best response to Speaker 6?', options: [{ key: 'A', text: 'He wanted to make more money.' }, { key: 'B', text: 'He preferred a different plan.' }, { key: 'C', text: 'He was tired of studying.' }, { key: 'D', text: 'He went there last year.' }], correct: 'C' },
      { question: 'What is the best response to Speaker 7?', options: [{ key: 'A', text: 'It has often been presented.' }, { key: 'B', text: 'It would take very little work.' }, { key: 'C', text: 'There are basically five critical steps.' }, { key: 'D', text: 'There is no point in going further.' }], correct: 'C' },
      { question: 'What is the best response to Speaker 8?', options: [{ key: 'A', text: 'Where did you study before?' }, { key: 'B', text: 'Can you give me an example?' }, { key: 'C', text: 'Do you think the students work hard enough?' }, { key: 'D', text: 'Does he teach more than one class?' }], correct: 'D' },
      { question: 'What is the best response to Speaker 9?', options: [{ key: 'A', text: "I prefer small dogs if they don't bark too much." }, { key: 'B', text: 'I remembered that dog after you pointed her out.' }, { key: 'C', text: "I thought we were in a different part of the park." }, { key: 'D', text: "I don't think so because it is so much bigger." }], correct: 'B' },
      { question: 'What is the best response to Speaker 10?', options: [{ key: 'A', text: "It depends on how soon you want it to get there." }, { key: 'B', text: 'It will take a minimum of two weeks.' }, { key: 'C', text: 'If it weighs more than 2 kilos you must sign here.' }, { key: 'D', text: 'The box will have to be securely taped.' }], correct: 'A' }
    ]
  },
  step3: {
    title: 'Reading',
    instruction: 'Choose the best word or phrase to complete each sentence.',
    items: [
      { sentence: 'I tried to ____ her that it would mean a lot to Kevin if she came to his retirement party, but she was too tired to come.', options: [{ key: 'A', text: 'convince' }, { key: 'B', text: 'force' }, { key: 'C', text: 'motivate' }, { key: 'D', text: 'coax' }], correct: 'A' },
      { sentence: "Everybody was so bored because he ______ talking and talking for hours.", options: [{ key: 'A', text: 'kept down' }, { key: 'B', text: 'kept above' }, { key: 'C', text: 'kept up' }, { key: 'D', text: 'kept on' }], correct: 'D' },
      { sentence: "She was so furious about the mistake that we couldn't _______.", options: [{ key: 'A', text: 'calm her down' }, { key: 'B', text: 'pick her up' }, { key: 'C', text: 'reassure her' }, { key: 'D', text: 'talk her down' }], correct: 'A' },
      { sentence: "His graduation from medical school fulfilled his parents' great ______ for him.", options: [{ key: 'A', text: 'purpose' }, { key: 'B', text: 'drive' }, { key: 'C', text: 'motivation' }, { key: 'D', text: 'ambition' }], correct: 'D' },
      { sentence: 'Often, Carl will do things for purely ______ reasons, but sometimes he is capable of great generosity.', options: [{ key: 'A', text: 'empathetic' }, { key: 'B', text: 'selfish' }, { key: 'C', text: 'juvenile' }, { key: 'D', text: 'frivolous' }], correct: 'B' },
      { sentence: "His father stressed that he needed to pass the exam if he was to ______ the university he wanted.", options: [{ key: 'A', text: 'come into' }, { key: 'B', text: 'take part at' }, { key: 'C', text: 'get into' }, { key: 'D', text: 'start up in' }], correct: 'C' },
      { sentence: "Juan was a very competent manager, but he ______ with time-keeping.", options: [{ key: 'A', text: 'interfered' }, { key: 'B', text: 'struggled' }, { key: 'C', text: 'collided' }, { key: 'D', text: 'clashed' }], correct: 'B' },
      { sentence: "Often regarded as sober and earnest because of her solemn demeanor, Cristina was actually quite a _______ companion, greeting every experience with good humor.", options: [{ key: 'A', text: 'comforting' }, { key: 'B', text: 'tranquil' }, { key: 'C', text: 'dynamic' }, { key: 'D', text: 'cheerful' }], correct: 'D' },
      { sentence: "Most people find that it is better to have a ______ for a long journey, even if you have to change it.", options: [{ key: 'A', text: 'schedule' }, { key: 'B', text: 'plan' }, { key: 'C', text: 'scheme' }, { key: 'D', text: 'proposal' }], correct: 'B' },
      { sentence: 'The main challenge on the tour was that some of the most interesting artifacts were not easily ________.', options: [{ key: 'A', text: 'useable' }, { key: 'B', text: 'comprehensible' }, { key: 'C', text: 'documented' }, { key: 'D', text: 'accessible' }], correct: 'D' },
      { sentence: "Anxiety made the actor's voice ______ when he first emerged onto the stage, but he quickly displayed his characteristically resonant speech.", options: [{ key: 'A', text: 'surge' }, { key: 'B', text: 'reverberate' }, { key: 'C', text: 'tremble' }, { key: 'D', text: 'resound' }], correct: 'C' },
      { sentence: "People were terrified of her dog because his fluffy coat made him look enormous, but he was really just enthusiastic rather than ________.", options: [{ key: 'A', text: 'assertive' }, { key: 'B', text: 'aggressive' }, { key: 'C', text: 'sullen' }, { key: 'D', text: 'surly' }], correct: 'B' },
      { sentence: "Corrina could not pretend she was really ______ about the prospect of another trip to the museum—her fourth this month—but she politely agreed to go with her roommate who is majoring in art history.", options: [{ key: 'A', text: 'dismayed' }, { key: 'B', text: 'doubtful' }, { key: 'C', text: 'enthusiastic' }, { key: 'D', text: 'confident' }], correct: 'C' },
      { sentence: "She is a ______ student who always has the best grades of her class.", options: [{ key: 'A', text: 'suitable' }, { key: 'B', text: 'stunning' }, { key: 'C', text: 'marvelous' }, { key: 'D', text: 'miraculous' }], correct: 'C' }
    ]
  },
  step4: {
    title: 'Writing',
    introDesc: 'You are about to start the writing section.',
    duration: '35 mins',
    prompts: [
      { text: 'What should a visitor see and do if they visit your city?', targetWords: 20 },
      { text: 'Plan out a menu for a large dinner party with a variety of dishes.', targetWords: 20 },
      { text: 'Write a clear and compelling job advertisement.', targetWords: 50 },
      { text: 'Write about your favorite day and what made it special.', targetWords: 20 },
      { text: 'Write an autobiography, including significant events, experiences.', targetWords: 30 }
    ]
  },
  step5: { title: 'Speaking', introDesc: 'You are about to start the speaking section.', duration: '15 mins' },
  step6: { title: ' ', message: '   Level   ', thankYou: '', buttonBack: '' },
  retakeDays: 7,
  adaptiveThresholdTest2: 75
};

AcademyContent.getPlacementTestConfig = function(callback) {
  AcademyContent.getSiteContent(function(data) {
    callback(data.placementTest || null);
  });
};

/** Save full site content to local cache and server DB. */
AcademyContent.saveAll = function(payload, callback) {
  var content = payload.content || {};
  var uploads = payload.uploads || {};
  var placementTest = payload.placementTest || null;
  var blogPosts = payload.blogPosts || null;
  var uploadsClean = {};
  Object.keys(uploads || {}).forEach(function(k) {
    var v = uploads[k];
    if (v != null && v !== '') uploadsClean[k] = v;
  });
  AcademyContent.save(content);
  try { localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(uploadsClean)); } catch (e) {}
  if (placementTest !== null) AcademyContent.savePlacementTest(placementTest);
  if (blogPosts !== null) AcademyContent.saveBlogPosts(blogPosts);
  var sync = {
    content: content,
    uploads: uploadsClean,
    placementTest: placementTest,
    blogPosts: blogPosts
  };
  if (typeof fetch !== 'function') {
    if (callback) callback({ local: true, firebase: false });
    return;
  }
  var serverOk = false;
  var firebaseOk = false;
  var reported = false;
  function report() {
    if (reported) return;
    reported = true;
    if (callback) callback({ local: true, firebase: serverOk || firebaseOk, server: serverOk, firebaseSync: firebaseOk });
  }
  function syncFirebase() {
    if (!window.AcademyFirebase || typeof AcademyFirebase.set !== 'function') {
      report();
      return;
    }
    AcademyFirebase.set(sync, function(ok) {
      firebaseOk = !!ok;
      report();
    });
  }
  fetch('/api/web_extra/' + encodeURIComponent(SITE_CONTENT_WEB_EXTRA_KEY), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ data: [sync] })
  })
    .then(function(res) {
      var ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') >= 0) return res.json();
      return { ok: false };
    })
    .then(function(r) {
      serverOk = !!(r && r.ok);
      syncFirebase();
    })
    .catch(function() {
      syncFirebase();
    });
};

/**
 * Single source for Programs: home carousel, programs page grid, nav dropdown, footer links, and thumbnails.
 * Order, titles, blurbs, image_key, and thumb_fallback stay in sync everywhere.
 */
AcademyContent.PROGRAM_DISPLAY_CATALOG = [
  { slug: 'exam', title: 'IGCSE', text: 'Our IGCSE programme prepares you for university and beyond — Pearson Edexcel in Nay Pyi Taw, with core and optional subjects, exam preparation, and experienced teachers.', image_key: 'our_course_3_image', legacy_image_key: 'course2_image', thumb_fallback: 'photo/study.jpg' },
  { slug: 'general', title: 'Pre-IGCSE', text: 'One-year foundation at MNEA (Pearson Edexcel Approved Centre): weekday classes, March intake, pathway to IGCSE — fees from K 5,900,000 with installment & promotion options.', image_key: 'our_course_2_image', legacy_image_key: 'course1_image', thumb_fallback: 'photo/classroom.jpg' },
  { slug: 'globalprimary', title: 'Global Primary Learning Program', text: 'Build a strong primary foundation through English, Mathematics, Science, Computing, and supportive enrichment subjects.', image_key: 'our_course_6_image', legacy_image_key: 'course1_image', thumb_fallback: 'photo/classroom.jpg' },
  { slug: 'professional', title: 'English 4 Skills (PEIC, UK)', text: 'Weekend PEIC pathway: free Level Test, June–December 2026 intake (140h + 10 bonus hours), levels Pre-A1–B2 with monthly fees from K 195,000 — exam in Nay Pyi Taw.', image_key: 'our_course_1_image', legacy_image_key: 'course3_image', thumb_fallback: 'photo/business.jpg' },
  { slug: 'chinese', title: 'Chinese Language Program', text: 'Learn Chinese with structured lessons in communication, characters, pronunciation, and cultural understanding.', image_key: 'our_course_5_image', legacy_image_key: 'course5_image', thumb_fallback: 'photo/study.jpg' },
  { slug: 'business', title: 'Business & Management', text: '2026 online intake: Business English Level 1 — four skills, evening classes (Myanmar Time), practical workplace modules from greetings to company profiles. Programme fee K 790,000.', image_key: 'our_course_7_image', legacy_image_key: 'course3_image', thumb_fallback: 'photo/business.jpg' },
  { slug: 'coding', title: 'Coding & Robotics', text: 'Hands-on coding and robotics programme for school-age learners with project-based lessons in logic, programming, and practical problem solving.', image_key: 'our_course_8_image', legacy_image_key: 'course8_image', thumb_fallback: 'photo/classroom.jpg' },
  { slug: 'onlineclass', title: 'Online Class', text: 'Business English - Level 1 (Online Class), 2026 intake: Tue/Wed/Thu at 7:00 pm - 8:30 pm via live Zoom sessions. Practical workplace modules with online registration and payment.', image_key: 'our_course_9_image', legacy_image_key: 'course9_image', thumb_fallback: 'photo/business.jpg' }
];

/** general→course1, exam→course2. Legacy save mirrored list index (0→1, 1→2) and swapped IGCSE/Pre-IGCSE. */
AcademyContent.repairSwappedCourseSlots = function(content) {
  if (!content || typeof content !== 'object') return content;
  var examTitle = '';
  var generalTitle = '';
  var list = content.our_courses;
  if (Array.isArray(list)) {
    list.forEach(function(it) {
      it = it && typeof it === 'object' ? it : {};
      var m = String(it.link || '').match(/[?&]id=([^&"#]+)/);
      if (!m) return;
      if (m[1] === 'exam') examTitle = String(it.title || '').trim();
      if (m[1] === 'general') generalTitle = String(it.title || '').trim();
    });
  }
  if (!examTitle) examTitle = 'IGCSE';
  if (!generalTitle) generalTitle = 'Pre-IGCSE';
  var c1 = String(content.course1_title || '').trim();
  var c2 = String(content.course2_title || '').trim();
  var looksSwapped = (c1 === examTitle && c2 === generalTitle) ||
    ((c1.toLowerCase().indexOf('igcse') >= 0 && c1.toLowerCase().indexOf('pre') < 0) &&
     (c2.toLowerCase().indexOf('pre') >= 0));
  if (!looksSwapped) return content;
  var suffixes = ['title', 'text', 'overview', 'duration', 'schedule', 'level', 'who_join', 'focus', 'fee', 'schedule_options', 'benefits', 'ribbon_main', 'ribbon_sub'];
  suffixes.forEach(function(s) {
    var k1 = 'course1_' + s;
    var k2 = 'course2_' + s;
    if (!(k1 in content) && !(k2 in content)) return;
    var tmp = content[k1];
    content[k1] = content[k2];
    content[k2] = tmp;
  });
  return content;
};

/** Same course list as Our Courses / Popular Courses: our_courses JSON or course1–course7_title (CMS). */
AcademyContent.getCourseItems = function(content) {
  content = (content && typeof content === 'object') ? content : {};
  var CATALOG = AcademyContent.PROGRAM_DISPLAY_CATALOG || [];
  var slugOrder = CATALOG.map(function(r) { return r.slug; });
  var defaultBySlug = Object.create(null);
  var canonicalBySlug = Object.create(null);
  CATALOG.forEach(function(row) {
    defaultBySlug[row.slug] = { title: row.title, text: row.text };
    canonicalBySlug[row.slug] = { image_key: row.image_key, legacy_image_key: row.legacy_image_key, thumb_fallback: row.thumb_fallback };
  });
  /* Legacy slug english4skills (same programme as professional) — merge CMS text only, not a separate marketing card */
  defaultBySlug.english4skills = { title: 'English 4 Skills', text: defaultBySlug.professional ? defaultBySlug.professional.text : '' };
  canonicalBySlug.english4skills = { image_key: 'our_course_1_image', legacy_image_key: 'course4_image', thumb_fallback: 'photo/business.jpg' };
  function slugFromLink(link, index) {
    var m = String(link || '').match(/[?&]id=([^&"#]+)/);
    if (m) return m[1];
    return slugOrder[index] || slugOrder[0];
  }
  var slugForLegacyIndex = function(ci) {
    var map = { 1: 'general', 2: 'exam', 3: 'professional', 4: 'english4skills', 5: 'chinese', 6: 'globalprimary', 7: 'business' };
    return map[ci] || 'general';
  };
  var rawItems = content.our_courses;
  if (!Array.isArray(rawItems) || !rawItems.length) {
    rawItems = [];
    for (var ci = 1; ci <= 7; ci++) {
      var t = content['course' + ci + '_title'];
      var d = content['course' + ci + '_text'];
      if (t != null || d != null) {
        var legSlug = slugForLegacyIndex(ci);
        var can = canonicalBySlug[legSlug];
        if (!can) continue;
        rawItems.push({
          title: (t != null ? t : ''),
          text: (d != null ? d : ''),
          link: 'course-detail.html?id=' + legSlug,
          image_key: can.image_key,
          legacy_image_key: can.legacy_image_key
        });
      }
    }
    if (!rawItems.length) {
      rawItems = CATALOG.map(function(row) {
        var can = canonicalBySlug[row.slug];
        return { title: row.title, text: row.text, link: 'course-detail.html?id=' + row.slug, image_key: can.image_key, legacy_image_key: can.legacy_image_key };
      });
    }
  }
  var bySlug = Object.create(null);
  (rawItems || []).slice(0, 16).forEach(function(item, index) {
    item = item && typeof item === 'object' ? item : {};
    var slug = slugFromLink(item.link, index);
    if (slug === 'english4skills') {
      if (!bySlug.professional) bySlug.professional = item;
      return;
    }
    if (!defaultBySlug[slug]) slug = slugOrder[index] || slugOrder[0];
    if (!bySlug[slug]) bySlug[slug] = item;
  });
  return slugOrder.map(function(slug) {
    var item = bySlug[slug] || {};
    var def = defaultBySlug[slug];
    var can = canonicalBySlug[slug];
    var title = String(item.title || '').trim();
    var text = String(item.text || '').trim();
    return {
      title: title || def.title,
      text: text || def.text,
      link: 'course-detail.html?id=' + slug,
      image_key: String(item.image_key || '').trim() || can.image_key,
      legacy_image_key: String(item.legacy_image_key || '').trim() || can.legacy_image_key,
      thumb_fallback: can.thumb_fallback
    };
  });
};

AcademyContent.getProgramDisplayItems = function(courseItems) {
  var CATALOG = AcademyContent.PROGRAM_DISPLAY_CATALOG || [];
  var bySlug = Object.create(null);
  (courseItems || []).forEach(function(item, index) {
    item = item && typeof item === 'object' ? item : {};
    var m = String(item.link || '').match(/[?&]id=([^&"#]+)/);
    var slug = m ? m[1] : '';
    if (!slug) slug = (CATALOG[index] && CATALOG[index].slug) || '';
    if (slug && !bySlug[slug]) bySlug[slug] = item;
  });
  return CATALOG.map(function(def) {
    var live = bySlug[def.slug] || {};
    var title = String(live.title || '').trim();
    var text = String(live.text || '').trim();
    return {
      slug: def.slug,
      title: title || def.title,
      text: text || def.text,
      link: 'course-detail.html?id=' + def.slug,
      image_key: live.image_key || def.image_key,
      legacy_image_key: live.legacy_image_key || def.legacy_image_key,
      thumb_fallback: def.thumb_fallback
    };
  });
};

/** Keep header Programs submenu labels in sync with CMS course titles (data-nav-course slugs). */
AcademyContent.syncNavCourseDropdownFromItems = function(courseItems) {
  var programItems = AcademyContent.getProgramDisplayItems(courseItems);
  document.querySelectorAll('a.nav-courses-trigger').forEach(function(trigger) {
    var href = (trigger.getAttribute('href') || '').trim();
    if (href.indexOf('courses.html') === -1) return;
    var dropdown = trigger.nextElementSibling;
    if (!dropdown || !dropdown.classList || !dropdown.classList.contains('nav-dropdown')) return;
    while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);
    programItems.forEach(function(item) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.setAttribute('data-nav-course', item.slug);
      a.setAttribute('href', item.link);
      a.setAttribute('data-lang-en', item.title);
      a.setAttribute('data-lang-my', item.title);
      a.textContent = item.title;
      li.appendChild(a);
      dropdown.appendChild(li);
    });
  });
};

AcademyContent.GALLERY_SLOTS_PER_ALBUM = 12;
AcademyContent.getDefaultGalleryAlbumTitles = function() {
  return [
    'Awarding Ceremony',
    'Sports & Activities',
    'Festivals',
    'Happy Moments',
    'Classroom Fun',
    'School Trips',
    'Donations',
    'Community Service',
    'Free Classes'
  ];
};

/** Fallback gallery photos (website/photo/) when CMS/server has no upload — works on PythonAnywhere & mobile. */
AcademyContent.DEFAULT_GALLERY_IMAGE_PATHS = {
  gallery_a0_p0: '../photo/awarding1.jpg',
  gallery_a0_p1: '../photo/awarding2.jpg',
  gallery_a0_p2: '../photo/awarding3.jpg',
  gallery_a1_p0: '../photo/sport1.jpg',
  gallery_a1_p1: '../photo/sport2.jpg',
  gallery_a1_p2: '../photo/sport3.jpg',
  gallery_a2_p0: '../photo/festivals1.jpg',
  gallery_a2_p1: '../photo/festivals2.jpg',
  gallery_a2_p2: '../photo/festivals3.jpg'
};

AcademyContent.resolveGalleryImageSrc = function(key, uploads) {
  if (!key) return null;
  uploads = uploads || {};
  var up = uploads[key];
  if (up != null && up !== '' && String(up).trim() !== '') return up;
  var paths = AcademyContent.DEFAULT_GALLERY_IMAGE_PATHS;
  if (paths && paths[key]) return paths[key];
  return null;
};
AcademyContent.normalizeGalleryAlbumTitles = function(content) {
  content = content || {};
  var defaults = AcademyContent.getDefaultGalleryAlbumTitles();
  var raw = content.gallery_album_titles;
  if (!Array.isArray(raw) || !raw.length) return defaults.slice();
  return raw.map(function(t, i) {
    var s = String(t != null ? t : '').trim();
    return s || (defaults[i] || ('Category ' + (i + 1)));
  });
};
AcademyContent.galleryUploadKey = function(albumIndex, slotIndex) {
  return 'gallery_a' + albumIndex + '_p' + slotIndex;
};

AcademyContent.touchGalleryUploadTime = function(key) {
  if (!/^gallery_a\d+_p\d+$/.test(key)) return;
  var c = AcademyContent.load() || {};
  if (!c.gallery_upload_times || typeof c.gallery_upload_times !== 'object') c.gallery_upload_times = {};
  c.gallery_upload_times[key] = Date.now();
  AcademyContent.save(c);
};

AcademyContent.clearGalleryUploadTime = function(key) {
  if (!/^gallery_a\d+_p\d+$/.test(key)) return;
  var c = AcademyContent.load() || {};
  if (!c.gallery_upload_times || typeof c.gallery_upload_times !== 'object') return;
  if (c.gallery_upload_times[key] == null) return;
  delete c.gallery_upload_times[key];
  AcademyContent.save(c);
};

/** Move gallery image + upload timestamp when shifting slots (category delete). */
AcademyContent.moveGalleryUpload = function(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return true;
  var u = AcademyContent.loadUploads();
  var v = u[fromKey];
  if (v != null && v !== '') u[toKey] = v;
  else u[toKey] = null;
  u[fromKey] = null;
  try { localStorage.setItem(UPLOAD_STORAGE_KEY, JSON.stringify(u)); } catch (e) { return false; }
  var c = AcademyContent.load() || {};
  if (!c.gallery_upload_times || typeof c.gallery_upload_times !== 'object') c.gallery_upload_times = {};
  if (c.gallery_upload_times[fromKey] != null) {
    c.gallery_upload_times[toKey] = c.gallery_upload_times[fromKey];
    delete c.gallery_upload_times[fromKey];
    AcademyContent.save(c);
  } else if (c.gallery_upload_times[toKey] != null) {
    delete c.gallery_upload_times[toKey];
    AcademyContent.save(c);
  }
  return true;
};

AcademyContent.shiftGalleryUploadTimesAfterDelete = function(deletedIndex, albumCount) {
  var c = AcademyContent.load() || {};
  var times = c.gallery_upload_times;
  if (!times || typeof times !== 'object') return;
  var next = {};
  Object.keys(times).forEach(function(k) {
    var m = k.match(/^gallery_a(\d+)_p(\d+)$/);
    if (!m) return;
    var ai = parseInt(m[1], 10);
    var pi = parseInt(m[2], 10);
    if (isNaN(ai) || isNaN(pi) || ai === deletedIndex) return;
    var newAi = ai > deletedIndex ? ai - 1 : ai;
    if (newAi < 0 || newAi >= albumCount) return;
    next[AcademyContent.galleryUploadKey(newAi, pi)] = times[k];
  });
  c.gallery_upload_times = next;
  AcademyContent.save(c);
};

AcademyContent.galleryPhotoSortKey = function(content, key, albumIndex, slotIndex) {
  var times = (content && content.gallery_upload_times) || {};
  var t = times[key];
  if (t != null && t !== '' && !isNaN(parseInt(t, 10))) return parseInt(t, 10);
  return albumIndex * 10000 + slotIndex;
};

AcademyContent.gallerySlotCountForAlbum = function(content, uploads, albumIndex) {
  var maxP = AcademyContent.GALLERY_SLOTS_PER_ALBUM;
  var maxPi = -1;
  for (var pi = 0; pi < maxP; pi++) {
    var slotKey = AcademyContent.galleryUploadKey(albumIndex, pi);
    if (AcademyContent.resolveGalleryImageSrc(slotKey, uploads)) maxPi = pi;
  }
  var fromUploads = maxPi >= 0 ? maxPi + 1 : 3;
  var raw = content.gallery_album_slot_counts && content.gallery_album_slot_counts[albumIndex];
  if (raw != null && raw !== '' && !isNaN(parseInt(raw, 10))) {
    var fromSaved = Math.max(1, Math.min(maxP, parseInt(raw, 10)));
    return Math.max(fromSaved, fromUploads);
  }
  return fromUploads;
};

/** One-time style fill for legacy gallery images missing upload timestamps. */
AcademyContent.ensureGalleryUploadTimes = function(content, uploads) {
  content = content || {};
  uploads = uploads || {};
  if (!content.gallery_upload_times || typeof content.gallery_upload_times !== 'object') {
    content.gallery_upload_times = {};
  }
  var times = content.gallery_upload_times;
  var keys = [];
  Object.keys(uploads).forEach(function(k) {
    if (/^gallery_a\d+_p\d+$/.test(k) && uploads[k] != null && uploads[k] !== '') keys.push(k);
  });
  keys.sort(function(a, b) {
    var ma = a.match(/^gallery_a(\d+)_p(\d+)$/);
    var mb = b.match(/^gallery_a(\d+)_p(\d+)$/);
    if (!ma || !mb) return 0;
    var aa = parseInt(ma[1], 10);
    var ap = parseInt(ma[2], 10);
    var ba = parseInt(mb[1], 10);
    var bp = parseInt(mb[2], 10);
    if (aa !== ba) return aa - ba;
    return ap - bp;
  });
  var changed = false;
  var base = Date.now() - keys.length * 60000;
  keys.forEach(function(k, i) {
    if (times[k] == null || times[k] === '' || isNaN(parseInt(times[k], 10))) {
      times[k] = base + i * 60000;
      changed = true;
    }
  });
  if (changed) {
    content.gallery_upload_times = times;
    try { AcademyContent.save(content); } catch (e) {}
  }
  return content;
};

/** Newest uploads first (All or single category). albumFilter: 'all' or album index number. */
AcademyContent.listGalleryPhotosSorted = function(content, uploads, albumFilter) {
  content = content || {};
  uploads = uploads || {};
  content = AcademyContent.ensureGalleryUploadTimes(content, uploads);
  var titles = AcademyContent.normalizeGalleryAlbumTitles(content);
  var items = [];
  var indices = [];
  if (albumFilter === 'all' || albumFilter == null) {
    for (var i = 0; i < titles.length; i++) indices.push(i);
  } else {
    var one = parseInt(albumFilter, 10);
    if (!isNaN(one) && one >= 0 && one < titles.length) indices.push(one);
  }
  for (var xi = 0; xi < indices.length; xi++) {
    var ai = indices[xi];
    var nP = AcademyContent.gallerySlotCountForAlbum(content, uploads, ai);
    for (var pj = 0; pj < nP; pj++) {
      var key = AcademyContent.galleryUploadKey(ai, pj);
      var src = AcademyContent.resolveGalleryImageSrc(key, uploads);
      if (src == null || src === '') continue;
      var sortKey = AcademyContent.galleryPhotoSortKey(content, key, ai, pj);
      var d = new Date(sortKey);
      var yr = d.getFullYear();
      var mo = d.getMonth() + 1;
      items.push({
        key: key,
        src: src,
        sortKey: sortKey,
        uploadedAt: sortKey,
        year: isNaN(yr) ? 0 : yr,
        month: isNaN(mo) ? 0 : mo
      });
    }
  }
  items.sort(function(a, b) { return b.sortKey - a.sortKey; });
  return items;
};

AcademyContent.filterGalleryPhotosByDate = function(items, year, month) {
  items = items || [];
  var y = year != null && year !== '' ? parseInt(year, 10) : null;
  var m = month != null && month !== '' ? parseInt(month, 10) : null;
  if (y == null && m == null) return items.slice();
  return items.filter(function(p) {
    if (y != null && !isNaN(y) && p.year !== y) return false;
    if (m != null && !isNaN(m) && p.month !== m) return false;
    return true;
  });
};

AcademyContent.galleryDateFilterOptions = function(items) {
  items = items || [];
  var yearSet = {};
  var monthsByYear = {};
  items.forEach(function(p) {
    if (!p.year) return;
    yearSet[p.year] = true;
    if (!monthsByYear[p.year]) monthsByYear[p.year] = {};
    if (p.month) monthsByYear[p.year][p.month] = true;
  });
  var years = Object.keys(yearSet).map(function(y) { return parseInt(y, 10); }).filter(function(y) { return !isNaN(y); });
  years.sort(function(a, b) { return b - a; });
  return { years: years, monthsByYear: monthsByYear };
};

AcademyContent.galleryMonthLabel = function(monthNum) {
  var names = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var m = parseInt(monthNum, 10);
  return names[m] || String(monthNum);
};

/** Resources → Gallery page: left category list + photo grid (upload keys gallery_a{n}_p{m}). */
AcademyContent.applyPhotoGallery = function(content, uploads) {
  var root = document.getElementById('page-gallery-root');
  if (!root) return;
  content = content || {};
  uploads = uploads || {};
  content = AcademyContent.ensureGalleryUploadTimes(content, uploads);
  var esc = function(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var escA = function(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  };
  var titles = AcademyContent.normalizeGalleryAlbumTitles(content);
  var nA = titles.length;
  function galleryCellHtml(src) {
    return (
      '<figure class="gallery-cell">' +
      '<button type="button" class="gallery-cell__open" aria-label="View larger">' +
      '<img src="' +
      escA(src) +
      '" alt="" loading="lazy" decoding="async">' +
      '</button></figure>'
    );
  }
  var panelPhotos = { all: AcademyContent.listGalleryPhotosSorted(content, uploads, 'all') };
  var navItems =
    '<li><button type="button" class="gallery-nav-btn is-active" data-album-index="all" role="tab" aria-selected="true" data-lang-en="All" data-lang-my="All">All</button></li>';
  var panels = '';
  for (var ai = 0; ai < nA; ai++) {
    panelPhotos[String(ai)] = AcademyContent.listGalleryPhotosSorted(content, uploads, ai);
    navItems +=
      '<li><button type="button" class="gallery-nav-btn" data-album-index="' +
      ai +
      '" role="tab" aria-selected="false">' +
      esc(titles[ai]) +
      '</button></li>';
    panels +=
      '<div class="gallery-album-panel" data-album-index="' +
      ai +
      '" role="tabpanel" hidden><div class="gallery-photo-grid" aria-live="polite"></div></div>';
  }
  panels =
    '<div class="gallery-album-panel is-active" data-album-index="all" role="tabpanel"><div class="gallery-photo-grid" aria-live="polite"></div></div>' +
    panels;
  var monthNavItems =
    '<li><button type="button" class="gallery-nav-btn gallery-month-btn is-active" data-gallery-month="" data-lang-en="All months" data-lang-my="All months">All months</button></li>';
  for (var mo = 1; mo <= 12; mo++) {
    monthNavItems +=
      '<li><button type="button" class="gallery-nav-btn gallery-month-btn" data-gallery-month="' +
      mo +
      '">' +
      esc(AcademyContent.galleryMonthLabel(mo)) +
      '</button></li>';
  }
  root.innerHTML =
    '<div class="page-gallery-layout">' +
    '<aside class="gallery-sidebar" aria-label="Gallery albums">' +
    '<p class="gallery-sidebar-title" data-lang-en="Categories" data-lang-my="Categories">Categories</p>' +
    '<ul class="gallery-sidebar-list">' +
    navItems +
    '</ul></aside>' +
    '<div class="gallery-main">' +
    panels +
    '</div>' +
    '<aside class="gallery-date-sidebar" aria-label="Filter by date">' +
    '<div class="gallery-year-dropdown" id="galleryYearDropdown">' +
    '<button type="button" class="gallery-year-dropdown__trigger" id="galleryYearTrigger" aria-haspopup="listbox" aria-expanded="false" aria-label="Year">' +
    '<span class="gallery-year-dropdown__label">All years</span>' +
    '<i class="fa-solid fa-chevron-down gallery-year-dropdown__icon" aria-hidden="true"></i>' +
    '</button>' +
    '<ul class="gallery-year-dropdown__menu" id="galleryYearMenu" role="listbox" hidden></ul>' +
    '</div>' +
    '<ul class="gallery-sidebar-list gallery-month-list">' +
    monthNavItems +
    '</ul></aside>' +
    '</div>';

  var yearDropdown = root.querySelector('#galleryYearDropdown');
  var yearTrigger = root.querySelector('#galleryYearTrigger');
  var yearMenu = root.querySelector('#galleryYearMenu');
  var yearLabelEl = root.querySelector('.gallery-year-dropdown__label');
  var state = { album: 'all', year: '', month: '', panelPhotos: panelPhotos };

  function activePanelEl() {
    return root.querySelector('.gallery-album-panel.is-active .gallery-photo-grid');
  }

  function renderGridHtml(photos) {
    if (!photos.length) {
      return '<p class="gallery-empty-hint">' + esc('No photos for this period.') + '</p>';
    }
    return photos.map(function(p) { return galleryCellHtml(p.src); }).join('');
  }

  function syncMonthNavActive() {
    root.querySelectorAll('.gallery-month-btn').forEach(function(btn) {
      var m = btn.getAttribute('data-gallery-month');
      var on = String(m || '') === String(state.month || '');
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function yearDisplayLabel() {
    return state.year ? String(state.year) : 'All years';
  }

  function closeYearMenu() {
    if (!yearMenu || !yearTrigger) return;
    yearMenu.setAttribute('hidden', '');
    yearTrigger.setAttribute('aria-expanded', 'false');
  }

  function openYearMenu() {
    if (!yearMenu || !yearTrigger) return;
    yearMenu.removeAttribute('hidden');
    yearTrigger.setAttribute('aria-expanded', 'true');
  }

  function renderYearDropdown() {
    if (!yearMenu) return;
    var items = state.panelPhotos[state.album] || [];
    var opts = AcademyContent.galleryDateFilterOptions(items);
    if (state.year && opts.years.indexOf(parseInt(state.year, 10)) < 0) state.year = '';
    if (yearLabelEl) yearLabelEl.textContent = yearDisplayLabel();
    var menuHtml =
      '<li><button type="button" class="gallery-year-dropdown__option' +
      (state.year ? '' : ' is-active') +
      '" data-gallery-year="" role="option">All years</button></li>';
    for (var yi = 0; yi < opts.years.length; yi++) {
      var yv = opts.years[yi];
      var on = String(state.year) === String(yv);
      menuHtml +=
        '<li><button type="button" class="gallery-year-dropdown__option' +
        (on ? ' is-active' : '') +
        '" data-gallery-year="' +
        yv +
        '" role="option">' +
        esc(String(yv)) +
        '</button></li>';
    }
    yearMenu.innerHTML = menuHtml;
    yearMenu.querySelectorAll('.gallery-year-dropdown__option').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        state.year = btn.getAttribute('data-gallery-year') || '';
        if (yearLabelEl) yearLabelEl.textContent = yearDisplayLabel();
        closeYearMenu();
        renderActiveGalleryPanel();
      });
    });
  }

  function renderActiveGalleryPanel() {
    var grid = activePanelEl();
    if (!grid) return;
    var items = state.panelPhotos[state.album] || [];
    var filtered = AcademyContent.filterGalleryPhotosByDate(items, state.year, state.month);
    if (!items.length) {
      grid.innerHTML =
        '<p class="gallery-empty-hint">' +
        esc('Upload photos for this category in Admin → Gallery.') +
        '</p>';
      return;
    }
    grid.innerHTML = renderGridHtml(filtered);
  }

  function setActiveAlbum(rawIdx) {
    state.album = rawIdx === 'all' ? 'all' : String(rawIdx);
    state.year = '';
    state.month = '';
    root.querySelectorAll('.gallery-sidebar .gallery-nav-btn[data-album-index]').forEach(function(b) {
      var idx = b.getAttribute('data-album-index');
      var on = String(idx) === String(rawIdx);
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    root.querySelectorAll('.gallery-album-panel').forEach(function(p) {
      var pIdx = p.getAttribute('data-album-index');
      var on = rawIdx === 'all' ? pIdx === 'all' : String(pIdx) === String(rawIdx);
      p.classList.toggle('is-active', on);
      if (on) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    });
    syncMonthNavActive();
    closeYearMenu();
    renderYearDropdown();
    renderActiveGalleryPanel();
  }

  root.querySelectorAll('.gallery-sidebar .gallery-nav-btn[data-album-index]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var rawIdx = btn.getAttribute('data-album-index');
      if (rawIdx == null || rawIdx === '') return;
      setActiveAlbum(rawIdx);
    });
  });

  root.querySelectorAll('.gallery-month-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.month = btn.getAttribute('data-gallery-month') || '';
      syncMonthNavActive();
      renderActiveGalleryPanel();
    });
  });

  if (yearTrigger && yearMenu) {
    yearTrigger.addEventListener('click', function(e) {
      e.stopPropagation();
      if (yearMenu.hasAttribute('hidden')) openYearMenu();
      else closeYearMenu();
    });
    document.addEventListener('click', function(e) {
      if (!yearDropdown || yearDropdown.contains(e.target)) return;
      closeYearMenu();
    });
  }

  renderYearDropdown();
  syncMonthNavActive();
  renderActiveGalleryPanel();
  AcademyContent.attachGalleryLightboxBehavior();
};

/** Full-screen lightbox for Resources → Gallery thumbnails (prev/next, counter, Esc). */
AcademyContent.attachGalleryLightboxBehavior = function() {
  var lb = document.getElementById('galleryLightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'galleryLightbox';
    lb.className = 'gallery-lightbox';
    lb.setAttribute('hidden', '');
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Gallery');
    lb.innerHTML =
      '<div class="gallery-lightbox__backdrop" aria-hidden="true"></div>' +
      '<div class="gallery-lightbox__frame" tabindex="-1">' +
      '<button type="button" class="gallery-lightbox__close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
      '<div class="gallery-lightbox__img-wrap"><img class="gallery-lightbox__img" src="" alt=""></div>' +
      '<div class="gallery-lightbox__toolbar">' +
      '<div class="gallery-lightbox__toolbar-left">' +
      '<button type="button" class="gallery-lightbox__nav gallery-lightbox__prev" aria-label="Previous"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>' +
      '<button type="button" class="gallery-lightbox__nav gallery-lightbox__next" aria-label="Next"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>' +
      '<span class="gallery-lightbox__counter" aria-live="polite"></span>' +
      '</div></div></div>';
    document.body.appendChild(lb);
    lb._urls = [];
    lb._index = 0;
    function updateLb() {
      var u = lb._urls;
      var i = lb._index;
      var img = lb.querySelector('.gallery-lightbox__img');
      var cnt = lb.querySelector('.gallery-lightbox__counter');
      if (img) img.src = u[i] || '';
      if (cnt) cnt.textContent = u.length ? String(i + 1) + ' of ' + String(u.length) : '';
      var prev = lb.querySelector('.gallery-lightbox__prev');
      var next = lb.querySelector('.gallery-lightbox__next');
      var hide = u.length <= 1;
      if (prev) prev.style.visibility = hide ? 'hidden' : '';
      if (next) next.style.visibility = hide ? 'hidden' : '';
    }
    function openLb(urls, index) {
      lb._urls = urls.slice();
      lb._index = Math.max(0, Math.min(index, Math.max(0, lb._urls.length - 1)));
      updateLb();
      lb.removeAttribute('hidden');
      lb.setAttribute('aria-hidden', 'false');
      document.body.classList.add('gallery-lightbox-open');
      document.body.style.overflow = 'hidden';
      var frame = lb.querySelector('.gallery-lightbox__frame');
      if (frame) frame.focus();
    }
    function closeLb() {
      lb.setAttribute('hidden', '');
      lb.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('gallery-lightbox-open');
      document.body.style.overflow = '';
      var img = lb.querySelector('.gallery-lightbox__img');
      if (img) img.removeAttribute('src');
    }
    lb._openLb = openLb;
    lb._closeLb = closeLb;
    lb.querySelector('.gallery-lightbox__close').addEventListener('click', function(e) {
      e.stopPropagation();
      closeLb();
    });
    lb.querySelector('.gallery-lightbox__backdrop').addEventListener('click', closeLb);
    lb.querySelector('.gallery-lightbox__frame').addEventListener('click', function(e) {
      e.stopPropagation();
    });
    lb.querySelector('.gallery-lightbox__prev').addEventListener('click', function(e) {
      e.stopPropagation();
      if (!lb._urls.length) return;
      lb._index = (lb._index - 1 + lb._urls.length) % lb._urls.length;
      updateLb();
    });
    lb.querySelector('.gallery-lightbox__next').addEventListener('click', function(e) {
      e.stopPropagation();
      if (!lb._urls.length) return;
      lb._index = (lb._index + 1) % lb._urls.length;
      updateLb();
    });
    document.addEventListener('keydown', function galleryLightboxKeydown(e) {
      if (lb.hasAttribute('hidden')) return;
      if (e.key === 'Escape') {
        closeLb();
      } else if (e.key === 'ArrowLeft' && lb._urls.length > 1) {
        lb._index = (lb._index - 1 + lb._urls.length) % lb._urls.length;
        updateLb();
      } else if (e.key === 'ArrowRight' && lb._urls.length > 1) {
        lb._index = (lb._index + 1) % lb._urls.length;
        updateLb();
      }
    });
  }
  if (AcademyContent._galleryLightboxDocClickBound) return;
  AcademyContent._galleryLightboxDocClickBound = true;
  document.addEventListener('click', function(e) {
    var lbEl = document.getElementById('galleryLightbox');
    if (!lbEl || !lbEl._openLb) return;
    var btn = e.target.closest('.gallery-cell__open');
    if (!btn) return;
    var pr = document.getElementById('page-gallery-root');
    if (!pr || !pr.contains(btn)) return;
    var panel = btn.closest('.gallery-album-panel');
    if (!panel) return;
    var urls = [];
    var clickedIndex = 0;
    var found = false;
    panel.querySelectorAll('.gallery-cell__open').forEach(function(b) {
      var im = b.querySelector('img');
      var src = im && im.getAttribute('src');
      if (!src) return;
      if (b === btn) {
        clickedIndex = urls.length;
        found = true;
      }
      urls.push(src);
    });
    if (!urls.length) return;
    if (!found) clickedIndex = 0;
    lbEl._openLb(urls, clickedIndex);
  });
};

/** YouTube watch / shorts / youtu.be / embed → iframe embed URL, or null. */
AcademyContent.youtubeEmbedFromUrl = function(raw) {
  var u = String(raw || '').trim();
  if (!u) return null;
  var m = u.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1] + '?playsinline=1&rel=0&modestbranding=1';
  return null;
};

AcademyContent.youtubeVideoIdFromUrl = function(raw) {
  var u = String(raw || '').trim();
  if (!u) return null;
  var m = u.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
};

/** Viber/Facebook/etc. in-app browsers often block YouTube iframes — use thumbnail link instead. */
AcademyContent.isInAppBrowser = function() {
  var ua = String(navigator.userAgent || '');
  return /FBAN|FBAV|Instagram|Line\/|Viber|Twitter|MicroMessenger|LinkedInApp|Snapchat|BytedanceWebview|musical_ly/i.test(ua);
};

/** Home activities row: fill side video slots (YouTube URL, direct file URL, or uploaded video data URL). */
AcademyContent.applyActivityVideos = function(content, uploads) {
  content = content || {};
  uploads = uploads || {};
  document.querySelectorAll('[data-activity-video-slot]').forEach(function(slot) {
    var num = slot.getAttribute('data-activity-video-slot') || '1';
    var urlKey = 'home_activity_video_' + num;
    var uploadKey = 'home_activity_video_' + num + '_upload';
    var aspect = slot.querySelector('.activities-video-aspect');
    var iframe = slot.querySelector('.activities-video-iframe');
    var vid = slot.querySelector('.activities-video-native');
    var ph = slot.querySelector('.activities-video-placeholder');
    var textVal = content[urlKey] != null ? String(content[urlKey]).trim() : '';
    var upVal = uploads[uploadKey] != null ? String(uploads[uploadKey]).trim() : '';
    function hideYtLink() {
      var link = slot.querySelector('.activities-video-yt-link');
      if (link) {
        link.style.display = 'none';
        link.removeAttribute('href');
        link.innerHTML = '';
      }
    }
    function hideAll() {
      if (iframe) {
        iframe.style.display = 'none';
        iframe.removeAttribute('src');
      }
      if (vid) {
        vid.style.display = 'none';
        vid.removeAttribute('src');
        try { vid.pause(); } catch (e) {}
      }
      hideYtLink();
      if (ph) ph.style.display = '';
    }
    function showYt(src, watchUrl) {
      var videoId = AcademyContent.youtubeVideoIdFromUrl(watchUrl || src);
      var useThumbLink = AcademyContent.isInAppBrowser() && videoId;
      if (useThumbLink && aspect) {
        var link = slot.querySelector('.activities-video-yt-link');
        if (!link) {
          link = document.createElement('a');
          link.className = 'activities-video-yt-link';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.setAttribute('aria-label', 'Watch on YouTube');
          aspect.appendChild(link);
        }
        link.href = watchUrl || ('https://www.youtube.com/watch?v=' + videoId);
        link.innerHTML =
          '<img src="https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg" alt="" loading="eager">' +
          '<span class="activities-video-yt-play" aria-hidden="true"><i class="fa-brands fa-youtube"></i></span>';
        link.style.display = 'block';
        if (iframe) {
          iframe.style.display = 'none';
          iframe.removeAttribute('src');
        }
        if (vid) {
          vid.style.display = 'none';
          vid.removeAttribute('src');
        }
        if (ph) ph.style.display = 'none';
        return;
      }
      hideYtLink();
      if (iframe) {
        iframe.setAttribute('loading', 'eager');
        iframe.setAttribute('src', src);
        iframe.style.display = 'block';
      }
      if (vid) {
        vid.style.display = 'none';
        vid.removeAttribute('src');
      }
      if (ph) ph.style.display = 'none';
    }
    function showFile(src) {
      if (!vid || !src) {
        hideAll();
        return;
      }
      vid.src = src;
      vid.style.display = 'block';
      if (iframe) {
        iframe.style.display = 'none';
        iframe.removeAttribute('src');
      }
      if (ph) ph.style.display = 'none';
    }
    if (upVal) {
      showFile(upVal);
      return;
    }
    if (!textVal) {
      hideAll();
      return;
    }
    var yt = AcademyContent.youtubeEmbedFromUrl(textVal);
    if (yt) {
      showYt(yt, textVal);
      return;
    }
    showFile(textVal);
  });
  var videosAside = document.querySelector('.home-activities-videos');
  if (!videosAside) return;
  var anyVideo = false;
  videosAside.querySelectorAll('[data-activity-video-slot]').forEach(function(slot) {
    var ph = slot.querySelector('.activities-video-placeholder');
    var iframe = slot.querySelector('.activities-video-iframe');
    var vid = slot.querySelector('.activities-video-native');
    var ytLink = slot.querySelector('.activities-video-yt-link');
    var hasMedia =
      (iframe && iframe.style.display !== 'none' && iframe.getAttribute('src')) ||
      (vid && vid.style.display !== 'none' && vid.getAttribute('src')) ||
      (ytLink && ytLink.style.display !== 'none' && ytLink.getAttribute('href'));
    if (hasMedia) {
      slot.style.display = '';
      anyVideo = true;
    } else {
      slot.style.display = 'none';
      if (ph) ph.style.display = 'none';
    }
  });
  videosAside.style.display = anyVideo ? '' : 'none';
};

AcademyContent.DEFAULT_HOME_ACTIVITIES_SLIDES = [
  { caption: 'ACTIVITY 1', image_key: 'home_activity_slide_0' },
  { caption: 'ACTIVITY 2', image_key: 'home_activity_slide_1' }
];

/** Single caption line (legacy caption_en / caption_my merged). */
AcademyContent.homeActivitySlideCaption = function(item) {
  if (!item || typeof item !== 'object') return '';
  if (item.caption != null && String(item.caption).trim() !== '') return String(item.caption).trim();
  var en = item.caption_en != null ? String(item.caption_en).trim() : '';
  var my = item.caption_my != null ? String(item.caption_my).trim() : '';
  if (!my || my === '\uFFFD' || /^[\s\u00a0]+$/.test(my)) my = '';
  return en || my;
};

/** Fallback file paths when Admin/Firebase has no upload for a slide (served from website/photo/). */
AcademyContent.DEFAULT_HOME_ACTIVITY_IMAGE_PATHS = {
  home_activity_slide_0: '../photo/activity1.jpg',
  home_activity_slide_1: '../photo/activity1.jpg'
};

/** CMS upload, then default file path for slide key (same order as public carousel). */
AcademyContent.resolveHomeActivitySlideImageSrc = function(key, uploads) {
  if (!key) return null;
  uploads = uploads || {};
  var up = uploads[key];
  if (up != null && up !== '' && String(up).trim() !== '') return up;
  var paths = AcademyContent.DEFAULT_HOME_ACTIVITY_IMAGE_PATHS;
  if (paths && paths[key]) return paths[key];
  return null;
};

/**  upload /   classroom   placeholder  ( ➕ ) */
AcademyContent.ACTIVITY_SLIDE_PLACEHOLDER_SVG = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect fill="#e8edf3" width="1200" height="675"/><text x="600" y="310" text-anchor="middle" fill="#475569" font-family="system-ui,-apple-system,sans-serif" font-size="26">    </text><text x="600" y="360" text-anchor="middle" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="18">Upload image or set file path in Admin</text></svg>'
);

/**
 * Firebase Realtime DB often stores arrays as { "0": row, "1": row, ... } — restore a real array so all slides load.
 */
AcademyContent.coerceHomeActivitiesSlides = function(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    return raw.filter(function(item) { return item && typeof item === 'object'; });
  }
  if (typeof raw === 'object') {
    var keys = Object.keys(raw);
    if (!keys.length) return [];
    var allNum = keys.every(function(k) { return /^\d+$/.test(String(k)); });
    keys.sort(function(a, b) {
      if (allNum) return Number(a) - Number(b);
      return String(a).localeCompare(String(b));
    });
    var out = [];
    keys.forEach(function(k) {
      var item = raw[k];
      if (item && typeof item === 'object' && !Array.isArray(item)) out.push(item);
    });
    return out;
  }
  return null;
};

/** Build / refresh home activities carousel from content.home_activities_slides + uploads. */
AcademyContent.renderHomeActivitiesCarousel = function(content, uploads) {
  var track = document.getElementById('activitiesCarouselTrack');
  if (!track) return;
  content = content || {};
  uploads = uploads || {};
  var slides = AcademyContent.coerceHomeActivitiesSlides(content.home_activities_slides);
  if (slides == null) {
    slides = AcademyContent.DEFAULT_HOME_ACTIVITIES_SLIDES.slice();
  } else if (!slides.length) {
    track.innerHTML = '';
    track.style.width = '100%';
    return;
  }
  var n = slides.length;
  var esc = function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var escAttr = function(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
  track.style.width = (n * 100) + '%';
  track.innerHTML = slides.map(function(item, i) {
    var key = item.image_key || ('home_activity_slide_' + i);
    var src = AcademyContent.resolveHomeActivitySlideImageSrc(key, uploads)
      || AcademyContent.ACTIVITY_SLIDE_PLACEHOLDER_SVG;
    var captionShown = AcademyContent.homeActivitySlideCaption(item);
    var pct = (100 / n);
    return '<article class="activities-slide' + (i === 0 ? ' is-active' : '') + '" style="flex:0 0 ' + pct + '%;box-sizing:border-box">' +
      '<img src="' + escAttr(src) + '" alt="" loading="lazy" data-upload-id="' + escAttr(key) + '">' +
      '<p class="activities-slide-caption">' + esc(captionShown) + '</p></article>';
  }).join('');

  /* Prevent broken-image icon: always fall back to safe SVG placeholder. */
  track.querySelectorAll('img[data-upload-id]').forEach(function(img) {
    img.onerror = function() {
      if (img.getAttribute('src') !== AcademyContent.ACTIVITY_SLIDE_PLACEHOLDER_SVG) {
        img.setAttribute('src', AcademyContent.ACTIVITY_SLIDE_PLACEHOLDER_SVG);
      }
    };
  });
};

AcademyContent.syncActivitiesSlideCaptionLang = function() {
  /* Public site uses a single caption per slide (no EN/MY switch). */
};

/** Set data-activities-interval (ms) on .home-activities-wrap from content.home_activities_carousel_interval_sec (seconds). */
AcademyContent.applyHomeActivitiesCarouselInterval = function(content) {
  var wrap = document.querySelector('.home-activities-wrap');
  if (!wrap) return;
  var raw = content && content.home_activities_carousel_interval_sec;
  var sec = parseFloat(raw != null ? String(raw).replace(',', '.') : '');
  if (isNaN(sec) || sec < 2) sec = 5;
  if (sec > 120) sec = 120;
  wrap.setAttribute('data-activities-interval', String(Math.round(sec * 1000)));
};

AcademyContent.initHomeActivitiesCarousel = function() {
  var track = document.getElementById('activitiesCarouselTrack');
  var root = track && track.closest('.activities-carousel');
  if (!track || !root) return;
  if (root._activitiesTimer) {
    clearInterval(root._activitiesTimer);
    root._activitiesTimer = null;
  }
  var wrap = root.closest('.home-activities-wrap');
  var slideEls = track.querySelectorAll('.activities-slide');
  var n = slideEls.length;
  if (!n) return;
  var idx = 0;
  var intervalMs = wrap && wrap.getAttribute('data-activities-interval') ? parseInt(wrap.getAttribute('data-activities-interval'), 10) : 5000;
  if (isNaN(intervalMs) || intervalMs < 2000) intervalMs = 5000;
  var prevBtn = root.querySelector('.activities-carousel-prev');
  var nextBtn = root.querySelector('.activities-carousel-next');
  if (n <= 1) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    track.style.transform = 'translateX(0)';
    slideEls.forEach(function(s, j) { s.classList.toggle('is-active', j === 0); });
    return;
  }
  if (prevBtn) prevBtn.style.display = '';
  if (nextBtn) nextBtn.style.display = '';
  function go(to) {
    idx = ((to % n) + n) % n;
    track.style.transform = 'translateX(-' + (100 * idx / n) + '%)';
    slideEls.forEach(function(s, j) { s.classList.toggle('is-active', j === idx); });
  }
  function next() { go(idx + 1); }
  function prev() { go(idx - 1); }
  function startTimer() {
    if (root._activitiesTimer) clearInterval(root._activitiesTimer);
    root._activitiesTimer = setInterval(next, intervalMs);
  }
  if (nextBtn) {
    nextBtn.onclick = function() { next(); startTimer(); };
  }
  if (prevBtn) {
    prevBtn.onclick = function() { prev(); startTimer(); };
  }
  root.onmouseenter = function() { if (root._activitiesTimer) clearInterval(root._activitiesTimer); };
  root.onmouseleave = startTimer;
  go(0);
  startTimer();
};

AcademyContent.initHomeTestimonialsCarousel = function() {
  var track = document.getElementById('home-testimonials-grid');
  var root = document.getElementById('homeTestimonialsCarousel');
  var dotsWrap = document.getElementById('homeTestimonialsDots');
  if (!track || !root) return;
  var cards = Array.prototype.slice.call(track.querySelectorAll('.testimonial-card'));
  var prevBtn = root.querySelector('.testimonials-carousel-prev');
  var nextBtn = root.querySelector('.testimonials-carousel-next');
  if (!cards.length) return;

  var idx = 0;
  var pages = 1;
  function perView() {
    var w = (window.innerWidth || 1200);
    if (w <= 680) return 1;
    if (w <= 980) return 2;
    return 3;
  }
  function rebuildDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    for (var i = 0; i < pages; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot' + (i === idx ? ' is-active' : '');
      b.setAttribute('aria-label', 'Go to testimonial page ' + (i + 1));
      (function(go) { b.onclick = function() { idx = go; render(); }; })(i);
      dotsWrap.appendChild(b);
    }
  }
  function render() {
    var pv = perView();
    pages = Math.max(1, Math.ceil(cards.length / pv));
    if (idx >= pages) idx = pages - 1;
    if (idx < 0) idx = 0;
    var pct = (100 / pv) * idx;
    track.style.transform = 'translateX(-' + pct + '%)';
    if (prevBtn) prevBtn.style.display = pages > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = pages > 1 ? '' : 'none';
    rebuildDots();
  }
  if (nextBtn) nextBtn.onclick = function() { idx = (idx + 1) % pages; render(); };
  if (prevBtn) prevBtn.onclick = function() { idx = (idx - 1 + pages) % pages; render(); };
  try {
    if (window.__mneaTestimonialsResizeHandler) window.removeEventListener('resize', window.__mneaTestimonialsResizeHandler);
  } catch (e) {}
  window.__mneaTestimonialsResizeHandler = function() { render(); };
  window.addEventListener('resize', window.__mneaTestimonialsResizeHandler);
  render();
};

AcademyContent.initHomeTeachersCarousel = function() {
  var track = document.getElementById('home-teachers-grid');
  var root = document.getElementById('homeTeachersCarousel');
  var dotsWrap = document.getElementById('homeTeachersDots');
  if (!track || !root) return;
  var cards = Array.prototype.slice.call(track.querySelectorAll('.teacher-card'));
  var prevBtn = root.querySelector('.teachers-carousel-prev');
  var nextBtn = root.querySelector('.teachers-carousel-next');
  if (!cards.length) return;

  var idx = 0;
  var pages = cards.length;
  var timer = null;
  function perView() {
    var w = (window.innerWidth || 1200);
    if (w <= 760) return 1;
    if (w <= 1024) return 2;
    return 3;
  }
  function rebuildDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    for (var i = 0; i < pages; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot' + (i === idx ? ' is-active' : '');
      b.setAttribute('aria-label', 'Go to teacher ' + (i + 1));
      (function(go) { b.onclick = function() { idx = go; render(); }; })(i);
      dotsWrap.appendChild(b);
    }
  }
  function render() {
    var pv = perView();
    pages = Math.max(1, Math.ceil(cards.length / pv));
    if (idx >= pages) idx = pages - 1;
    if (idx < 0) idx = 0;
    track.style.transform = 'translateX(-' + ((100 / pv) * idx) + '%)';
    if (prevBtn) prevBtn.style.display = pages > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = pages > 1 ? '' : 'none';
    rebuildDots();
  }
  function next() { idx = (idx + 1) % pages; render(); }
  function prev() { idx = (idx - 1 + pages) % pages; render(); }
  function startTimer() {
    if (timer) clearInterval(timer);
    if (pages <= 1) return;
    timer = setInterval(next, 3500);
  }
  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  if (nextBtn) nextBtn.onclick = function() { next(); startTimer(); };
  if (prevBtn) prevBtn.onclick = function() { prev(); startTimer(); };
  root.onmouseenter = stopTimer;
  root.onmouseleave = startTimer;
  try {
    if (window.__mneaTeachersResizeHandler) window.removeEventListener('resize', window.__mneaTeachersResizeHandler);
  } catch (e) {}
  window.__mneaTeachersResizeHandler = function() { render(); startTimer(); };
  window.addEventListener('resize', window.__mneaTeachersResizeHandler);
  render();
  startTimer();
};

/** First non-empty CMS field from a list of keys (site-wide settings). */
AcademyContent.pickContentField = function(content, keys) {
  content = content || {};
  keys = keys || [];
  for (var i = 0; i < keys.length; i++) {
    var v = content[keys[i]];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

/** Top bar extras are applied separately; this updates footer, social links, and shared contact fields. */
AcademyContent.applySiteGlobals = function(content) {
  content = content || {};
  function escHtmlLite(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  var address = AcademyContent.pickContentField(content, ['contact_address']);
  if (address) {
    document.querySelectorAll('.footer-address').forEach(function(el) { el.textContent = address; });
  }
  var phone = AcademyContent.pickContentField(content, ['site_phone', 'contact_phone']);
  if (phone) {
    var parts = phone.split(/,\s*/).filter(function(p) { return String(p).trim(); });
    document.querySelectorAll('.footer-phone span').forEach(function(span) {
      span.innerHTML = parts.map(function(p) {
        p = String(p).trim();
        var digits = p.replace(/\D/g, '');
        return '<a href="tel:+' + digits + '">' + escHtmlLite(p) + '</a>';
      }).join(', ');
    });
  }
  var email1 = AcademyContent.pickContentField(content, ['site_email', 'contact_email']);
  var email2 = AcademyContent.pickContentField(content, ['site_email_2', 'contact_email_2']);
  var footerEmails = document.querySelectorAll('.footer-email span');
  if (footerEmails[0] && email1) {
    footerEmails[0].innerHTML = '<a href="mailto:' + escHtmlLite(email1) + '">' + escHtmlLite(email1) + '</a>';
  }
  if (footerEmails[1] && email2) {
    footerEmails[1].innerHTML = '<a href="mailto:' + escHtmlLite(email2) + '">' + escHtmlLite(email2) + '</a>';
  }
  var socialRows = [
    ['site_social_facebook', 'contact_fb_url', 'social-icon--facebook', 'footer-contact-icon--facebook'],
    ['site_social_youtube', null, 'social-icon--youtube', 'footer-contact-icon--youtube'],
    ['site_social_instagram', null, 'social-icon--instagram', 'footer-contact-icon--instagram'],
    ['site_social_tiktok', null, 'social-icon--tiktok', 'footer-contact-icon--tiktok']
  ];
  socialRows.forEach(function(row) {
    var url = row[1]
      ? AcademyContent.pickContentField(content, [row[0], row[1]])
      : AcademyContent.pickContentField(content, [row[0]]);
    if (!url) return;
    document.querySelectorAll('a.' + row[2]).forEach(function(a) { a.href = url; });
    document.querySelectorAll('a.footer-social').forEach(function(a) {
      if (a.querySelector('.' + row[3])) a.href = url;
    });
  });
};

AcademyContent.initHomeProgramsCarousel = function() {
  var track = document.getElementById('home-programs-grid');
  var dotsWrap = document.getElementById('homeProgramsDots');
  if (!track) return;
  try {
    if (window.__mneaProgramsCarouselInterval) clearInterval(window.__mneaProgramsCarouselInterval);
  } catch (eClr) {}
  window.__mneaProgramsCarouselInterval = null;

  var viewport = track.closest('.programs-carousel-viewport') || track.parentElement;
  var idx = 0;
  var pages = 1;
  var dragThresholdPx = 8;
  var snapThresholdPx = 48;
  var pointerActive = false;
  var dragMoved = false;
  var startClientX = 0;
  var baseOffsetPx = 0;

  function perView() {
    var w = (window.innerWidth || 1200);
    if (w <= 680) return 1;
    if (w <= 1024) return 2;
    return 3;
  }
  function pageStartOffset(cards, pv, pageIdx) {
    if (!cards.length) return 0;
    var start = pageIdx * pv;
    if (start >= cards.length) start = Math.max(0, cards.length - 1);
    return cards[start] ? cards[start].offsetLeft : 0;
  }
  function rebuildDots() {
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    for (var i = 0; i < pages; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dot' + (i === idx ? ' is-active' : '');
      b.setAttribute('aria-label', 'Go to program page ' + (i + 1));
      (function(go) { b.onclick = function() { idx = go; render(); }; })(i);
      dotsWrap.appendChild(b);
    }
  }
  function render() {
    var cards = Array.prototype.slice.call(track.querySelectorAll('.program-card'));
    if (!cards.length) {
      pages = 1;
      if (dotsWrap) dotsWrap.innerHTML = '';
      track.style.transform = 'translateX(0)';
      track.classList.remove('is-dragging');
      return;
    }
    var pv = perView();
    pages = Math.max(1, Math.ceil(cards.length / pv));
    if (idx >= pages) idx = pages - 1;
    if (idx < 0) idx = 0;
    function applyTransform() {
      var off = pageStartOffset(cards, pv, idx);
      track.style.transform = 'translateX(-' + off + 'px)';
    }
    applyTransform();
    requestAnimationFrame(applyTransform);
    rebuildDots();
  }
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var cards = Array.prototype.slice.call(track.querySelectorAll('.program-card'));
    if (cards.length <= perView()) return;
    var el = e.target;
    var onCard = el.closest && el.closest('.program-card');
    if (!onCard && el !== track) return;
    pointerActive = true;
    dragMoved = false;
    startClientX = e.clientX;
    var pv = perView();
    baseOffsetPx = pageStartOffset(cards, pv, idx);
  }
  function onPointerMove(e) {
    if (!pointerActive) return;
    var dx = e.clientX - startClientX;
    if (!dragMoved && Math.abs(dx) < dragThresholdPx) return;
    if (!dragMoved) {
      dragMoved = true;
      track.style.transition = 'none';
      viewport.classList.add('is-dragging');
      try { track.setPointerCapture(e.pointerId); } catch (eCap) {}
    }
    try { e.preventDefault(); } catch (ePe) {}
    var cards = Array.prototype.slice.call(track.querySelectorAll('.program-card'));
    var pv = perView();
    var pgs = Math.max(1, Math.ceil(cards.length / pv));
    var minOff = pageStartOffset(cards, pv, 0);
    var maxOff = pageStartOffset(cards, pv, pgs - 1);
    var raw = baseOffsetPx - dx;
    if (raw < minOff) raw = minOff + (raw - minOff) * 0.25;
    if (raw > maxOff) raw = maxOff + (raw - maxOff) * 0.25;
    track.style.transform = 'translateX(-' + raw + 'px)';
  }
  function onPointerUp(e) {
    if (!pointerActive) return;
    pointerActive = false;
    try { track.releasePointerCapture(e.pointerId); } catch (eRel) {}
    var dx = e.clientX - startClientX;
    track.style.transition = '';
    viewport.classList.remove('is-dragging');
    if (!dragMoved) return;
    track.addEventListener('click', function swallowNavClick(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }, { capture: true, once: true });
    if (dx > snapThresholdPx && idx > 0) idx--;
    else if (dx < -snapThresholdPx && idx < pages - 1) idx++;
    render();
  }
  var prevH = track.__mneaProgramsPointerHandlers;
  if (prevH) {
    track.removeEventListener('pointerdown', prevH.down, prevH.downCapture);
    track.removeEventListener('pointermove', prevH.move);
    track.removeEventListener('pointerup', prevH.up);
    track.removeEventListener('pointercancel', prevH.up);
  }
  track.__mneaProgramsPointerHandlers = {
    down: onPointerDown,
    downCapture: true,
    move: onPointerMove,
    up: onPointerUp
  };
  track.addEventListener('pointerdown', onPointerDown, true);
  track.addEventListener('pointermove', onPointerMove);
  track.addEventListener('pointerup', onPointerUp);
  track.addEventListener('pointercancel', onPointerUp);
  try {
    if (window.__mneaProgramsResizeHandler) window.removeEventListener('resize', window.__mneaProgramsResizeHandler);
  } catch (e) {}
  window.__mneaProgramsResizeHandler = function() { render(); };
  window.addEventListener('resize', window.__mneaProgramsResizeHandler);
  render();
};

AcademyContent.apply = function() {
  function applySiteData(data) {
    var content = (data && data.content && typeof data.content === 'object' && Object.keys(data.content).length > 0) ? data.content : AcademyContent.load();
    if (!content || typeof content !== 'object') content = {};
    if (AcademyContent.repairSwappedCourseSlots) AcademyContent.repairSwappedCourseSlots(content);
    var escCourse = function(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    var escAttr = function(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    var slidesFixed = AcademyContent.coerceHomeActivitiesSlides(content.home_activities_slides);
    if (slidesFixed != null) content.home_activities_slides = slidesFixed;
    var uploads = (data && data.uploads && typeof data.uploads === 'object') ? data.uploads : AcademyContent.loadUploads();
    (function migrateAboutWelcomeContent(c) {
      if (!c || typeof c !== 'object') return;
      var lead = c.about_welcome_lead != null ? String(c.about_welcome_lead).trim() : '';
      var body = c.about_welcome_text != null ? String(c.about_welcome_text) : '';
      if (lead) return;
      var plain = body.replace(/<br\s*\/?>/gi, '\n');
      var m = plain.match(/^\s*<strong>([\s\S]*?)<\/strong>\s*(?:\n|\r\n?)?([\s\S]*)$/i);
      if (m) {
        c.about_welcome_lead = m[1].replace(/<[^>]+>/g, '').trim();
        c.about_welcome_text = m[2].replace(/<[^>]+>/g, '').trim();
      }
    })(content);
    /** CMS may still store old hero title "📚 COURSES"; strip book emojis; map COURSES/PROGRAMS → Programs. */
    function normalizeCoursePageTitle(val) {
      var s = String(val == null ? '' : val).trim();
      var bookLead = /^(📚|📖|📕|📗|📘|📙)\s*/;
      while (bookLead.test(s)) s = s.replace(bookLead, '').trim();
      if (!s || /^courses$/i.test(s) || /^programs$/i.test(s)) s = 'Programs';
      return s;
    }
    var PROGRAMS_SECTION_HEADING_IDS = {
      course_our_title: 1,
      course_features_title: 1,
      course_join_title: 1,
      course_outcomes_title: 1,
      course_cta_title: 1
    };
    if (Object.keys(content).length > 0) {
      document.querySelectorAll('[data-content-id]').forEach(function(el) {
        var id = el.getAttribute('data-content-id');
        var val = content[id];
        if (val === undefined || val === null) return;
        if (/^(hero_check[123]|pt_cta_check[12]|course_cta_check[12])$/.test(id)) {
          val = String(val).replace(/^\s*[\u2713\u2714✔]\s*/u, '').trim();
        }
        /* Old site copy: migrate 20 → 60 for placement duration line (CMS may still return 20) */
        if (id === 'course_cta_check1' || id === 'pt_cta_check1') {
          val = String(val).trim().replace(/^20(\s*[-–]?\s*minute)/i, '60$1').replace(/^20(\s+min\b)/i, '60$1');
        }
        if (id === 'hero_btn2' && String(val).trim() === 'View Courses') val = 'View Programs';
        if (id === 'pt_cta_subtitle' && String(val).trim() === 'Take our FREE placement test and discover the perfect course for you.') {
          val = 'Take our FREE placement test and discover the perfect program for you.';
        }
        if (el.tagName === 'IMG') {
          el.src = val;
          if (val) el.style.display = '';
        } else if (el.getAttribute('data-content-html') === '1') {
          el.innerHTML = val.replace(/\n/g, '<br>');
        } else if (id === 'hero_title') {
          var s = String(val).replace(/\n/g, '<br>');
          s = s.replace(/Skillswith/gi, 'Skills with');
          if (s.indexOf('<br>') === -1 && /Skills\s+with/i.test(s)) s = s.replace(/\s+with\s+/i, '<br>with ');
          el.innerHTML = s;
        } else if (id === 'contact_phone' && el.tagName === 'A') {
          el.textContent = val;
          el.href = 'tel:' + (val || '').replace(/\D/g, '');
        } else if ((id === 'contact_email' || id === 'contact_email_2') && el.tagName === 'A') {
          el.textContent = val;
          el.href = 'mailto:' + (val || '');
        } else if (id === 'course_page_title') {
          el.textContent = normalizeCoursePageTitle(val);
        } else if (PROGRAMS_SECTION_HEADING_IDS[id]) {
          el.textContent = AcademyContent.normalizeProgramsSectionHeading(id, val);
        } else if (id === 'about_facilities_section_title' && String(val).trim() === 'Facilities / Gallery') {
          el.textContent = 'Facilities';
        } else if (id === 'course_cta_check1' || id === 'pt_cta_check1') {
          var rawCtaMin = String(val).trim();
          var mCta = rawCtaMin.match(/^(\d+)([\s\S]*)$/);
          if (mCta) {
            el.textContent = '';
            var spanCta = document.createElement('span');
            spanCta.className = 'content-duration-mins';
            spanCta.textContent = mCta[1];
            el.appendChild(spanCta);
            el.appendChild(document.createTextNode(mCta[2]));
          } else {
            el.textContent = rawCtaMin;
          }
        } else {
          el.textContent = val;
        }
      });
      /* FAQ accordion: render from content.faq_items or fallback to faq1_q/a ... faq5_q/a */
      var faqItems = content.faq_items;
      if (!Array.isArray(faqItems) || faqItems.length === 0) {
        faqItems = [];
        for (var i = 1; i <= 5; i++) {
          var q = content['faq' + i + '_q'];
          var a = content['faq' + i + '_a'];
          if (q != null || a != null) faqItems.push({ q: (q != null ? q : ''), a: (a != null ? a : '') });
        }
      }
      if (faqItems.length > 0) {
        var container = document.getElementById('faq-accordion');
        if (container) {
          var esc = function(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          };
          container.innerHTML = faqItems.map(function(item, i) {
            var idx = i + 1;
            var q = esc(item.q || '');
            var a = esc((item.a || '').replace(/\n/g, '<br>'));
            return '<div class="faq-item"><button type="button" class="faq-question" aria-expanded="false" aria-controls="faq-' + idx + '" id="faq-q-' + idx + '"><span class="faq-q-text">' + q + '</span><span class="faq-icon" aria-hidden="true">+</span></button><div class="faq-answer" id="faq-' + idx + '" role="region" aria-labelledby="faq-q-' + idx + '" hidden><p>' + a + '</p></div></div>';
          }).join('');
        }
      }
    }
    /* About page: Our Partners */
    var aboutPartnersEl = document.getElementById('about-partners-list');
    if (aboutPartnersEl) {
      var partnerDefaults = [
        { text: 'Pearson Edexcel is one of the UK\'s largest awarding organizations, providing academic and vocational qualifications. It offers a range of IGCSEs, A-levels, and BTEC courses recognized globally. The organization focuses on enriching the learning experience, ensuring learners are prepared for both academic and professional success.', image_key: 'about_partner_0_image', image: '../photo/pe.png' },
        { text: 'PS Business School provides a wide range of Business & Management Programs from Foundation level to Master Degree since 2007. It is an approved centre of Pearson BTEC and ABE (UK). Then, it is also an official partner of IU International University of Applied Sciences, Germany to provide Bachelor and Master Degrees.', image_key: 'about_partner_1_image', image: '../photo/psbusinessschool.png' },
        { text: 'Global Study Partners (GSP) is a digital platform connecting students with global educational opportunities. Through technology, GSP simplifies the application process, guiding students to suitable courses and institutions, fostering international educational collaboration.', image_key: 'about_partner_2_image', image: '../photo/gsp.png' }
      ];
      function aboutPartnerCombinedText(it, index) {
        var text = it && it.text != null ? String(it.text).trim() : '';
        var name = it && it.name != null ? String(it.name).trim() : '';
        if (text && name && text.indexOf(name) !== 0) return (name + ' ' + text).trim();
        if (text) return text;
        if (name) return name;
        var def = partnerDefaults[index % partnerDefaults.length] || {};
        return def.text || '';
      }
      function aboutPartnerParagraphHtml(full) {
        full = String(full || '');
        var m = full.match(/^(.+?)\s+(is|provides|are|was|has|have|offers|connects)\s+/i);
        if (m && m[1].length <= 80) {
          var lead = m[1];
          var rest = full.slice(lead.length).replace(/^\s+/, '');
          return '<strong>' + escPartner(lead) + '</strong> ' + escPartner(rest);
        }
        return escPartner(full);
      }
      var partnerItems = content.about_partner_items;
      if (!Array.isArray(partnerItems) || !partnerItems.length) partnerItems = partnerDefaults.slice();
      partnerItems = partnerItems.map(function(it, i) {
        var row = Object.assign({}, it);
        row.text = aboutPartnerCombinedText(row, i);
        delete row.name;
        return row;
      });
      var escPartner = function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      var partnerFallbacks = [
        'photo/pe.png,../photo/pe.png',
        'photo/psbusinessschool.png,../photo/psbusinessschool.png',
        'photo/gsp.png,../photo/gsp.png'
      ];
      aboutPartnersEl.innerHTML = partnerItems.map(function(it, i) {
        var def = partnerDefaults[i] || partnerDefaults[0];
        var key = it.image_key || def.image_key || ('about_partner_' + i + '_image');
        var src = (uploads && uploads[key]) ? uploads[key] : (it.image || def.image || '../photo/pe.png');
        var para = aboutPartnerCombinedText(it, i);
        var alt = para.split(/\s+/).slice(0, 3).join(' ');
        var fb = partnerFallbacks[i % partnerFallbacks.length];
        return '<div class="school-profile-partner" id="partner-' + i + '">' +
          '<div class="school-profile-partner__logo"><img src="' + src + '" alt="' + escPartner(alt) + '" width="320" height="128" loading="lazy" decoding="async" data-upload-id="' + escPartner(key) + '" data-fallbacks="' + escPartner(fb) + '"></div>' +
          '<div class="school-profile-partner__text"><p>' + aboutPartnerParagraphHtml(para) + '</p></div></div>';
      }).join('');
      aboutPartnersEl.querySelectorAll('.school-profile-partner__logo img').forEach(function(img) {
        img.addEventListener('error', function onPartnerImgErr() {
          var raw = (img.getAttribute('data-fallbacks') || '').split(',');
          var list = [];
          for (var pi = 0; pi < raw.length; pi++) {
            var u = String(raw[pi] || '').trim();
            if (u && u !== img.src) list.push(u);
          }
          var tryIdx = parseInt(img.dataset.partnerFb || '0', 10) || 0;
          if (tryIdx < list.length) {
            img.dataset.partnerFb = String(tryIdx + 1);
            img.src = list[tryIdx];
            return;
          }
          img.removeEventListener('error', onPartnerImgErr);
        });
      });
    }
    var aboutFacEl = document.getElementById('about-facilities-grid');
    if (aboutFacEl) {
      var abDefaults = [
        { icon: '📷', title: 'Modern Classrooms', text: 'Comfortable classrooms designed for effective and interactive learning.', image: '../photo/modernclassroom1.png', image_fallbacks: '../photo/modernclassroom1.jpg,photo/modernclassroom1.png,photo/modernclassroom1.jpg', image_key: 'about_facility_0_image' },
        { icon: '🎤', title: 'Speaking Practice Sessions', text: 'Students participate in group discussions and speaking activities to improve fluency.', image: '../photo/speakingsession.jpg', image_fallbacks: '../photo/speakingsession.png,photo/speakingsession.jpg,photo/speakingsession.png', image_key: 'about_facility_1_image' },
        { icon: '🎓', title: 'Student Activities', text: 'Regular learning activities and events that help students practice English in real situations.', image: '../photo/studentactivities.jpg', image_fallbacks: '../photo/studentactivities.png,photo/studentactivities.jpg,photo/studentactivities.png', image_key: 'about_facility_2_image' }
      ];
      var abItems = content.about_facility_items;
      if (!Array.isArray(abItems) || !abItems.length) {
        abItems = abDefaults.slice();
      }
      var escAb = function(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
      function facilityDefForItem(it, idx) {
        var tnorm = String(it.title || '').trim().toLowerCase();
        for (var dj = 0; dj < abDefaults.length; dj++) {
          if (String(abDefaults[dj].title || '').trim().toLowerCase() === tnorm) return abDefaults[dj];
        }
        return abDefaults[idx] || {};
      }
      aboutFacEl.innerHTML = abItems.map(function(it, idx) {
        var def = facilityDefForItem(it, idx);
        var key = it.image_key || def.image_key || ('about_facility_' + idx + '_image');
        var src = (uploads && uploads[key]) ? uploads[key] : (it.image || def.image || '');
        var fallbacks = it.image_fallbacks || def.image_fallbacks || '';
        var iconHtml;
        if (src) {
          iconHtml = '<img src="' + escAttr(src) + '" alt="" class="about-facility-photo" loading="lazy" decoding="async" data-fallbacks="' + escAttr(fallbacks) + '">';
        } else {
          iconHtml = escAb(it.icon !== undefined && it.icon !== '' ? it.icon : (def.icon || ''));
        }
        return '<div class="about-card"><div class="icon">' + iconHtml + '</div><h3>' + escAb(it.title || '') + '</h3><p>' + escAb(it.text || '').replace(/\n/g, '<br>') + '</p></div>';
      }).join('');
      aboutFacEl.querySelectorAll('img.about-facility-photo').forEach(function(img) {
        img.addEventListener('error', function onFacImgErr() {
          img.removeEventListener('error', onFacImgErr);
          var raw = (img.getAttribute('data-fallbacks') || '').split(',');
          var list = [];
          for (var fi = 0; fi < raw.length; fi++) {
            var u = String(raw[fi] || '').trim();
            if (u) list.push(u);
          }
          var tryIdx = parseInt(img.dataset.facFb || '0', 10) || 0;
          if (tryIdx < list.length) {
            img.dataset.facFb = String(tryIdx + 1);
            img.src = list[tryIdx];
            return;
          }
        });
      });
    }
    AcademyContent.applyPhotoGallery(content, uploads);
    /* Our Courses list — single source: getCourseItems (our_courses or course1–5); nav dropdown uses same titles */
    AcademyContent.renderHomeActivitiesCarousel(content, uploads);
    var courseItems = AcademyContent.getCourseItems(content);
    /* Canonical course cards stay in course order; Programs display uses the 6-program marketing order. */
    var courseThumbFallbacks = ['photo/business.jpg', 'photo/classroom.jpg', 'photo/study.jpg', 'photo/classroom.jpg', 'photo/study.jpg'];
    var extraLegacyBySlug = {
      professional: ['course3_image', 'course1_image'],
      general: ['course1_image', 'course2_image'],
      exam: ['course2_image', 'course3_image'],
      english4skills: ['course4_image', 'course3_image', 'course1_image'],
      chinese: ['course5_image'],
      business: ['our_course_1_image', 'course3_image'],
      coding: ['our_course_8_image', 'course8_image', 'course2_image'],
      onlineclass: ['our_course_9_image', 'course9_image', 'our_course_1_image'],
      /* Do not prefer our_course_2 (Pre-IGCSE) for Global Primary — use primary our_course_6 + shared legacy only */
      globalprimary: ['course1_image', 'course2_image']
    };
    function thumbSrcFromItem(item, index) {
      var keys = [];
      var primary = item.image_key || ('our_course_' + (index + 1) + '_image');
      keys.push(primary);
      if (item.legacy_image_key) keys.push(item.legacy_image_key);
      var m = String(item.link || '').match(/[?&]id=([^&"#]+)/);
      var slug = m ? m[1] : '';
      var xs = extraLegacyBySlug[slug];
      if (xs) {
        for (var xi = 0; xi < xs.length; xi++) {
          if (keys.indexOf(xs[xi]) < 0) keys.push(xs[xi]);
        }
      }
      for (var ti = 0; ti < keys.length; ti++) {
        if (uploads && uploads[keys[ti]]) return uploads[keys[ti]];
      }
      if (item.thumb_fallback) return item.thumb_fallback;
      return courseThumbFallbacks[Math.min(index, courseThumbFallbacks.length - 1)] || 'photo/classroom.jpg';
    }
    function programCardFallbacksAttr(item) {
      var base = (item && item.thumb_fallback) ? String(item.thumb_fallback) : 'photo/classroom.jpg';
      return escAttr(base + ',photo/classroom.png,assets/images/courses/classroom.jpg,assets/images/courses/classroom.png');
    }
    function htmlForCourseCard(item, i) {
      var title = escCourse(item.title || '');
      var text = escCourse(item.text || '');
      var link = escCourse(item.link || 'placement-test.html');
      var src = thumbSrcFromItem(item, i);
      var uploadKey = escAttr(item.image_key || '');
      return '<div class="course-card"><div class="thumb"><img src="' + escAttr(src) + '" alt="" class="course-thumb-img" data-upload-id="' + uploadKey + '" data-fallbacks="' + programCardFallbacksAttr(item) + '"><span class="course-thumb-placeholder" style="display:none;">&#x1F4D6;</span></div><div class="body"><h3>' + title + '</h3><p>' + text + '</p><a href="' + link + '" class="btn">View Details</a></div></div>';
    }
    var ourCoursesContainer = document.getElementById('our-courses-grid');
    if (ourCoursesContainer) {
      var pageProgramItems = AcademyContent.getProgramDisplayItems(courseItems);
      ourCoursesContainer.innerHTML = pageProgramItems.map(function(item, i) { return htmlForCourseCard(item, i); }).join('');
    }
    var homePopular = document.getElementById('home-popular-courses-grid');
    if (homePopular) {
      var popularItems = AcademyContent.getProgramDisplayItems(courseItems);
      homePopular.innerHTML = popularItems.map(function(item, i) { return htmlForCourseCard(item, i); }).join('');
    }
    var homePrograms = document.getElementById('home-programs-grid');
    if (homePrograms) {
      var programItems = AcademyContent.getProgramDisplayItems(courseItems);
      homePrograms.innerHTML = programItems.map(function(item, i) {
        var title = escCourse(item.title || ('Program ' + (i + 1)));
        var link = escCourse(item.link || 'courses.html');
        var src = thumbSrcFromItem(item, i);
        var uploadKey = escAttr(item.image_key || '');
        return '<a class="program-card" href="' + link + '" draggable="false"><div class="program-card-image-wrap"><img src="' + escAttr(src) + '" alt="" class="program-card-image" draggable="false" data-upload-id="' + uploadKey + '" data-fallbacks="' + programCardFallbacksAttr(item) + '"><span class="program-card-img-placeholder">Program</span></div><h3 class="program-card-title">' + title + '</h3></a>';
      }).join('');
    }
    AcademyContent.syncNavCourseDropdownFromItems(courseItems);
    document.querySelectorAll('.footer-inner h4[data-lang-en="Programs"]').forEach(function(head) {
      var wrap = head.parentElement;
      var programItems = AcademyContent.getProgramDisplayItems(courseItems);
      if (!wrap) return;
      while (head.nextSibling) wrap.removeChild(head.nextSibling);
      programItems.forEach(function(item) {
        var a = document.createElement('a');
        a.setAttribute('href', item.link);
        a.setAttribute('data-lang-en', item.title);
        a.setAttribute('data-lang-my', item.title);
        a.textContent = item.title;
        wrap.appendChild(a);
      });
    });
    var langNow = (document.body && document.body.getAttribute('data-lang')) || '';
    try {
      if (!langNow && typeof localStorage !== 'undefined') {
        langNow = localStorage.getItem('management-ui-lang') || localStorage.getItem('site-lang') || '';
      }
    } catch (eNav) {}
    if (!langNow) langNow = 'en';
    if (langNow === 'both') {
      document.querySelectorAll('a[data-nav-course]').forEach(function(a) {
        var en = a.getAttribute('data-lang-en');
        var my = a.getAttribute('data-lang-my');
        if (my && en && my !== en && my.indexOf('\uFFFD') === -1) a.textContent = en + ' · ' + my;
        else {
          var tx = en || my;
          if (tx) a.textContent = tx;
        }
      });
    } else {
      var langKey = langNow === 'my' ? 'data-lang-my' : 'data-lang-en';
      document.querySelectorAll('a[data-nav-course]').forEach(function(a) {
        var tx = a.getAttribute(langKey) || a.getAttribute('data-lang-en');
        if (tx) a.textContent = tx;
      });
    }
    var learningEl = document.getElementById('home-learning-method-grid');
    if (learningEl) {
      var learnItems = content.home_learning_items;
      if (Array.isArray(learnItems) && learnItems.length) {
        learnItems = learnItems.filter(function(it) {
          return it && (String(it.title || '').trim() !== '' || String(it.text || '').trim() !== '');
        });
      }
      if (!Array.isArray(learnItems) || !learnItems.length) {
        learnItems = [
          { icon: '💬', title: 'Interactive Classes', text: 'Students actively participate in discussions and activities.' },
          { icon: '🎯', title: 'Real Communication Practice', text: 'Practice speaking English in real-life situations.' },
          { icon: '📖', title: 'International Curriculum', text: 'Learn with globally recognized learning materials.' },
          { icon: '✨', title: 'Modern Teaching Methods', text: 'Modern techniques for effective learning.' }
        ];
      }
      learningEl.innerHTML = learnItems.map(function(it) {
        return '<div class="why-choose-oval-card why-choose-split-card"><div class="why-choose-split-card-body"><h3>' + escCourse(it.title || '') + '</h3><p>' + escCourse(it.text || '').replace(/\n/g, '<br>') + '</p></div></div>';
      }).join('');
    }
    var facEl = document.getElementById('home-facilities-grid');
    if (facEl) {
      var facItems = content.home_facility_items;
      if (Array.isArray(facItems) && facItems.length) {
        facItems = facItems.filter(function(it) {
          return it && (String(it.title || '').trim() !== '' || String(it.text || '').trim() !== '');
        });
      }
      if (!Array.isArray(facItems) || !facItems.length) {
        facItems = [
          { icon: 'fa-solid fa-chalkboard-user', title: 'Modern Classrooms', text: 'Well-equipped classrooms designed for comfortable and effective learning.' },
          { icon: 'fa-solid fa-headphones', title: 'Listening Labs', text: 'Practice listening skills using modern audio equipment and materials.' },
          { icon: 'fa-solid fa-users', title: 'Small Group Classes', text: 'Small class sizes allow teachers to give more attention to every student.' },
          { icon: 'fa-solid fa-sun', title: 'Comfortable Learning Environment', text: 'A friendly and supportive atmosphere that helps students learn with confidence.' }
        ];
      }
      function facilityIconHtml(iconRaw) {
        var s = String(iconRaw || '').trim();
        if (!s) return '';
        var norm = s.replace(/\s+/g, ' ').trim();
        if (/^(fa-brands|fa-regular|fa-solid|fas|far|fab)\s/i.test(norm)) {
          var safe = norm.replace(/[^a-zA-Z0-9\s_-]/g, '').replace(/\s+/g, ' ').trim();
          return safe ? '<span class="facilities-split-card-icon"><i class="' + safe + '" aria-hidden="true"></i></span>' : '';
        }
        return '<span class="facilities-split-card-icon" aria-hidden="true">' + escCourse(s) + '</span>';
      }
      facEl.innerHTML = facItems.map(function(it) {
        var ic = facilityIconHtml(it.icon);
        var h3 = '<h3>' + escCourse(it.title || '') + '</h3>';
        var head = ic ? '<div class="facilities-split-card-heading">' + ic + h3 + '</div>' : '<div class="facilities-split-card-heading facilities-split-card-heading--notext">' + h3 + '</div>';
        return '<div class="why-choose-oval-card why-choose-split-card facilities-split-card"><div class="why-choose-split-card-body">' + head + '<p>' + escCourse(it.text || '').replace(/\n/g, '<br>') + '</p></div></div>';
      }).join('');
    }
    var htEl = document.getElementById('home-teachers-grid');
    if (htEl) {
      var htList = content.home_teachers;
      if (!Array.isArray(htList) || !htList.length) {
        htList = [];
        if (content.home_teacher1_name != null || content.home_teacher1_exp != null || content.home_teacher1_spec != null) {
          htList.push({
            name: content.home_teacher1_name != null ? String(content.home_teacher1_name) : '',
            exp: content.home_teacher1_exp != null ? String(content.home_teacher1_exp) : '',
            spec: content.home_teacher1_spec != null ? String(content.home_teacher1_spec) : '',
            image_key: 'home_teacher1_photo'
          });
        }
        if (content.home_teacher2_name != null || content.home_teacher2_exp != null || content.home_teacher2_spec != null) {
          htList.push({
            name: content.home_teacher2_name != null ? String(content.home_teacher2_name) : '',
            exp: content.home_teacher2_exp != null ? String(content.home_teacher2_exp) : '',
            spec: content.home_teacher2_spec != null ? String(content.home_teacher2_spec) : '',
            image_key: 'home_teacher2_photo'
          });
        }
        if (!htList.length) {
          htList = [
            { name: 'Teacher A', exp: '10+ Years Experience', spec: 'IELTS & Academic English', image_key: 'home_teacher1_photo' },
            { name: 'Teacher B', exp: '10+ Years Experience', spec: 'Business English', image_key: 'home_teacher2_photo' }
          ];
        }
      }
      var tFall = ['photo/teacher1.png', 'photo/teacher3.png'];
      var tDataFb = ['photo/teacher1.jpg,assets/images/teachers/teacher1.png,assets/images/teachers/teacher1.jpg', 'photo/teacher3.jpg,assets/images/teachers/teacher3.png,assets/images/teachers/teacher3.jpg'];
      htEl.innerHTML = htList.map(function(it, i) {
        var ikey = it.image_key || ('home_teacher_' + i + '_photo');
        var tsrc = (uploads && uploads[ikey]) ? uploads[ikey] : tFall[i % tFall.length];
        var dfb = tDataFb[i % tDataFb.length];
        return '<div class="teacher-card"><div class="teacher-photo-wrap"><img src="' + tsrc + '" alt="" class="teacher-photo" data-upload-id="' + escCourse(ikey) + '" data-fallbacks="' + escCourse(dfb) + '"><span class="teacher-photo-placeholder" style="display:none;" aria-hidden="true">Photo</span></div><h3>' + escCourse(it.name || '') + '</h3><p class="teacher-exp">' + escCourse(it.exp || '') + '</p><p class="teacher-spec">' + escCourse(it.spec || '') + '</p></div>';
      }).join('');
    }
    var tstEl = document.getElementById('home-testimonials-grid');
    if (tstEl) {
      var tsList = content.home_testimonials;
      if (!Array.isArray(tsList) || !tsList.length) {
        tsList = [];
        for (var ti = 1; ti <= 3; ti++) {
          var sq = content['story' + ti + '_quote'];
          var sa = content['story' + ti + '_author'];
          var sm = content['story' + ti + '_meta'];
          if (sq != null || sa != null || sm != null) {
            tsList.push({
              quote: sq != null ? String(sq) : '',
              author: sa != null ? String(sa) : '',
              meta: sm != null ? String(sm) : '',
              image_key: 'story' + ti + '_photo'
            });
          }
        }
        if (!tsList.length) {
          tsList = [
            { quote: '"The speaking classes improved my confidence a lot. I used to be nervous when talking in English, but now I can join discussions and present without fear. I\'m really grateful to the teachers at Myanmar New Era."', author: 'Aye Aye', meta: 'Speaking · 2024', image_key: 'story1_photo' },
            { quote: '"I got IELTS Band 6 after studying here. The exam preparation course was very systematic and covered all four skills. The practice tests and feedback helped me understand my weak areas and improve."', author: 'Ko Min', meta: 'IELTS Preparation · 2024', image_key: 'story2_photo' },
            { quote: '"Great teachers and a friendly learning environment. The course focused on all four skills—listening, speaking, reading, and writing—and I could feel my English getting better every week. I would recommend Myanmar New Era to anyone who wants to learn English properly."', author: 'Thidar', meta: 'General English · 2024', image_key: 'story3_photo' }
          ];
        }
      }
      var tstImg = ['photo/student1.jpg', 'photo/student2.jpg', 'photo/student3.jpg'];
      var tstFb = ['photo/student1.png,photo/teacher1.png,assets/images/teachers/teacher1.png', 'photo/student2.png,photo/teacher3.png,assets/images/teachers/teacher3.png', 'photo/student3.png,photo/teacher1.jpg,assets/images/teachers/teacher1.jpg'];
      function tstInitials(name) {
        var p = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!p.length) return '•';
        if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
        return (p[0].charAt(0) + p[p.length - 1].charAt(0)).toUpperCase();
      }
      tstEl.innerHTML = tsList.map(function(it, i) {
        var ikey = it.image_key || ('home_testimonial_' + i + '_photo');
        var isrc = (uploads && uploads[ikey]) ? uploads[ikey] : tstImg[i % tstImg.length];
        var mod = (i % 3) + 1;
        var ini = tstInitials(it.author);
        var qtext = escCourse(it.quote || '').replace(/\n/g, '<br>');
        return '<div class="testimonial-card testimonial-card-' + mod + '"><span class="testimonial-quote" aria-hidden="true">"</span><div class="testimonial-inner"><h3 class="testimonial-name">' + escCourse(it.author || '') + '</h3><p class="testimonial-text">' + qtext + '</p><p class="testimonial-detail"><span class="testimonial-detail-icon" aria-hidden="true">&#x1F393;</span> <span>' + escCourse(it.meta || '') + '</span></p></div><div class="testimonial-photo-wrap"><img src="' + isrc + '" alt="" class="testimonial-photo" data-upload-id="' + escCourse(ikey) + '" data-fallbacks="' + escCourse(tstFb[i % tstFb.length]) + '"><span class="testimonial-photo-placeholder" style="display:none;">' + escCourse(ini) + '</span></div></div>';
      }).join('');
    }
    if (uploads) {
      document.querySelectorAll('[data-upload-id]').forEach(function(el) {
        var id = el.getAttribute('data-upload-id');
        var val = uploads[id];
        if (el.tagName === 'IMG') {
          if (val) { el.src = val; el.style.display = ''; }
          /* when no upload: keep HTML default src (e.g. photo/classroom.jpg) */
          return;
        }
        if (!val) return;
        if (el.getAttribute('data-upload-bg') === '1') {
          el.style.backgroundImage = 'url(' + val + ')';
          el.style.backgroundSize = 'cover';
        }
      });
    }
    AcademyContent.applyActivityVideos(content, uploads);
    AcademyContent.syncActivitiesSlideCaptionLang();
    AcademyContent.applyHomeActivitiesCarouselInterval(content);
    AcademyContent.initHomeActivitiesCarousel();
    AcademyContent.initHomeProgramsCarousel();
    AcademyContent.initHomeTeachersCarousel();
    AcademyContent.initHomeTestimonialsCarousel();
    var lang = (document.body && document.body.getAttribute('data-lang')) || (typeof localStorage !== 'undefined' && localStorage.getItem('site-lang')) || 'en';
    function topBarHoursOneLine(html) {
      if (html == null || html === '') return html;
      return String(html).replace(/<br\s*\/?>/gi, '&nbsp;·&nbsp;');
    }
    var hEn = content.site_hours_en;
    if (hEn != null && String(hEn).trim() !== '') {
      var hoursEl = document.getElementById('topbarHours');
      if (hoursEl) {
        var hoursHtml = topBarHoursOneLine(hEn);
        hoursEl.setAttribute('data-lang-en-html', hoursHtml);
        hoursEl.setAttribute('data-lang-my-html', hoursHtml);
        hoursEl.innerHTML = hoursHtml;
      }
    }
    var sitePhoneVal = AcademyContent.pickContentField(content, ['site_phone', 'contact_phone']);
    if (sitePhoneVal) {
      var phoneEl = document.getElementById('topbarPhone');
      if (phoneEl) {
        phoneEl.innerHTML = '<i class="fa-solid fa-phone top-bar-contact-icon top-bar-contact-icon--phone" aria-hidden="true"></i> ' + sitePhoneVal;
      }
    }
    if (content.site_email != null) {
      var emailEl = document.getElementById('topbarEmail');
      if (emailEl) {
        var e = content.site_email;
        emailEl.innerHTML = '<i class="fa-solid fa-envelope top-bar-contact-icon top-bar-contact-icon--email" aria-hidden="true"></i> <a href="mailto:' + e + '" style="color:inherit">' + e + '</a>';
        emailEl.style.display = '';
      }
    } else if (content.contact_email != null) {
      var emailEl2 = document.getElementById('topbarEmail');
      if (emailEl2) {
        var e2 = content.contact_email;
        emailEl2.innerHTML = '<i class="fa-solid fa-envelope top-bar-contact-icon top-bar-contact-icon--email" aria-hidden="true"></i> <a href="mailto:' + e2 + '" style="color:inherit">' + e2 + '</a>';
        emailEl2.style.display = '';
      }
    }
    if (typeof AcademyContent.applySiteGlobals === 'function') AcademyContent.applySiteGlobals(content);
    if (!window.__academyHeaderMarqueeColors) {
      window.__academyHeaderMarqueeColors = true;
      var mqTrack = document.querySelector('.header-marquee__track');
      if (mqTrack && (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        var mqPalette = ['#1b5e20', '#d62828', '#1d4ed8', '#b45309', '#7c3aed', '#0d9488', '#be185d'];
        var mqIdx = 0;
        var mqLen = mqPalette.length;
        /* After each full cycle, old line2 was palette[i+1]. With +1, new line1 becomes palette[i+1] → same colour twice. Step by 2 when len>2 so new line1 is palette[i+2] ≠ previous line2. */
        var mqStep = mqLen > 2 ? 2 : 1;
        var mqApply = function() {
          var i = mqIdx % mqLen;
          var j = (mqIdx + 1) % mqLen;
          mqTrack.style.setProperty('--header-marquee-c1', mqPalette[i]);
          mqTrack.style.setProperty('--header-marquee-c2', mqPalette[j]);
          mqTrack.style.setProperty('--header-marquee-color', mqPalette[i]);
        };
        mqApply();
        var mqLead = mqTrack.querySelector('.header-marquee__text:not(.header-marquee__text--clone)');
        var mqLastIter = 0;
        (mqLead || mqTrack).addEventListener('animationiteration', function(ev) {
          if (ev.target.classList.contains('header-marquee__text--clone')) return;
          if (ev.animationName && String(ev.animationName).indexOf('header-marquee-seq-a') === -1) return;
          var now = Date.now();
          if (now - mqLastIter < 350) return;
          mqLastIter = now;
          mqIdx = (mqIdx + mqStep) % mqLen;
          mqApply();
        });
      } else if (mqTrack) {
        mqTrack.style.setProperty('--header-marquee-c1', '#1b5e20');
        mqTrack.style.setProperty('--header-marquee-c2', '#1b5e20');
        mqTrack.style.setProperty('--header-marquee-color', '#1b5e20');
      }
    }
    if (typeof AcademyContent.__isNavigationReload === 'function' && AcademyContent.__isNavigationReload()) {
      requestAnimationFrame(function() {
        window.scrollTo(0, 0);
        try {
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        } catch (eScroll) {}
      });
    }
  }
  applySiteData({
    content: AcademyContent.load(),
    uploads: AcademyContent.loadUploads(),
    placementTest: AcademyContent.loadPlacementTest(),
    blogPosts: AcademyContent.loadBlogPosts()
  });
  AcademyContent.getSiteContent(applySiteData);
  if (AcademyContent.__isNavigationReload && AcademyContent.__isNavigationReload()) {
    window.scrollTo(0, 0);
    requestAnimationFrame(function() {
      window.scrollTo(0, 0);
      try {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      } catch (e) {}
    });
  }
};

/** F5 / refresh: browser  scroll     */
AcademyContent.__isNavigationReload = function() {
  try {
    var list = performance.getEntriesByType('navigation');
    if (list && list.length && list[0].type === 'reload') return true;
  } catch (e) {}
  try {
    if (performance.navigation && performance.navigation.type === 1) return true;
  } catch (e2) {}
  return false;
};
(function scrollTopOnPageReload() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  function goTop() {
    window.scrollTo(0, 0);
    try {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch (e3) {}
  }
  function onReload() {
    if (!AcademyContent.__isNavigationReload()) return;
    goTop();
    requestAnimationFrame(function() {
      goTop();
    });
  }
  window.addEventListener('load', onReload);
  window.addEventListener('pageshow', function(ev) {
    if (ev.persisted) return;
    if (AcademyContent.__isNavigationReload()) goTop();
  });
})();

/* Re-apply content when tab becomes visible so admin changes show on website without manual refresh */
(function applyOnVisible() {
  if (typeof document.hidden === 'undefined') return;
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && window.AcademyContent && AcademyContent.apply) AcademyContent.apply();
  });
})();

(function stickyHeaderLogoRow() {
  if (!document.body || !document.body.classList.contains('site-public')) return;
  var row1;
  var inner;
  var spacer;
  var anchorY = 0;

  function ensureDom() {
    row1 = document.querySelector('.site-header .header-row1');
    inner = document.querySelector('.site-header .header-inner');
    if (!row1 || !inner) return false;
    if (!spacer) {
      spacer = inner.querySelector('.header-row1-scroll-spacer');
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.className = 'header-row1-scroll-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.cssText = 'display:none;flex-shrink:0;width:100%;margin:0;padding:0;border:0;';
        inner.insertBefore(spacer, row1.nextSibling);
      }
    }
    return true;
  }

  function setFixed(on) {
    if (!row1 || !spacer) return;
    if (on) {
      var h = row1.offsetHeight;
      row1.classList.add('is-fixed');
      row1.classList.add('is-stuck');
      spacer.style.display = 'block';
      spacer.style.height = h + 'px';
    } else {
      row1.classList.remove('is-fixed');
      row1.classList.remove('is-stuck');
      spacer.style.display = 'none';
      spacer.style.height = '';
    }
  }

  function remeasureAnchor() {
    if (!ensureDom()) return;
    var wasFixed = row1.classList.contains('is-fixed');
    var yKeep = window.scrollY || document.documentElement.scrollTop || 0;
    row1.classList.remove('is-fixed');
    row1.classList.remove('is-stuck');
    spacer.style.display = 'none';
    spacer.style.height = '';
    void row1.offsetHeight;
    anchorY = Math.floor(row1.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop || 0));
    if (wasFixed && yKeep >= anchorY - 0.5) setFixed(true);
  }

  function onScroll() {
    if (!ensureDom()) return;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var shouldFix = y >= anchorY - 0.5;
    if (shouldFix) {
      if (!row1.classList.contains('is-fixed')) setFixed(true);
      else {
        var h = row1.offsetHeight;
        if (spacer.style.display === 'block' && Math.abs(parseFloat(spacer.style.height) - h) > 1) spacer.style.height = h + 'px';
      }
    } else if (row1.classList.contains('is-fixed')) setFixed(false);
  }

  var resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      remeasureAnchor();
      onScroll();
    }, 120);
  }

  function init() {
    if (!ensureDom()) return;
    remeasureAnchor();
    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      init();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onResize);
    });
  } else {
    init();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
  }
})();

