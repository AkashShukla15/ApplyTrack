import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

const userSchema = new mongoose.Schema({ name:{type:String,required:true,trim:true}, email:{type:String,required:true,unique:true,lowercase:true,trim:true}, passwordHash:{type:String,required:true} }, {timestamps:true});
const appSchema = new mongoose.Schema({
  owner:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
  company:{type:String,required:true,trim:true,maxlength:120},
  role:{type:String,required:true,trim:true,maxlength:120},
  jobUrl:{type:String,trim:true,default:''},
  status:{type:String,enum:['Saved','Applied','Interviewing','Offer','Rejected'],default:'Applied'},
  appliedDate:{type:Date,default:Date.now}, interviewDate:{type:Date,default:null}, notes:{type:String,default:'',maxlength:3000}
},{timestamps:true});
const User = mongoose.model('User', userSchema);
const Application = mongoose.model('Application', appSchema);
const secret = () => process.env.JWT_SECRET || 'development_only_change_me';
const tokenFor = u => jwt.sign({sub:u._id.toString()}, secret(), {expiresIn:'7d'});
const publicUser = u => ({id:u._id,name:u.name,email:u.email});

function auth(req,res,next){
  const h=req.headers.authorization||'';
  try {
    if(!h.startsWith('Bearer ')) throw new Error();
    req.user=jwt.verify(h.slice(7),secret());
    next();
  } catch { res.status(401).json({message:'Please log in again.'}); }
}
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

app.get('/api/health', (_req,res)=>res.json({status:'ok'}));
app.post('/api/auth/register', asyncRoute(async(req,res)=>{
  const name=String(req.body.name||'').trim(), email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
  if(name.length<2) return res.status(400).json({message:'Name must have at least 2 characters.'});
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return res.status(400).json({message:'Enter a valid email.'});
  if(password.length<8) return res.status(400).json({message:'Password must be at least 8 characters.'});
  if(await User.exists({email})) return res.status(409).json({message:'Email already registered.'});
  const u=await User.create({name,email,passwordHash:await bcrypt.hash(password,12)});
  res.status(201).json({token:tokenFor(u),user:publicUser(u)});
}));
app.post('/api/auth/login', asyncRoute(async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||'');
  const u=await User.findOne({email});
  if(!u || !(await bcrypt.compare(password,u.passwordHash))) return res.status(401).json({message:'Email or password is incorrect.'});
  res.json({token:tokenFor(u),user:publicUser(u)});
}));
app.get('/api/auth/me',auth,asyncRoute(async(req,res)=>{
  const u=await User.findById(req.user.sub).select('name email');
  if(!u) return res.status(401).json({message:'Account not found.'});
  res.json({user:publicUser(u)});
}));
app.use('/api/applications',auth);
app.get('/api/applications',asyncRoute(async(req,res)=>{
  const q={owner:req.user.sub}, search=String(req.query.search||'').trim(), status=String(req.query.status||'');
  if(search) { const escaped=search.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'); q.$or=[{company:{$regex:escaped,$options:'i'}},{role:{$regex:escaped,$options:'i'}}]; }
  if(['Saved','Applied','Interviewing','Offer','Rejected'].includes(status)) q.status=status;
  res.json({applications:await Application.find(q).sort({updatedAt:-1}).limit(200)});
}));
app.post('/api/applications',asyncRoute(async(req,res)=>{
  const {company,role,jobUrl='',status='Applied',appliedDate,interviewDate,notes=''}=req.body;
  if(!String(company||'').trim()||!String(role||'').trim()) return res.status(400).json({message:'Company and job title are required.'});
  if(jobUrl && !/^https?:\\/\\//i.test(jobUrl)) return res.status(400).json({message:'Job URL must start with http:// or https://.'});
  const item=await Application.create({owner:req.user.sub,company,role,jobUrl,status,appliedDate:appliedDate||new Date(),interviewDate:interviewDate||null,notes});
  res.status(201).json({application:item});
}));
app.patch('/api/applications/:id',asyncRoute(async(req,res)=>{
  const allowed=['company','role','jobUrl','status','appliedDate','interviewDate','notes'], update={};
  for(const k of allowed) if(req.body[k]!==undefined) update[k]=req.body[k];
  if(update.interviewDate==='') update.interviewDate=null;
  if(update.company!==undefined&&!String(update.company).trim()||update.role!==undefined&&!String(update.role).trim()) return res.status(400).json({message:'Company and role cannot be empty.'});
  const item=await Application.findOneAndUpdate({_id:req.params.id,owner:req.user.sub},{$set:update},{new:true,runValidators:true});
  if(!item) return res.status(404).json({message:'Application not found.'});
  res.json({application:item});
}));
app.delete('/api/applications/:id',asyncRoute(async(req,res)=>{
  const item=await Application.findOneAndDelete({_id:req.params.id,owner:req.user.sub});
  if(!item) return res.status(404).json({message:'Application not found.'});
  res.json({message:'Deleted'});
}));
app.get('/api/dashboard',auth,asyncRoute(async(req,res)=>{
  const owner=new mongoose.Types.ObjectId(req.user.sub);
  const grouped=await Application.aggregate([{$match:{owner}},{$group:{_id:'$status',count:{$sum:1}}}]);
  const counts=Object.fromEntries(grouped.map(x=>[x._id,x.count]));
  res.json({total:grouped.reduce((s,x)=>s+x.count,0),saved:counts.Saved||0,applied:counts.Applied||0,interviewing:counts.Interviewing||0,offers:counts.Offer||0,rejected:counts.Rejected||0});
}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(err.name==='ValidationError'?400:500).json({message:err.name==='ValidationError'?'Please check the submitted fields.':'Server error.'});});
mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/applytrack').then(()=>app.listen(process.env.PORT||5000,()=>console.log('API running on port '+(process.env.PORT||5000)))).catch(e=>{console.error('MongoDB connection failed:',e.message);process.exit(1);});
