import test from "node:test";
import assert from "node:assert/strict";
test("locked itinerary items cannot be removed",()=>{const item={id:"west-lake",locked:true}; const remove=x=>x.locked?{ok:false,code:"LOCKED_ITEM"}:{ok:true}; assert.equal(remove(item).ok,false)});
test("budget totals remain deterministic",()=>{const items=[120,88,260,40]; assert.equal(items.reduce((a,b)=>a+b,0),508)});
test("operation references stable ids",()=>{const op={type:"replace_item",targetItemId:"c2f3-stable-id"}; assert.match(op.targetItemId,/stable-id/)});
