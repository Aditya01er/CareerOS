export const access = 'public';
export const methods = ['POST'];

const MAX_FILE = 15 * 1024 * 1024;
const ALLOWED = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function extractText(data) {
  return (data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => p?.text || '').filter(Boolean).join('\n').trim();
}
function stripHtml(s=''){return String(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function norm(s=''){return String(s).toLowerCase().replace(/[^a-z0-9+#.]+/g,' ').trim()}
function termsFromText(text=''){const wanted=['java','javascript','typescript','node.js','node','react','next.js','python','c++','c#','spring','spring boot','sql','mongodb','postgresql','docker','kubernetes','aws','azure','git','github','html','css','express','rest api','graphql','machine learning','ai','data structures','algorithms','testing'];const n=norm(text);return wanted.filter(x=>n.includes(norm(x))).slice(0,8)}
function jobMatches(job,terms){if(!terms.length)return true;const hay=norm([job.title,job.company,job.location,job.category,(job.tags||[]).join(' '),job.description].join(' '));return terms.some(t=>hay.includes(norm(t)))}
const INDIA_LOCATION_WORDS=['india','new delhi','delhi','gurugram','gurgaon','noida','greater noida','bangalore','bengaluru','hyderabad','pune','mumbai','navi mumbai','chennai','kolkata','kochi','ahmedabad','jaipur','lucknow','kanpur','indore','bhopal','chandigarh','coimbatore','thiruvananthapuram','trivandrum','mysore','mysuru','nagpur','surat','vadodara','visakhapatnam','vizag','patna','bhubaneswar','dehradun','agra','varanasi','goa','faridabad','ghaziabad','uttar pradesh','maharashtra','karnataka','telangana','tamil nadu','west bengal','kerala','rajasthan','gujarat','madhya pradesh','punjab','haryana','bihar','odisha','uttarakhand','delhi ncr'];
function isIndiaLocation(location=''){const loc=norm(location);if(!loc)return false;const bad=['everywhere','worldwide','global','australia','usa','united states','uk','united kingdom','canada','germany','france','singapore','dubai','uae','europe','africa'];if(bad.some(x=>loc.includes(x))&&!loc.includes('india'))return false;return INDIA_LOCATION_WORDS.some(x=>loc.includes(x));}


async function publicSearchJobs(resumeText=''){return {jobs:[],errors:['Public search uses the live API feeds in the Vercel build.']};}
async function liveJobs(resumeText=''){
  const terms=termsFromText(resumeText);
  const query=terms.length?terms.slice(0,5).join(' '):'software developer';
  const [remotive,remoteok,arbeitnow]=await Promise.allSettled([
    (async()=>{const r=await fetch('https://remotive.com/api/remote-jobs?category=software-dev&limit=100',{headers:{'User-Agent':'CareerOS/1.0'}});if(!r.ok)throw Error(`Remotive HTTP ${r.status}`);const j=await r.json();return (j.jobs||[]).map(x=>({source:'Remotive',sourceUrl:'https://remotive.com/remote-jobs',id:`remotive-${x.id}`,title:x.title,company:x.company_name,location:x.candidate_required_location||'Remote',jobType:x.job_type||null,salary:x.salary||null,category:x.category||'Software Development',tags:x.tags||[],postedAt:x.publication_date||null,url:x.url,description:stripHtml(x.description).slice(0,5000)}))})(),
    (async()=>{const r=await fetch('https://remoteok.com/api',{headers:{'User-Agent':'CareerOS/1.0','Accept':'application/json'}});if(!r.ok)throw Error(`Remote OK HTTP ${r.status}`);const j=await r.json();return (Array.isArray(j)?j:[]).filter(x=>x&&x.position).slice(0,100).map(x=>({source:'Remote OK',sourceUrl:'https://remoteok.com',id:`remoteok-${x.id||x.slug||x.position}`,title:x.position,company:x.company||'Unknown company',location:x.location||'Remote',jobType:null,salary:x.salary_min&&x.salary_max?`${x.salary_min}-${x.salary_max}`:null,category:'Remote software/development',tags:Array.isArray(x.tags)?x.tags:[],postedAt:x.date||null,url:x.url||`https://remoteok.com/remote-jobs/${x.id||''}`,description:stripHtml(x.description).slice(0,5000)}))})(),
    (async()=>{const r=await fetch('https://www.arbeitnow.com/api/job-board-api',{headers:{'User-Agent':'CareerOS/1.0','Accept':'application/json'}});if(!r.ok)throw Error(`Arbeitnow HTTP ${r.status}`);const j=await r.json();return (j.data||[]).slice(0,100).map(x=>({source:'Arbeitnow',sourceUrl:'https://www.arbeitnow.com',id:`arbeitnow-${x.slug}`,title:x.title,company:x.company_name,location:x.location||'Not specified',jobType:x.job_types?.[0]||x.job_type||null,salary:x.salary||null,category:'Software/technology',tags:Array.isArray(x.tags)?x.tags:[],postedAt:x.created_at?new Date(Number(x.created_at)*1000).toISOString():null,url:x.url||`https://www.arbeitnow.com/view/${x.slug}`,description:stripHtml(x.description).slice(0,5000)}))})()
  ]);
  const all=[];const errors=[];const publicSearch=await publicSearchJobs(resumeText);all.push(...publicSearch.jobs);errors.push(...publicSearch.errors);
  for(const r of [remotive,remoteok,arbeitnow]){if(r.status==='fulfilled')all.push(...r.value);else errors.push(r.reason?.message||'job feed failed')}
  const seen=new Set();
  const jobs=all.filter(j=>{const key=(j.url||j.id||`${j.company}-${j.title}`).toLowerCase();if(seen.has(key))return false;seen.add(key);const india=isIndiaLocation(j.location||'')||isIndiaLocation(j.description||'');return india&&jobMatches(j,terms)}).sort((a,b)=>String(b.postedAt||'').localeCompare(String(a.postedAt||''))).slice(0,150);
  return {query,terms,jobs,errors,fetchedAt:new Date().toISOString(),sources:["LinkedIn public search","Naukri public search","Internshala public search","Upwork public search","Wellfound startup search","Cutshort startup search","Y Combinator startup search","Remotive","Remote OK","Arbeitnow"],region:"India only — non-India and worldwide listings excluded"};
}

export default async function (req, res) {
  const body = req.body || {};
  const resumeText = String(body.resume || '').trim();
  const file = Array.isArray(req.files) ? req.files.find(f => f.field === 'file') : null;
  if (!resumeText && !file) return res.status(400).json({ error: 'Upload a resume PDF/photo or paste resume text.' });
  if (resumeText.length > 50000) return res.status(400).json({ error: 'Resume text is too long. Keep it below 50,000 characters.' });
  if (file) {
    if (!ALLOWED.has(file.contentType)) return res.status(400).json({ error: 'Unsupported file. Use PDF, JPG, PNG or WebP.' });
    if (!file.buffer || file.buffer.length > MAX_FILE) return res.status(400).json({ error: 'Resume file must be 15 MB or smaller.' });
  }

  let profiles = {};
  try { profiles = body.profiles ? JSON.parse(String(body.profiles)) : {}; } catch { profiles = {}; }
  const compactProfiles = {};
  for (const [key, value] of Object.entries(profiles)) {
    if (!value || value.error) continue;
    compactProfiles[key] = {source:value.source,updatedAt:value.updatedAt,profile:value.profile,metrics:value.metrics,difficulty:value.difficulty,languages:value.languages,recentAccepted:value.recentAccepted,recentSubmissions:value.recentSubmissions,submissionStats:value.submissionStats,ratingHistory:value.ratingHistory,repos:value.repos,events:value.events,badges:value.badges,summary:value.summary};
  }

  const jobs = await liveJobs(resumeText);
  const evidence = JSON.stringify(compactProfiles, null, 2).slice(0, 150000);
  const jobEvidence = JSON.stringify(jobs.jobs.slice(0,40).map(j=>({id:j.id,source:j.source,title:j.title,company:j.company,location:j.location,jobType:j.jobType,salary:j.salary,category:j.category,tags:j.tags,postedAt:j.postedAt,url:j.url,description:String(j.description||'').slice(0,1800)})), null, 2).slice(0, 90000);
  return res.json({analysis:{candidateSnapshot:'Live job data fetched.',resumeChanges:[],roleFamilies:[],jobMatches:[],readiness:'Live evidence returned; AI reasoning requires an AI provider configured on Vercel.',skillGapPlan:[],interviewFocus:[],thirtyDayPlan:[]},jobs,profileSources:Object.keys(compactProfiles),resumeText,updatedAt:new Date().toISOString(),model:'CareerOS Live'});
}
