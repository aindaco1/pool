// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
const source=readFileSync('assets/js/admin-dashboard.js','utf8');
const shared=readFileSync('shared/dust-wave-platform/packages/admin-shell/src/editor-media-browser.js','utf8');
function functions(names:string[]) {return names.map(name=>source.match(new RegExp('^  function '+name+'[(][^]*?^  }','m'))![0]).join('\n');}

function editor() {
  class Button {dataset={contentIndex:'0',contentMediaKind:'image'};}
  class Input {value='/chosen.png';dataset={mediaType:'image'};}
  let submit:any;
  const blocks=[{type:'image',src:'old'},{type:'image',src:'other'}];
  const sandbox:any={window:null,HTMLButtonElement:Button,HTMLInputElement:Input,contentBlocks:blocks,
    contentBlocksRoot:{isConnected:true},activeContentJsonField:null,
    activeContentMediaCampaignSlug:()=> 'campaign',t:(_key:string,fallback:string)=>fallback,
    openAdminActionDialog:(_title:any,_render:any,apply:any)=>{submit=apply;},
    runContentEditorAction:(_root:any,_field:any,callback:any)=>callback(),
    pushContentHistory:()=>{},clearPendingContentUpload:()=>{},syncContentJsonFromBlocks:()=>{},
    renderContentBlocks:()=>{},writeContentDraft:()=>{},setText:()=>{},contentEditorStatusTarget:()=>null};
  sandbox.window=sandbox;
  vm.runInNewContext(shared+'\n'+functions(['contentMediaUploadTarget','applyContentMediaLibrarySelection','openContentMediaLibrary']),sandbox);
  sandbox.openContentMediaLibrary(new Button());
  return {blocks,sandbox,apply:()=>submit({querySelector:()=>new Input()})};
}
describe('campaign media target identity',()=>{
  it('applies to the captured block after reorder',async()=>{const e=editor(),original=e.blocks[0];e.blocks.reverse();await e.apply();expect(original.src).toBe('/chosen.png');expect(e.blocks[0].src).toBe('other');});
  it('rejects a deleted block',async()=>{const e=editor();e.blocks.shift();await expect(e.apply()).rejects.toThrow('Unable to apply');expect(e.blocks[0].src).toBe('other');});
  it('rejects detached editors',async()=>{const e=editor();e.sandbox.contentBlocksRoot.isConnected=false;await expect(e.apply()).rejects.toThrow('Unable to apply');});
});
