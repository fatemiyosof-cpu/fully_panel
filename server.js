const express=require('express');
const cors=require('cors');
const crypto=require('crypto');
const {Pool}=require('pg');
const path=require('path');
const app=express();
app.use(cors());
app.use(express.json({limit:'5mb'}));
const PORT=process.env.PORT||10000;
const BASE_URL=(process.env.PUBLIC_BASE_URL||process.env.RENDER_EXTERNAL_URL||'').replace(/\/$/,'');
const ADMIN_KEY=process.env.ADMIN_KEY||'';
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
const mem=new Map();
function id(){return crypto.randomBytes(18).toString('base64url');}
function auth(req,res,next){if(!ADMIN_KEY||req.get('x-admin-key')===ADMIN_KEY)return next();return res.status(401).json({error:'unauthorized'});}
async function init(){if(pool) await pool.query(`CREATE TABLE IF NOT EXISTS subscriptions(id text PRIMARY KEY,panel_name text,profile text,volume text,days text,created_at timestamptz NOT NULL,expires_at timestamptz,status text NOT NULL,configs jsonb NOT NULL DEFAULT '[]'::jsonb)`);}
async function getSub(sid){if(pool){const r=await pool.query('SELECT * FROM subscriptions WHERE id=$1',[sid]);return r.rows[0]||null;}return mem.get(sid)||null;}
async function saveSub(s){if(pool){await pool.query(`INSERT INTO subscriptions(id,panel_name,profile,volume,days,created_at,expires_at,status,configs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET panel_name=EXCLUDED.panel_name,profile=EXCLUDED.profile,volume=EXCLUDED.volume,days=EXCLUDED.days,expires_at=EXCLUDED.expires_at,status=EXCLUDED.status,configs=EXCLUDED.configs`,[s.id,s.panelName,s.profile,s.volume,s.days,s.createdAt,s.expiresAt,s.status,JSON.stringify(s.configs)]);}else mem.set(s.id,s);}
function normalize(body){const configs=Array.isArray(body.configs)?body.configs.map(c=>({name:String(c.name||''),country:String(c.country||''),countryCode:String(c.countryCode||''),data:String(c.data||''),days:String(c.days||''),content:String(c.content||'')})):[];return {panelName:String(body.panelName||''),profile:String(body.profile||''),volume:String(body.volume||''),days:String(body.days||''),configs};}
function publicSub(s){return {subscriptionId:s.id,panelName:s.panelName,profile:s.profile,volume:s.volume,days:s.days,createdAt:s.createdAt,expiresAt:s.expiresAt,status:s.status,configs:s.status==='active'?s.configs:[],url:`${BASE_URL}/sub/${s.id}`};}
app.get('/health',(req,res)=>res.json({ok:true}));
app.post('/api/subscriptions',auth,async(req,res)=>{try{const b=normalize(req.body);if(!b.profile)return res.status(400).json({error:'profile required'});let sid=req.body.subscriptionId||id();let old=await getSub(sid);const days=Math.max(1,Number(b.days)||1);const now=old?.createdAt?new Date(old.createdAt):new Date();const expires=new Date(now.getTime()+days*86400000);const s={id:sid,panelName:b.panelName,profile:b.profile,volume:b.volume,days:b.days,createdAt:now.toISOString(),expiresAt:expires.toISOString(),status:expires>new Date()&&b.configs.length?'active':'disabled',configs:b.configs};await saveSub(s);res.json(publicSub(s));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/subscriptions/:id',async(req,res)=>{const s=await getSub(req.params.id);if(!s)return res.status(404).json({error:'not found'});if(new Date(s.expiresAt)<=new Date()&&s.status==='active'){s.status='expired';await saveSub(s);}res.json(publicSub(s));});
app.delete('/api/subscriptions/:id',auth,async(req,res)=>{const s=await getSub(req.params.id);if(!s)return res.status(404).json({error:'not found'});s.status='disabled';s.configs=[];await saveSub(s);res.json({ok:true});});
app.get('/sub/:id',async(req,res)=>{const s=await getSub(req.params.id);if(!s)return res.status(404).type('text').send('Subscription not found');if(new Date(s.expiresAt)<=new Date()&&s.status==='active'){s.status='expired';await saveSub(s);}if(s.status!=='active')return res.status(410).type('text').send('Subscription expired or disabled');const body=s.configs.map(c=>c.content).filter(Boolean).join('\n\n');res.type('text/plain').send(body);});
app.use(express.static(path.join(__dirname,'public')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'AR.html')));
init().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`listening on ${PORT}`))).catch(e=>{console.error(e);process.exit(1)});
