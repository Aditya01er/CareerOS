function cookieState(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}
export default async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const id=process.env.LINKEDIN_CLIENT_ID;
  if(!id)return res.status(503).json({error:'LinkedIn OAuth is not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in Vercel environment variables.'});
  const state=cookieState();
  const redirect=process.env.LINKEDIN_REDIRECT_URI||((req.headers['x-forwarded-proto']||'https')+'://'+req.headers.host+'/api/linkedin-callback');
  res.setHeader('Set-Cookie','careeros_li_state='+state+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  const q=new URLSearchParams({response_type:'code',client_id:id,redirect_uri:redirect,scope:'openid profile email',state});
  res.redirect(302,'https://www.linkedin.com/oauth/v2/authorization?'+q.toString());
}