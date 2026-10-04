// Source: npm @anthropic-ai/claude-code-linux-arm64@2.1.287; dist.integrity sha512-MU3ReK1kjstDmjEOzhFZaphh2AVUKnPaik6lOV0WLs3/mOM7mE/mqkdcQ/Sv0KwHH5MnOhSkIjCEl0/8tr+vRg==
// Original: chunk-2sd5rhmn.js; original sha256 625960635957a15a3d4b0c9859fed9f50b57788dd2cecf687b1a1518b055a334
// Extracted payload sha256 (after this four-line header): 363763f3c9f2a7e76aba7f4fc4759337f11f35e2340e8f234e291cf5e911f0cf
// On upstream update, compare these functions and their call sites with the extracted upstream chunk and re-measure its sha256.
// ---- payload ----
const VM=1000;function YM(){let e=a.CLAUDE_CODE_GZIP_REQUEST_BODY_BLOCKS??C(q8,0);return e===1||e===2?e:0}
function KM(e,n,r,s){let h=e.blockStore,{generation:g}=h;return(S)=>{if(!S?.ok||e.blocksBuildGeneration===g)return;e.blocksBuildGeneration=g,n.setTimeout(async()=>{try{if(!e.blocksSwitchedOff&&YM()!==0&&h.generation===g)await P2r(A2r({body:Buffer.from(r),level:s,store:h,clock:n}),h,n,{inBackground:!0,stopIf:()=>e.blocksSwitchedOff!==!1})}catch(w){if(!e.blocksSwitchedOff||w instanceof OXe)QM(w,e,"build_failed")}finally{if(e.blocksBuildGeneration===g)e.blocksBuildGeneration=void 0}},VM,{unref:!0})}}
export{KM,YM};
