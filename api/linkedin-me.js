export default async function(req,res){
  const h=req.headers.cookie||'';
  const m=h.match(/(?:^|; )careeros_li_profile=([^;]+)/);
  if(!m)return res.status(200).json({connected:false});
  try{return res.status(200).json({connected:true,profile:JSON.parse(Buffer.from(decodeURIComponent(m[1]),'base64url').toString('utf8'))})}
  catch{return res.status(200).json({connected:false})}
}