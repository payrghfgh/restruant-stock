# Restaurant Stock Manager (No Build Tools)

This is a zero-build, static Firebase app. It runs directly from `public/` with a simple local server.

## Run Local (fastest)
From the project root:

```
cd C:\Users\Rushan\Documents\RPAPP
python -m http.server 5173 --directory public
```

If Python is missing, use Node:

```
node -e "require('http').createServer((req,res)=>{const fs=require('fs');const path=require('path');const url=require('url');let p=url.parse(req.url).pathname; if(p==='/') p='/index.html'; const f=path.join('public', p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('Not found');return;} const ext=path.extname(f).slice(1); const map={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',json:'application/json'}; res.writeHead(200,{'Content-Type':map[ext]||'application/octet-stream'}); res.end(d);});}).listen(5173,()=>console.log('http://localhost:5173'))"
```

Open: http://localhost:5173

## Firebase Setup
1) Enable Email/Password auth in Firebase Console.
2) Create Firestore DB.
3) Set owner UID in Firestore:
   - Document: `settings/owner`
   - Field: `uid` = owner user UID
4) Set user roles:
   - Document: `users/{uid}`
   - Field: `role` = `manager` or `staff`
5) Enable Cloud Messaging and use the Web Push certificate (already in app.js).

## Notes
- This version uses Firebase CDN modules (no npm, no Vite, no CRA).
- The app is fully installable as a PWA.
