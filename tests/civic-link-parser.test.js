import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
// Extract only the parser class so the regression check never runs an importer or network call.
test('official-page parsers respect base href and keep absolute external links',()=>{
 const script=`import ast,pathlib,re,urllib.parse
from html.parser import HTMLParser
for name in ['build-land-use.py','build-boards.py','build-resources.py']:
 tree=ast.parse(pathlib.Path('scripts/cal/'+name).read_text())
 cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Links')
 exec(compile(ast.Module(body=[cls],type_ignores=[]),name,'exec'))
 parser=Links();parser.feed('<base href="https://city.example/"><a href="government/council.php">City Council</a><a href="https://agency.example/agendas">Meetings</a>')
 final='https://city.example/departments/planning/index.php'
 urls=[urllib.parse.urljoin(urllib.parse.urljoin(final,parser.base or final),h) for h,t in (parser.links if name=='build-resources.py' else parser.items)]
 assert urls==['https://city.example/government/council.php','https://agency.example/agendas'],urls
 print(name+' OK')`;
 const output=execFileSync('python3',['-c',script],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.match(output,/build-land-use.py OK/);assert.match(output,/build-boards.py OK/);
});
