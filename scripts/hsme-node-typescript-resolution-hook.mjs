import {
  existsSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import {
  registerHooks,
  stripTypeScriptTypes,
} from 'node:module';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT=realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)),'..'),
);

function withinRepo(path){
  const rel=relative(REPO_ROOT,path);
  return rel===''||(
    !isAbsolute(rel)
    &&rel!=='..'
    &&!rel.startsWith('../')
    &&!rel.startsWith('..\\')
  );
}

registerHooks({
  resolve(specifier,context,nextResolve){
    if(
      context.parentURL?.startsWith('file:')
      &&(specifier.startsWith('./')||specifier.startsWith('../'))
      &&extname(specifier)===''
    ){
      const candidate=new URL(specifier+'.ts',context.parentURL);
      const path=fileURLToPath(candidate);
      if(existsSync(path)){
        const real=realpathSync(path);
        if(withinRepo(real))return nextResolve(candidate.href,context);
      }
    }
    return nextResolve(specifier,context);
  },

  load(url,context,nextLoad){
    if(url.startsWith('file:')&&url.endsWith('.ts')){
      const path=realpathSync(fileURLToPath(url));
      if(withinRepo(path)){
        const source=readFileSync(path,'utf8');
        return {
          format:'module',
          source:stripTypeScriptTypes(source,{mode:'transform'}),
          shortCircuit:true,
        };
      }
    }
    return nextLoad(url,context);
  },
});
