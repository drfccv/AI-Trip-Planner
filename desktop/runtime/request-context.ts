export function getRequestExecutionContext(){return{waitUntil(promise:Promise<unknown>){void promise.catch(()=>undefined)}}}
