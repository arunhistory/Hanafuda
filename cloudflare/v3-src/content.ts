import {cors,json} from "./gateway-common.js";

export type ContentKey="terms"|"credits"|"licenses";

const TERMS=`花札 利用規約

本ゲームは無料でご利用いただけるフリーゲームです。

本ゲームは公開前に安全性の確認を行っていますが、プレイおよび利用については各自の責任でお楽しみください。

本ゲームおよび本ゲーム内で使用されているプログラム、画像、文章その他のコンテンツについて、権利者の許可なく転載、再配布、改変して配布することを禁止します。

本ゲームで使用しているライセンスおよびクレジットについては、本利用規約とは別に記載しています。

本ゲームの内容は、予告なく変更、更新、または公開を終了する場合があります。

本ゲームを利用した時点で、本利用規約に同意したものとします。`;

const contentKeys=new Set<ContentKey>(["terms","credits","licenses"]);

export function routeContent(req:Request,env:any,url:URL):Response|null{
  const match=url.pathname.match(/^\/v1\/content\/(terms|credits|licenses)$/);
  if(!match)return null;
  if(req.method!=="GET")return cors(json({ok:false,code:"METHOD_NOT_ALLOWED"},405),req,env);
  const key=match[1] as ContentKey;
  if(!contentKeys.has(key))return cors(json({ok:false,code:"NOT_FOUND"},404),req,env);
  if(key==="terms")return cors(json({key,available:true,revision:1,body:TERMS}),req,env);
  return cors(json({key,available:false,revision:0,body:null}),req,env);
}
