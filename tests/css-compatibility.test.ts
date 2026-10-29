import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';

const require=createRequire(import.meta.url);
const rendererRequire=createRequire(require.resolve('@diplodoc/transform'));
const namespace=rendererRequire('css');
// Match TypeScript's __importDefault used by the installed Diplodoc sanitizer.
const css=namespace.__esModule?namespace.default:namespace;
describe('renderer CSS compatibility',()=>{
  it.each([
    ['.note { color: red; font-weight: 600; }','.note {\n  color: red;\n  font-weight: 600;\n}'],
    ['@media (max-width: 600px) { .cell { width: 50%; } }','@media (max-width: 600px) {\n  .cell {\n    width: 50%;\n  }\n}'],
    ['.image { background-image: url("https://example.com/a%20b.png#anchor"); content: "Текст"; }','.image {\n  background-image: url("https://example.com/a%20b.png#anchor");\n  content: "Текст";\n}'],
  ])('preserves established stylesheet output for %s',(input,expected)=>{
    expect(css.stringify(css.parse(input))).toBe(expected);
  });
  it('keeps malformed-percent payloads literal within a bounded subprocess',()=>{
    const program=`const ns=require(process.argv[1]);const css=ns.__esModule?ns.default:ns;let payload='';for(let i=0;i<32000;i++)payload+='%'+Math.floor(i/256).toString(16).padStart(2,'0')+'%'+(i%256).toString(16).padStart(2,'0')+'x';payload+='%zz';const result=css.stringify(css.parse('.image { background-image: url("https://example.com/'+payload+'"); }'));console.log(JSON.stringify({preserved:result.includes(payload),length:result.length}));`;
    const result=JSON.parse(execFileSync(process.execPath,['-e',program,rendererRequire.resolve('css')],{encoding:'utf8',timeout:5000}));
    expect(result.preserved).toBe(true);expect(result.length).toBeGreaterThan(220000);
  });
});
