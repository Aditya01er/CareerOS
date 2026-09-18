function getCookie(req,name){const h=req.headers.cookie||'';const m=h.match(new RegExp('(?:^|; )'+name+'=([^;]+)'));return m?decodeURIComponent(m[1]):''}
export default async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const code=req.query?.code,state=req.query?.state;
  if(!code||!state||state!==getCookie(req,'careeros_li_state'))return res.status(400).send('LinkedIn OAuth state validation failed. Please start the connection again.');
  const redirect=process.env.LINKEDIN_REDIRECT_URI||((req.headers['x-forwarded-proto']||'https')+'://'+req.headers.host+'/api/linkedin-callback');
  try{
    const tokenRes=await fetch('https://www.linkedin.com/oauth/v2/accessToken',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect,client_id:process.env.LINKEDIN_CLIENT_ID,client_secret:process.env.LINKEDIN_CLIENT_SECRET})});
    const token=await tokenRes.json();
    if(!token.access_token)throw Error(token.error_description||'LinkedIn token exchange failed');
    const pRes=await fetch('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:'Bearer '+token.access_token}});
    const p=await pRes.json();
    if(!pRes.ok)throw Error(p.message||'LinkedIn profile API request failed');
    const safe={sub:p.sub,name:p.name,givenName:p.given_name,familyName:p.family_name,picture:p.picture,email:p.email,locale:p.locale};
    const payload=Buffer.from(JSON.stringify(safe)).toString('base64url');
    res.setHeader('Set-Cookie',['careeros_li_profile='+payload+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600','careeros_li_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
    res.redirect(302,'/?linkedin=connected');
  }catch(e){res.status(502).send('LinkedIn connection failed: '+e.message)}
}