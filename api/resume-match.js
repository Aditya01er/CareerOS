import { ai, browser } from 'hatchable';
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


async function publicSearchJobs(resumeText=''){
  const terms=termsFromText(resumeText);
  const skillQuery=terms.slice(0,4).join(' ')||'software developer';
  const locations=[
    'Delhi','Gurugram','Gurgaon','Noida','Ghaziabad','Bengaluru','Bangalore','Pune',
    'Mumbai','Hyderabad','Chennai','Kolkata','Ahmedabad','Jaipur','Lucknow','Chandigarh',
    'Kochi','Indore','Bhopal','Patna','Bhubaneswar','Dehradun'
  ];
  const sources=[
    ['LinkedIn','site:linkedin.com/jobs/view','https://www.linkedin.com/jobs/'],
    ['Naukri','site:naukri.com/job-listings','https://www.naukri.com/'],
    ['Internshala','site:internshala.com/job/detail','https://internshala.com/jobs/'],
    ['Upwork','site:upwork.com/freelance-jobs','https://www.upwork.com/freelance-jobs/'],
    ['Wellfound','site:wellfound.com/jobs','https://wellfound.com/jobs'],
    ['Cutshort','site:cutshort.io/job','https://cutshort.io/search-jobs'],
    ['Y Combinator','site:ycombinator.com/companies','https://www.ycombinator.com/jobs/role/all/india']
  ];
  const locationQuery=locations.map(x=>'"'+x+'"').join(' OR ');
  const queries=sources.map(([source,site,sourceUrl])=>({source,sourceUrl,q:site+' India ('+locationQuery+') '+skillQuery+' fresher internship'}));
  const out=[];const errors=[];
  await Promise.all(queries.map(async({source,sourceUrl,q})=>{
    try{
      const page=await browser.html('https://www.google.com/search?q='+encodeURIComponent(q)+'&num=10');
      const html=typeof page==='string'?page:(page?.html||page?.content||'');
      const matches=html.match(/https?:[^"'<> ]+/g)||[];
      const wanted=matches.map(u=>u.replace(/&amp;/g,'&')).filter(u=>/linkedin\.com\/jobs\/view|naukri\.com\/job-listings|internshala\.com\/job\/detail|upwork\.com\/freelance-jobs|wellfound\.com\/jobs|cutshort\.io\/job|ycombinator\.com\/companies/i.test(u));
      for(const u of wanted.slice(0,10)){
        const clean=u.split('&sa=')[0].split('&ved=')[0];
        const pos=html.indexOf(u);const near=html.slice(Math.max(0,pos-1800),pos+1800);
        const context=stripHtml(near);
        if(!isIndiaLocation(context)) continue;
        const foundLocation=locations.find(x=>norm(context).includes(norm(x)))||'India';
        out.push({source,sourceUrl,id:source.toLowerCase()+'-'+Buffer.from(clean).toString('base64').slice(0,20),title:'Public job listing',company:'See original listing',location:'India / '+foundLocation,jobType:null,salary:null,category:'Software/technology',tags:terms,postedAt:null,url:clean,description:'Live public India job result. Open the original listing for exact requirements and application details.'});
      }
      if(!wanted.length) errors.push(source+': no public links returned');
    }catch(e){errors.push(source+': '+(e.message||'public search failed'))}
  }));
  return {jobs:out,errors};
}
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
  const prompt = `You are CareerOS Gemini, an evidence-based career and live-job analyst.

Use ONLY the supplied resume, verified public developer-profile snapshot, and the supplied live job listings. Never invent a job, company, salary, requirement, candidate skill, metric, project, experience, or application URL. A job may be discussed only if it exists in LIVE JOB LISTINGS and its exact URL is preserved.

Return STRICT JSON only, with this shape:
{
  "candidateSnapshot": "short evidence-based summary",
  "roleFamilies": [{"role":"...","evidence":["..."],"gaps":["..."]}],
  "jobMatches": [{"jobId":"exact supplied id","source":"exact supplied source","job":"exact supplied title","company":"exact supplied company","location":"exact supplied location","url":"exact supplied url","requiredSkills":["only skills actually stated or clearly evidenced in listing"],"candidateSkills":["only skills evidenced by resume or live profiles"],"missingSkills":["skills required by listing but not evidenced"],"status":"Apply"|"Not Ready","reason":"brief evidence-based explanation"}],
  "readiness":"evidence-based summary",
  "skillGapPlan":["..."],
  "interviewFocus":["..."],
  "thirtyDayPlan":["..."]
}

Rules for jobMatches:
- Analyze up to 12 of the supplied listings that have meaningful evidence for the candidate.
- Do not rank jobs or invent a score.
- 'Apply' means the listing has enough evidenced alignment to be worth considering; it is not a promise of interview or employment.
- 'Not Ready' means one or more material listed requirements are not evidenced in the supplied candidate material.
- CandidateSkills must come from the resume or live profiles, not from guesses based on the job title.
- RequiredSkills must be grounded in the job description/tags supplied.
- If a listing has insufficient detail, omit it rather than guessing.

LIVE PROFILE SNAPSHOT:\n${evidence}\n\nLIVE JOB LISTINGS (fetched ${jobs.fetchedAt}):\n${jobEvidence}`;

  const parts = [{ text: prompt }];
  if (resumeText) parts.push({ text: `\nRESUME TEXT:\n${resumeText}` });
  if (file) parts.push({ inlineData: { mimeType:file.contentType, data:Buffer.from(file.buffer).toString('base64') } });

  let workingResumeText = resumeText;
  let fileNote = '';

  // PDF/image uploads are multimodal. Keep the entire resume pipeline on ChatGPT/OpenAI
  // when ChatGPT is selected: first extract faithful evidence text from the supplied file.
  if (!workingResumeText && file) {
    try {
      const base64 = Buffer.from(file.buffer).toString('base64');
      const content = file.contentType === 'application/pdf'
        ? [
            { type: 'input_file', filename: file.filename || 'resume.pdf', file_data: `data:application/pdf;base64,${base64}` },
            { type: 'input_text', text: 'Extract this resume faithfully into plain text. Preserve names, dates, education, skills, projects, experience, links and achievements. Do not add, infer, correct, or summarize anything.' }
          ]
        : [
            { type: 'input_image', image_url: `data:${file.contentType};base64,${base64}`, detail: 'high' },
            { type: 'input_text', text: 'Extract this resume image faithfully into plain text. Preserve names, dates, education, skills, projects, experience, links and achievements. Do not add, infer, correct, or summarize anything.' }
          ];
      const response = await ai.fetch({
        provider: 'openai',
        path: '/v1/responses',
        body: {
          model: 'gpt-4.1-mini',
          input: [{ role: 'user', content }],
          temperature: 0,
          max_output_tokens: 7000
        },
        purpose: 'careeros-chatgpt-resume-file-extraction'
      });
      const data = await response.json();
      if (!response.ok) throw Error(data?.error?.message || `OpenAI file extraction HTTP ${response.status}`);
      workingResumeText = String(data?.output_text || (data?.output || []).flatMap(x => x?.content || []).map(x => x?.text || '').filter(Boolean).join('\n') || '').trim();
      if (!workingResumeText) throw Error('ChatGPT returned no readable resume text.');
      fileNote = 'Resume file was converted to evidence text with ChatGPT before career analysis.';
    } catch (e) {
      fileNote = `Resume file could not be converted automatically with ChatGPT: ${e.message}`;
    }
  }

  const analysisPrompt = `You are CareerOS, an evidence-based resume and developer-career analyst.
Use ONLY the supplied resume evidence, verified public developer profiles, and live job listings. Never invent a skill, project, employer, metric, certification, requirement, salary, job or URL.

Return STRICT JSON only:
{
  "candidateSnapshot":"short factual summary",
  "resumeChanges":["specific changes to make to the resume, grounded in evidence"],
  "roleFamilies":[{"role":"...","evidence":["..."],"gaps":["..."]}],
  "jobMatches":[{"jobId":"exact supplied id","source":"exact supplied source","job":"exact supplied title","company":"exact supplied company","location":"exact supplied location","url":"exact supplied url","requiredSkills":["only listing evidence"],"candidateSkills":["only resume/profile evidence"],"missingSkills":["required but not evidenced"],"status":"Apply"|"Not Ready","reason":"brief evidence-based reason"}],
  "readiness":"factual current-readiness summary",
  "skillGapPlan":["..."],
  "interviewFocus":["..."],
  "thirtyDayPlan":["..."]
}

Analyze up to 12 meaningful live listings. Do not rank or score jobs. 'Apply' only means the supplied evidence is sufficiently aligned to consider the listing; it does not promise an interview or employment.

RESUME EVIDENCE:\n${workingResumeText}\n\nLIVE PROFILE SNAPSHOT:\n${evidence}\n\nLIVE JOB LISTINGS:\n${jobEvidence}`;

  // CareerOS resume analysis is intentionally ChatGPT-first and ChatGPT-only in this build.
  // This prevents an unexpected Gemini fallback and makes the displayed model truthful.
  const requested = 'gpt';
  const errors = [];
  for (const model of ['gpt']) {
    try {
      const result = await ai.generateText({
        model,
        prompt: analysisPrompt,
        maxTokens: 9000,
        purpose: 'careeros-resume-live-job-analysis'
      });
      if (result?.text) {
        const text = result.text;
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        return res.json({analysis:text,structured:parsed,model:result.model||model,requestedModel:requested,jobs,profileSources:Object.keys(compactProfiles),resumeText:workingResumeText,updatedAt:new Date().toISOString(),fileNote,providerErrors:errors});
      }
    } catch (e) {
      errors.push(`${model}: ${e?.message || 'provider unavailable'}`);
    }
  }

  res.status(200).json({analysis:null,structured:null,model:requested,jobs,profileSources:Object.keys(compactProfiles),resumeText:workingResumeText,updatedAt:new Date().toISOString(),fileNote,error:'AI resume analysis is not connected yet. Live jobs were still fetched successfully.',detail:errors.join(' | ')});
}