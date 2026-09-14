const CREATOR='ある〜ん';
const CO_CREATOR='由咲るい';
const JOINED=`${CREATOR}・${CO_CREATOR}`;
const CREATOR_PATTERN=/ある〜ん(?!・由咲るい)/g;

function correctAttribution(root:ParentNode):void{
  for(const container of root.querySelectorAll<HTMLElement>('.cloud-document-body')){
    const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
    const nodes:Text[]=[];
    for(let node=walker.nextNode();node;node=walker.nextNode())nodes.push(node as Text);
    for(const node of nodes){
      const current=node.nodeValue??'';
      const corrected=current.replace(CREATOR_PATTERN,JOINED);
      if(corrected!==current)node.nodeValue=corrected;
    }
  }
}

const app=document.querySelector('#app');
if(app){
  const observer=new MutationObserver(()=>correctAttribution(app));
  observer.observe(app,{subtree:true,childList:true,characterData:true});
  correctAttribution(app);
}
