// Bundles src/* into public/index.html and generates api/_lib.js (shared player data and draft rules).
const fs = require('fs'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const js = ['players.js', 'profiles.js', 'engine.js', 'app.js', 'online.js'].map(rd).join('\n;\n');
if (js.includes('</script')) throw new Error('script contains a closing script tag');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Dream Test XI</title>
<meta name="description" content="Draft two all-time Test XIs with a friend and watch a five-day Test play out over by over.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&display=swap">
<style>
:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}
body{margin:0}
[hidden]{display:none!important}
${rd('style.css')}
</style>
</head>
<body>
${rd('body.html')}
<script>
${js}
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), html);
const lib = ['players.js', 'profiles.js'].map(rd).join('\n;\n') + '\nmodule.exports={PLAYERS,ALL_PLAYERS,PLAYER_BY_ID,autoOrder,validateXI,canBowl,draftSide,draftBlock};\n';
fs.writeFileSync(path.join(__dirname, 'api', '_lib.js'), lib);
console.log('built public/index.html', (html.length / 1024).toFixed(0) + ' KB, api/_lib.js');
